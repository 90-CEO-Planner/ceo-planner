-- Phase 2, Pro item 10: read-only sales import from the user's own PayPal account.
--
-- The second processor for item 1. Deliberately a mirror of the Stripe pair
-- (20260814_stripe_import.sql and 20260814_stripe_credentials.sql) rather than a
-- generalisation of them: the two credentials behave differently enough that one
-- table with a `provider` column would have needed nullable columns for whichever
-- side did not use them, and the Stripe tables are live with real rows in them.
--
-- NOTE: `imported_sales` needs NO migration. It already carries `source` and its
-- uniqueness constraint is already (user_id, source, external_id), so PayPal rows
-- coexist with Stripe rows in the same table with no schema change at all. That
-- was designed in on 14 Aug 2026 and this is the day it pays off.

-- The credential. Its own table, service-role only, for exactly the reason
-- stripe_credentials is: paypal_connections carries a user SELECT policy, so
-- anything stored there is readable by the browser, and a secret must not be.
--
-- RLS on with NO policies at all. Nothing but an edge function can read this.
create table if not exists public.paypal_credentials (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- PayPal's credential is a PAIR, unlike Stripe's single restricted key. Both
  -- halves are required to mint an access token, and neither is useful alone.
  client_id text not null,
  client_secret text not null,
  -- Which PayPal host these credentials belong to. Sandbox credentials are
  -- rejected by the live API and vice versa, and nothing in the credential
  -- itself says which is which, so paypal-connect works it out once by trying
  -- and records the answer here rather than guessing again on every sync.
  environment text not null default 'live' check (environment in ('live', 'sandbox')),
  -- Shown in the UI so someone can tell which app is connected without the
  -- secret ever being sent back to the browser.
  client_id_last4 text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.paypal_credentials enable row level security;

-- One connected PayPal account per user. Holds no credential.
create table if not exists public.paypal_connections (
  user_id uuid primary key references auth.users on delete cascade,
  -- PayPal's merchant account number, read off the transaction search response.
  -- 'unknown' when the account has no transactions yet to read it from, which is
  -- a perfectly usable connection — same tolerance as stripe_connections.
  paypal_account_id text not null,
  -- The space-separated scope list PayPal actually granted, stored verbatim.
  --
  -- This is the honest record of how much power the credential has. Stripe's
  -- restricted key announces itself in its prefix; PayPal's does not, and the
  -- only place the truth appears is the token response. Storing it means the
  -- Account card can tell the user what their own credential can do, and means
  -- a later tightening of policy can be checked against real connections
  -- instead of assumptions.
  granted_scopes text,
  -- True when the granted scopes are read-only. False means the REST app also
  -- carries payment or payout permissions, which the user is told about.
  read_only boolean not null default true,
  livemode boolean not null default true,
  connected_at timestamptz not null default timezone('utc', now()),
  last_synced_at timestamptz,
  last_sync_error text
);

alter table public.paypal_connections enable row level security;

-- Read-only from the browser. Connecting and disconnecting go through the edge
-- function, so nothing client-side can point an account id at another user.
create policy "Users can view own paypal connection"
  on public.paypal_connections for select
  using ( auth.uid() = user_id );

grant select on public.paypal_connections to authenticated;
grant all on public.paypal_connections to service_role;
grant all on public.paypal_credentials to service_role;
