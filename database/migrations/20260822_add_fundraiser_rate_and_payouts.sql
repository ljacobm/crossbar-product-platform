-- Phase 4B: Online Store Sales Dashboard support.
-- Purely additive: one new column on online_stores, one new table. No
-- existing table, column, row, or constraint is dropped or altered.

-- Store-level fundraiser percentage, stored as a fraction (0.20 = 20%),
-- not a whole number. numeric(5,4) allows up to 999.99% with four decimal
-- places of precision (e.g. 0.1750 for a future 17.5% rate) -- more
-- headroom than any realistic rate needs, but costs nothing and avoids a
-- future migration if rates ever get finer-grained than whole percentage
-- points. Defaults to 0.20 since that's the current rate for most stores;
-- override per-store as needed.
alter table online_stores
  add column if not exists fundraiser_rate numeric(5,4) not null default 0.20;

-- Fundraiser payout ledger -- an audit trail, not a running total. Every
-- check/credit is its own row; the fundraiser balance is always derived as
-- (fundraiser earned) - (sum of these rows) in application code, never
-- stored directly on online_stores.
create table if not exists online_store_payouts (
  id bigserial primary key,
  online_store_id bigint not null references online_stores(id) on delete cascade,
  payout_date date not null,
  amount numeric(10,2) not null,
  payment_type text,
  reference text,
  notes text,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

-- Row Level Security: enabled, zero policies -- same posture as every
-- other table in the Shopify sales module. Reads/writes go through
-- supabaseAdmin inside a "use server" module only (see
-- frontend/lib/onlineStoreSalesData.ts / onlineStorePayoutActions.ts).
alter table online_store_payouts enable row level security;

create index if not exists idx_online_store_payouts_store on online_store_payouts(online_store_id);
create index if not exists idx_online_store_payouts_date on online_store_payouts(payout_date);
