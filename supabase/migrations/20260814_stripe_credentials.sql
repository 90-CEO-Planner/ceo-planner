-- Per-user restricted Stripe API keys, replacing the Connect OAuth handshake.
--
-- Why the switch: Stripe has retired the Standard/OAuth path for new platforms.
-- There is no client_id to be had on a platform created today - the Connect
-- settings pages simply do not offer one, confirmed against five separate URLs
-- including the one Stripe's own docs give. So the user creates a restricted,
-- read-only key in their own dashboard and pastes it in instead.
--
-- Deliberately its own table rather than a column on stripe_connections, because
-- that table carries a user SELECT policy ("Users can view own stripe connection")
-- so anything stored there is readable by the browser. A credential must not be.
--
-- RLS on with NO policies at all: service role only, the same deliberate pattern
-- as stripe_oauth_states and ai_usage. Nothing but an edge function can read this.

create table if not exists public.stripe_credentials (
  user_id uuid primary key references auth.users(id) on delete cascade,
  api_key text not null,
  -- Shown in the UI so someone can tell which key is connected without the key
  -- itself ever being sent back to the browser.
  key_last4 text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.stripe_credentials enable row level security;
