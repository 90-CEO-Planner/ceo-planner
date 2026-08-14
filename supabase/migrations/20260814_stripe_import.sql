-- Phase 2, Pro item 1: read-only sales import from the user's own Stripe account.
--
-- Why these live in real tables rather than in the `user_data` JSON blob:
-- the blob is written wholesale by the browser on every save. A sync job writing
-- into it would have to read-modify-write the whole document, and any save the
-- user made in between would be silently overwritten. Imported sales are owned by
-- the server, kept separately, and merged by the client at read time.

-- One connected Stripe account per user. We store the account id, not an API key:
-- calls are made with the platform secret key plus a Stripe-Account header, so a
-- leak of this table exposes no credentials.
create table if not exists public.stripe_connections (
  user_id uuid primary key references auth.users on delete cascade,
  stripe_account_id text not null,
  scope text,
  livemode boolean not null default true,
  connected_at timestamptz not null default timezone('utc', now()),
  last_synced_at timestamptz,
  last_sync_error text
);

alter table public.stripe_connections enable row level security;

-- Read-only from the browser. Connecting and disconnecting go through the edge
-- function, so nothing client-side can point an account id at another user.
create policy "Users can view own stripe connection"
  on public.stripe_connections for select
  using ( auth.uid() = user_id );

-- Sales pulled from Stripe. `external_id` is the Stripe charge id and the unique
-- constraint is what makes a re-sync idempotent — without it, syncing twice would
-- double every figure in the app.
create table if not exists public.imported_sales (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  source text not null default 'stripe',
  external_id text not null,
  amount numeric(12,2) not null,
  currency text not null,
  occurred_at timestamptz not null,
  description text,
  customer_email text,
  refunded boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  unique (user_id, source, external_id)
);

create index if not exists imported_sales_user_occurred_idx
  on public.imported_sales (user_id, occurred_at desc);

alter table public.imported_sales enable row level security;

create policy "Users can view own imported sales"
  on public.imported_sales for select
  using ( auth.uid() = user_id );

-- Short-lived CSRF tokens for the OAuth handshake. Stripe hands `state` back to
-- the callback, which is the only way the callback knows which user it is acting
-- for. Without this a stranger could complete the flow and attach their Stripe
-- account to somebody else's planner.
create table if not exists public.stripe_oauth_states (
  state text primary key,
  user_id uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.stripe_oauth_states enable row level security;
-- No policies at all: service-role only. The browser never reads or writes these.

grant select on public.stripe_connections to authenticated;
grant select on public.imported_sales to authenticated;
grant all on public.stripe_connections to service_role;
grant all on public.imported_sales to service_role;
grant all on public.stripe_oauth_states to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Added same day (migration `imported_sales_attribution`).
--
-- Attribution is captured from the first import even though nothing populates it
-- yet: landing pages will eventually pass ?utm_source through to Stripe as
-- client_reference_id or metadata, and starting to record it only from that day
-- would leave a permanent blind spot over every sale imported before it.
--
-- invoice_id is here because the real product name lives on the invoice line
-- items, not on the charge — charge.description reads "Subscription update" for
-- every subscription payment, which would make a revenue-by-offer breakdown
-- worse than useless.
alter table public.imported_sales
  add column if not exists client_reference_id text,
  add column if not exists metadata jsonb,
  add column if not exists invoice_id text,
  add column if not exists payment_intent_id text;
