-- Run this in your Supabase SQL Editor

-- 1. Create a table for public profiles linked to Stripe
create table public.profiles (
  id uuid references auth.users on delete cascade not null primary key,
  email text not null,
  stripe_customer_id text,
  subscription_status text default 'incomplete',
  subscription_price_id text,
  -- Which feature set a PAYING account gets: 'base' or 'pro'. Written by the
  -- Stripe webhook from the price they bought. Trials ignore this column
  -- entirely — the 14-day trial always runs on Pro (see js/supabaseClient.js),
  -- so a locked feature is always something the user has already had rather
  -- than something they have never seen.
  plan_tier text not null default 'base' check (plan_tier in ('base', 'pro')),
  -- End of the app-managed 14-day free trial.
  --
  -- The default is load-bearing. This column had none until 19 Aug 2026 and
  -- nothing on the signup path set it, so every profile was created NULL — and
  -- every access check read NULL as "no end date, so no expiry". The result was
  -- unlimited free Pro for everyone, forever. A NULL now DENIES access on a
  -- trialing row, so nothing may write one onto a trial. See
  -- migrations/20260819_trial_expiry_and_comp_pro.sql.
  trial_ends_at timestamp with time zone default (timezone('utc', now()) + interval '14 days'),
  -- Manually granted Pro, independent of what was paid for. Nothing in the
  -- Stripe or PayPal path writes this column, which is exactly the point: a
  -- comp written into plan_tier would be overwritten by the webhook the moment
  -- the person subscribed to Base. Set by hand only.
  comp_pro boolean not null default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Turn on Row Level Security (RLS)
alter table public.profiles enable row level security;

-- 3. Create RLS Policies so users can only read their OWN profile
create policy "Users can view own profile"
  on profiles for select
  using ( auth.uid() = id );

-- 5. Create a table for allowed signups (emails that have paid but not registered yet)
create table public.allowed_signups (
  email text not null primary key,
  stripe_customer_id text not null,
  subscription_status text default 'trialing',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Turn on RLS for allowed_signups
alter table public.allowed_signups enable row level security;

-- No default SELECT permissions for anonymous users. Instead, use SECURITY DEFINER RPC.
-- NOTE: signup is no longer gated on this. Anyone can create an account and gets
-- a 14-day card-free trial. This is kept only so the Stripe path can still tell
-- whether someone paid before registering.
create or replace function public.check_allowed_signup(email_to_check text)
returns boolean
security definer
as $$
begin
  return exists (
    select 1 from public.allowed_signups where lower(email) = lower(email_to_check)
  );
end;
$$ language plpgsql;

-- Single source of truth for "is this person allowed to use the app?".
-- Server-side only. The chat function now calls consume_ai_quota instead, which
-- does this check and consumes quota in one atomic call; this is kept for other
-- edge functions and for querying access without spending an AI call.
create or replace function public.has_active_access(p_user_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select coalesce(
    (
      select
        coalesce(p.comp_pro, false)
        or p.subscription_status = 'active'
        or (
          p.subscription_status = 'trialing'
          and p.trial_ends_at is not null
          and p.trial_ends_at > timezone('utc', now())
        )
      from public.profiles p
      where p.id = p_user_id
    ),
    false
  );
$$;

-- NOTE: once migrations/20260818_account_access.sql and
-- 20260819_trial_expiry_and_comp_pro.sql have run, this function is replaced by
-- a one-line wrapper around account_access(), which is the single definition of
-- the rule above. The copy here only has to be right for a fresh install.

-- Grants are set together further down, after all the functions exist.

-- Daily AI call counter, so one account cannot run up the OpenAI bill.
create table public.ai_usage (
  user_id uuid references auth.users on delete cascade not null,
  day date not null default (timezone('utc', now()))::date,
  calls integer not null default 0,
  primary key (user_id, day)
);

-- RLS on with no policies at all: only security-definer functions and the
-- service role can touch this. The browser cannot read or write it.
alter table public.ai_usage enable row level security;

-- Single call that answers "is this person allowed to use the AI right now?".
-- It checks the subscription AND consumes a unit of the daily allowance, so the
-- chat edge function cannot accidentally do one without the other.
-- To change the daily limits, edit the defaults below.
--
-- Three rates, because Pro item 4 fires model calls from the dashboard and the
-- planner without being asked, rather than only when somebody types into the
-- chat widget:
--
--   trialing        ->  30/day
--   active + base   -> 120/day
--   active + pro    -> 300/day
--
-- A trial resolves to the 'pro' tier for feature purposes but keeps the trial
-- rate. That is the batch 8 rule: a trial grants Pro features, never Pro spend.
--
-- One place that decides what a plan's daily limit is, so consume_ai_quota and
-- get_ai_quota_status below cannot drift into disagreeing about the same
-- account — the app would then show one number while the server enforced another.
create or replace function public.ai_daily_limit(
  p_status text,
  p_tier text,
  p_trial_limit integer default 30,
  p_paid_limit integer default 120,
  p_pro_limit integer default 300
)
returns integer
language sql
immutable
as $$
  select case
    when p_status = 'active' and p_tier = 'pro' then p_pro_limit
    when p_status = 'active' then p_paid_limit
    else p_trial_limit
  end;
$$;

create or replace function public.consume_ai_quota(
  p_user_id uuid,
  p_trial_limit integer default 30,
  p_paid_limit integer default 120,
  p_pro_limit integer default 300
)
returns table (allowed boolean, reason text, used integer, quota integer, tier text)
language plpgsql
security definer set search_path = public
as $$
declare
  v_status text;
  v_trial_ends timestamptz;
  v_tier text;
  v_has_access boolean;
  v_limit integer;
  v_used integer;
begin
  select p.subscription_status, p.trial_ends_at, coalesce(p.plan_tier, 'base')
  into v_status, v_trial_ends, v_tier
  from public.profiles p
  where p.id = p_user_id;

  if not found then
    return query select false, 'no_profile'::text, 0, 0, 'base'::text;
    return;
  end if;

  v_has_access :=
    v_status = 'active'
    or (v_status = 'trialing' and (v_trial_ends is null or v_trial_ends > timezone('utc', now())));

  if not v_has_access then
    return query select false, 'no_access'::text, 0, 0, v_tier;
    return;
  end if;

  if v_status = 'trialing' then
    v_tier := 'pro';
  end if;

  v_limit := public.ai_daily_limit(v_status, v_tier, p_trial_limit, p_paid_limit, p_pro_limit);

  -- Atomic increment. The WHERE on the conflict branch means a user already at
  -- the limit updates no row, so nothing is returned and v_used stays null.
  insert into public.ai_usage as u (user_id, day, calls)
  values (p_user_id, (timezone('utc', now()))::date, 1)
  on conflict (user_id, day) do update
    set calls = u.calls + 1
    where u.calls < v_limit
  returning u.calls into v_used;

  if v_used is null then
    select u.calls into v_used
    from public.ai_usage u
    where u.user_id = p_user_id and u.day = (timezone('utc', now()))::date;

    return query select false, 'rate_limited'::text, coalesce(v_used, v_limit), v_limit, v_tier;
    return;
  end if;

  return query select true, 'ok'::text, v_used, v_limit, v_tier;
end;
$$;

-- Read today's usage WITHOUT spending a request.
--
-- consume_ai_quota reports usage as a side effect of a call, which covers the
-- "you're nearly out" warning perfectly and does nothing for the Account page —
-- the one screen you open *without* making an AI call. This is the read-only half.
--
-- SECURITY: it takes NO PARAMETER and resolves auth.uid() itself. That is the
-- whole reason it can be granted to `authenticated`, unlike consume_ai_quota,
-- which takes a user id and is therefore service-role only. With a parameter,
-- anyone holding the public anon key could read somebody else's usage.
-- **Do not add one.**
create or replace function public.get_ai_quota_status()
returns table (used integer, quota integer, tier text)
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_status text;
  v_tier text;
  v_used integer;
begin
  -- Not signed in: no rows rather than an error. The caller reads an empty
  -- result as "don't know", which is exactly what it is.
  if v_uid is null then
    return;
  end if;

  select p.subscription_status, coalesce(p.plan_tier, 'base')
  into v_status, v_tier
  from public.profiles p
  where p.id = v_uid;

  if not found then
    return;
  end if;

  if v_status = 'trialing' then
    v_tier := 'pro';
  end if;

  select u.calls into v_used
  from public.ai_usage u
  where u.user_id = v_uid and u.day = (timezone('utc', now()))::date;

  return query select coalesce(v_used, 0), public.ai_daily_limit(v_status, v_tier), v_tier;
end;
$$;

-- IMPORTANT: Postgres grants EXECUTE on new functions to PUBLIC by default, and
-- Supabase then exposes them at /rest/v1/rpc/<name> to anyone holding the public
-- anon key. Without these revokes a stranger could call consume_ai_quota with
-- someone else's user id and exhaust that person's daily AI allowance.
-- These functions are only ever called by the edge functions, which use the
-- service role, so nobody else needs execute rights.
revoke all on function public.consume_ai_quota(uuid, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_ai_quota(uuid, integer, integer, integer) to service_role;

revoke all on function public.ai_daily_limit(text, text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.ai_daily_limit(text, text, integer, integer, integer) to service_role;

-- The one AI function the browser may call: it reads only the caller's own row
-- and spends nothing. Still revoked from anon — a signed-in session is required.
revoke all on function public.get_ai_quota_status() from public, anon;
grant execute on function public.get_ai_quota_status() to authenticated;

revoke all on function public.has_active_access(uuid) from public, anon, authenticated;
grant execute on function public.has_active_access(uuid) to service_role;

revoke all on function public.handle_new_user() from public, anon, authenticated;

revoke all on function public.check_allowed_signup(text) from public, anon, authenticated;
grant execute on function public.check_allowed_signup(text) to service_role;

-- The cloud copy of the planner store. One row per user, holding the whole
-- localStorage `ceoPlanner_store` object as jsonb. Written by the browser on
-- every save (js/store.js) and read back at login (js/screens/auth.js).
create table public.user_data (
  user_id uuid references auth.users on delete cascade not null primary key,
  data jsonb,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.user_data enable row level security;

-- Every policy is scoped to the caller's own row. The browser holds the public
-- anon key, so without these a signed-in user could read everyone's planner.
create policy "Users can view own data"
  on public.user_data for select
  using ( auth.uid() = user_id );

create policy "Users can insert own data"
  on public.user_data for insert
  with check ( auth.uid() = user_id );

create policy "Users can update own data"
  on public.user_data for update
  using ( auth.uid() = user_id )
  with check ( auth.uid() = user_id );

-- Needed so "Erase All My Data" in Settings can remove the cloud copy too.
create policy "Users can delete own data"
  on public.user_data for delete
  using ( auth.uid() = user_id );

-- The client upsert only sends user_id and data, so keep the timestamp honest here.
create or replace function public.touch_user_data_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

create or replace trigger user_data_set_updated_at
  before update on public.user_data
  for each row execute procedure public.touch_user_data_updated_at();

-- 4. Create a trigger that automatically creates a profile entry when a new user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  matching_customer_id text;
  matching_status text;
begin
  -- Check if they are in allowed_signups
  select stripe_customer_id, subscription_status 
  into matching_customer_id, matching_status
  from public.allowed_signups 
  where lower(email) = lower(new.email);
  
  if found then
    -- Came through Stripe first. A paying customer needs no app trial clock and
    -- is never read against one. Anyone else gets a real date: a NULL clock on a
    -- trialing row means NO access since 19 Aug 2026, so writing one here would
    -- lock out a customer who paid before registering. If Stripe is genuinely
    -- governing their trial, the webhook overwrites this with Stripe's own
    -- trial_end.
    insert into public.profiles (id, email, stripe_customer_id, subscription_status, trial_ends_at)
    values (
      new.id, new.email, matching_customer_id, coalesce(matching_status, 'trialing'),
      case
        when coalesce(matching_status, 'trialing') = 'active' then null
        else timezone('utc', now()) + interval '14 days'
      end
    );

    -- Consume/delete from allowed_signups
    delete from public.allowed_signups where lower(email) = lower(new.email);
  else
    -- Card-free signup: start the 14-day clock now.
    insert into public.profiles (id, email, subscription_status, trial_ends_at)
    values (new.id, new.email, 'trialing', timezone('utc', now()) + interval '14 days');
  end if;
  
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 5. Explicitly grant API access to tables (Supabase May 2026 security update)
grant select, insert, update, delete on public.profiles to anon, authenticated, service_role;
grant select, insert, update, delete on public.allowed_signups to anon, authenticated, service_role;
-- Not anon: user_data is per-user and every policy on it keys off auth.uid().
grant select, insert, update, delete on public.user_data to authenticated, service_role;

