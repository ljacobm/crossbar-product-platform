-- Phase 4D, Slice 4B: persistent, staff-retrievable customer portal
-- links. One new nullable column, plus the existing rotation function
-- replaced with a new 4-argument version -- see the correction notes
-- below for why this requires an explicit DROP (not just
-- CREATE OR REPLACE) and in-function validation of the new argument.
-- No existing table/column/policy/grant/RLS posture is weakened: no new
-- table, no new RLS policy, and no new anonymous/authenticated grant
-- anywhere in this file.
--
-- DO NOT RUN YET. Staged for review alongside the Slice 4B code changes.
--
-- Wrapped in BEGIN/COMMIT so the column addition, the function
-- drop-and-replace, and the privilege statements all apply as one
-- atomic unit -- Postgres DDL is fully transactional, so if anything
-- below failed partway, the whole migration rolls back rather than
-- leaving the schema in a half-applied state (e.g. the new column
-- present but the old function not yet dropped).
begin;

-- Today, online_store_portal_tokens stores only token_hash -- the raw
-- token is never persisted anywhere, so once the one-time post-
-- generation display is dismissed, staff have no way to recover the
-- same URL again; the only recourse is regeneratePortalLink(), which
-- invalidates the old link and hands out a new one. This migration adds
-- a second, independent, encrypted copy of the raw token -- sufficient
-- for staff to retrieve and re-display the *same* active link later,
-- but never stored in a form that is useful without the server-side
-- encryption key (see lib/portalTokenCrypto.ts for the AES-256-GCM
-- encrypt/decrypt implementation and lib/portalTokens.ts for the
-- `server-only`-guarded re-export application code actually imports).
--
-- encrypted_token is TEXT, not BYTEA: it holds base64(iv || authTag ||
-- ciphertext) from Node's crypto module, which is a plain string --
-- storing it as text avoids any bytea hex-encoding plumbing through
-- PostgREST/supabase-js. It is still opaque ciphertext, never the raw
-- token or anything resembling plaintext.
--
-- Nullable at the column level, with no backfill for existing rows: an
-- already-existing active token's raw value was never stored anywhere
-- (by design, for Slices 1-4A), so there is nothing to encrypt
-- retroactively. encrypted_token simply stays NULL for every row that
-- existed before this migration. Application code
-- (generatePortalLink/regeneratePortalLink) now REQUIRES a valid
-- PORTAL_TOKEN_ENCRYPTION_KEY and a successful encryption before
-- calling this function at all, and the function body itself also
-- rejects a NULL/empty p_encrypted_token (see below) -- so after this
-- migration ships, the only rows that can ever have encrypted_token =
-- NULL are these pre-existing ones. They remain fully valid for
-- customer access via token_hash exactly as before, just not
-- retrievable by staff as a persistent copy-able URL until the store's
-- link is regenerated.
alter table public.online_store_portal_tokens
  add column if not exists encrypted_token text;

-- CORRECTION: appending a new parameter to
-- rotate_online_store_portal_token changes its argument-TYPE signature
-- from (bigint, text, timestamptz) to a 4-argument one. Postgres
-- identifies a function by (schema, name, parameter types) -- NOT by
-- name plus defaults -- so CREATE OR REPLACE FUNCTION with a different
-- parameter-type list does NOT replace the existing 3-argument
-- function in place; it creates a SECOND, separate, co-existing
-- overload with its own OID, leaving both callable side by side.
--
-- Two overloads of the same RPC name is also specifically unsafe for
-- PostgREST: when a call could be satisfied by more than one overload,
-- PostgREST raises an ambiguous-function error (PGRST203) rather than
-- guessing which one to invoke. Leaving the old overload in place is
-- also just an unintended callable surface in its own right.
--
-- The fix is to explicitly DROP the exact old 3-argument signature
-- before creating the new one, so exactly one function with this name
-- exists afterward. Dropping a function also drops its own
-- grants/revokes with it -- there is nothing left over to separately
-- clean up on the old signature.
drop function if exists public.rotate_online_store_portal_token(bigint, text, timestamptz);

-- p_encrypted_token has NO default value (unlike p_expires_at) --
-- every caller must now explicitly supply it; there is no "default to
-- an unencrypted/absent copy" path left at the database layer either,
-- matching the Slice 4B correction that made encryption mandatory in
-- application code. (p_encrypted_token is declared before p_expires_at
-- below, not after -- Postgres requires every parameter with a DEFAULT
-- to come after every parameter without one, and only p_expires_at has
-- a default. This reordering does not affect the application call
-- site, which invokes this RPC with named arguments via supabase-js'
-- .rpc(), not positionally.)
--
-- The UPDATE that deactivates the previous active token also clears
-- that row's encrypted_token -- rotating (regenerating) a link
-- immediately removes the old link's retrievable encrypted copy, not
-- just its usability (which active = false already handled). This
-- mirrors the same requirement enforced for revokePortalLink's plain
-- UPDATE in application code (untouched by this migration, since it
-- already runs as a direct supabaseAdmin.update() against this table,
-- not through this function) -- token hash, expiration, and revocation
-- behavior are otherwise unchanged from the Slice 1 version.
--
-- p_encrypted_token is validated (rejecting NULL and the empty string)
-- BEFORE the SELECT ... FOR UPDATE lock on online_stores and therefore
-- before the deactivation UPDATE -- a validation failure raises an
-- exception immediately, with no row locked and no existing token
-- touched. security invoker (explicit, not the implicit default) and
-- set search_path = '' remain in effect; the FOR UPDATE lock still
-- serializes concurrent rotation attempts for the same store, so
-- rotation remains fully atomic.
create or replace function public.rotate_online_store_portal_token(
  p_online_store_id bigint,
  p_token_hash text,
  p_encrypted_token text,
  p_expires_at timestamptz default null
)
returns table (id bigint, created_at timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_store_id bigint;
begin
  if p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid token hash format';
  end if;

  if p_encrypted_token is null or length(p_encrypted_token) = 0 then
    raise exception 'encrypted token must not be null or empty';
  end if;

  select s.id into v_store_id
  from public.online_stores as s
  where s.id = p_online_store_id
  for update;

  if v_store_id is null then
    raise exception 'online store % does not exist', p_online_store_id;
  end if;

  update public.online_store_portal_tokens
  set active = false,
      encrypted_token = null
  where online_store_id = p_online_store_id
    and active = true;

  return query
  insert into public.online_store_portal_tokens as t
    (online_store_id, token_hash, expires_at, encrypted_token)
  values (p_online_store_id, p_token_hash, p_expires_at, p_encrypted_token)
  returning t.id, t.created_at;
end;
$$;

-- Exactly one signature now exists for this function name (the old
-- 3-argument one was dropped above), so this is the only grant/revoke
-- pair needed -- no stale grant on a now-nonexistent overload, and no
-- new anonymous or authenticated permission anywhere: PUBLIC, anon, and
-- authenticated are explicitly revoked, and only service_role is
-- granted EXECUTE, matching the Slice 1 posture exactly. No new table
-- and no new RLS policy are introduced anywhere in this file either --
-- online_store_portal_tokens' existing RLS posture (enabled, zero
-- anon/authenticated policies, zero anon/authenticated table/sequence
-- grants) is untouched.
revoke all on function public.rotate_online_store_portal_token(bigint, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.rotate_online_store_portal_token(bigint, text, text, timestamptz) to service_role;

commit;
