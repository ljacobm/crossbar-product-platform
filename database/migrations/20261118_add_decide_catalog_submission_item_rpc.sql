-- Online Store Catalog Builder: atomic staff decision on one submission
-- item (approve/reject + baseline mutation + parent submission status
-- recompute, all in one transaction).
--
-- Replaces three sequential, unlocked Supabase round-trips in
-- decideCatalogSubmissionItem() (frontend/lib/onlineStoreCatalogBuilderData.ts)
-- that were previously documented as an "intentional, documented
-- simplification given this is a staff-only, one-item-at-a-time review
-- action" -- a live defect reproduction (two concurrent decisions on
-- different items of the same submission) showed that simplification
-- was not actually safe: both reads of the sibling items' decisions
-- could happen before either write landed, so the LATER status update
-- to commit could silently overwrite the status the other decision had
-- just computed with a stale value.
--
-- LOCK ORDERING: every call locks the parent submission row (FOR
-- UPDATE) before the item row (FOR UPDATE), and only ever in that
-- order -- never the reverse. Two concurrent calls deciding two
-- DIFFERENT items of the SAME submission therefore serialize
-- deterministically on the submission-row lock (one proceeds
-- start-to-finish, including its own status recompute, before the
-- other even reaches its item lock) -- no circular wait is possible
-- since no call ever acquires these two locks in the opposite order.
--
-- IDEMPOTENCY / DOUBLE-DECISION RACE: after acquiring both locks, the
-- item's CURRENT decision is checked. If it is no longer 'pending'
-- (a double-click, a second open tab, or a second reviewer already
-- decided it while this call was waiting on the lock), this function
-- does not re-apply the decision or touch the baseline a second time --
-- it reports back what the item's decision and the submission's status
-- already are, as a graceful outcome, not a generic error. This mirrors
-- submitCustomerCatalogForReview()'s "already-pending" outcome pattern
-- (see 20261114_add_unique_active_catalog_submission_per_store.sql) at
-- the single-item granularity.
--
-- Security/grant posture matches every other RPC in this schema:
-- security invoker, service-role-only execute -- callers always go
-- through requireStaffSession()-gated "use server" code
-- (frontend/lib/onlineStoreCatalogBuilderData.ts), never directly.
create or replace function public.decide_catalog_submission_item(
  p_item_id bigint,
  p_decision text,
  p_notes text,
  p_decided_by text
)
returns table (
  outcome text,
  item_decision text,
  submission_status text
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_submission_id bigint;
  v_online_store_id bigint;
  v_style_id bigint;
  v_color text;
  v_change_type text;
  v_current_decision text;
  v_now timestamptz := now();
  v_decisions text[];
  v_new_status text;
begin
  if p_decision not in ('approved', 'rejected') then
    raise exception 'invalid decision: %', p_decision;
  end if;

  select submission_id into v_submission_id
  from public.online_store_catalog_submission_items
  where id = p_item_id;

  if v_submission_id is null then
    raise exception 'submission item % does not exist', p_item_id;
  end if;

  -- Lock #1 (submission, always first): serializes concurrent
  -- decisions across different items of the same submission.
  select online_store_id into v_online_store_id
  from public.online_store_catalog_submissions
  where id = v_submission_id
  for update;

  -- Lock #2 (item, always second): guards this specific item's
  -- decision/baseline mutation against a second concurrent call for
  -- the SAME item (double-click, second tab, second reviewer).
  select approved_catalog_style_id, color_name, change_type, decision
  into v_style_id, v_color, v_change_type, v_current_decision
  from public.online_store_catalog_submission_items
  where id = p_item_id
  for update;

  if v_current_decision <> 'pending' then
    select status into v_new_status
    from public.online_store_catalog_submissions
    where id = v_submission_id;
    return query select 'already-decided'::text, v_current_decision, v_new_status;
    return;
  end if;

  update public.online_store_catalog_submission_items
  set decision = p_decision,
      decision_notes = p_notes,
      decided_by = p_decided_by,
      decided_at = v_now
  where id = p_item_id;

  if p_decision = 'approved' then
    if v_change_type = 'added' then
      insert into public.online_store_catalog_baseline
        (online_store_id, approved_catalog_style_id, color_name, approved_at, approved_by)
      values (v_online_store_id, v_style_id, v_color, v_now, p_decided_by)
      on conflict (online_store_id, approved_catalog_style_id, color_name)
      do update set approved_at = v_now, approved_by = p_decided_by;
    else
      delete from public.online_store_catalog_baseline
      where online_store_id = v_online_store_id
        and approved_catalog_style_id = v_style_id
        and color_name = v_color;
    end if;
  end if;

  select array_agg(decision) into v_decisions
  from public.online_store_catalog_submission_items
  where submission_id = v_submission_id;

  if 'pending' = any(v_decisions) then
    v_new_status := 'pending';
  elsif 'approved' = any(v_decisions) and 'rejected' = any(v_decisions) then
    v_new_status := 'partially_approved';
  elsif 'approved' = any(v_decisions) then
    v_new_status := 'approved';
  else
    v_new_status := 'rejected';
  end if;

  update public.online_store_catalog_submissions
  set status = v_new_status,
      reviewed_by = p_decided_by,
      reviewed_at = v_now
  where id = v_submission_id;

  return query select 'applied'::text, p_decision, v_new_status;
end;
$$;

revoke all on function public.decide_catalog_submission_item(bigint, text, text, text) from public, anon, authenticated;
grant execute on function public.decide_catalog_submission_item(bigint, text, text, text) to service_role;
