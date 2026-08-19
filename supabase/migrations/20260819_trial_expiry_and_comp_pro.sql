-- TRIALS NEVER END — the fix. 19 Aug 2026.
--
-- `profiles.trial_ends_at` had no default and nothing on the signup path set it
-- until the trigger was corrected on 13 Aug, so 11 of 13 rows are NULL. Every
-- access check read NULL as "no end date" and granted access forever, which is
-- why no account has ever reached `trial_expired` and nobody has been asked to
-- pay. `plan_tier` is 'base' on every row, so trials were the ONLY thing
-- granting Pro — which is why the two halves have to land together. Expire
-- trials without a comp mechanism and every account loses Pro at once.
--
-- Decisions confirmed by Jen, 19 Aug 2026:
--   * The grace window runs from TODAY, not from signup. Backfilling from
--     created_at would have expired Derina — the one real customer — the moment
--     this shipped, after 62 days of having access. Everyone getting 14 more
--     days is explicitly fine.
--   * Derina gets Pro permanently via `comp_pro`, while paying Base.
--
-- Why a separate column rather than just setting her plan_tier to 'pro':
-- stripe-webhook writes plan_tier from the price she buys, so the moment she
-- subscribes to Base it would silently overwrite the comp. The flag has to be
-- something nothing in the payment path touches.

-- ---------------------------------------------------------------------------
-- 1. The clock now starts itself
-- ---------------------------------------------------------------------------
-- handle_new_user already stamps this for card-free signups, but a default is
-- what makes it true for every insert path, including any future one.
alter table public.profiles
  alter column trial_ends_at set default (timezone('utc', now()) + interval '14 days');

-- ---------------------------------------------------------------------------
-- 2. comp_pro
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists comp_pro boolean not null default false;

comment on column public.profiles.comp_pro is
  'Manually granted Pro, independent of what was paid for. Nothing in the Stripe or PayPal path writes this column - that is the point of it. Set by hand only.';

-- ---------------------------------------------------------------------------
-- 3. Backfill: 14 days from today for everyone still on a NULL trial
-- ---------------------------------------------------------------------------
-- Only rows still marked 'trialing'. test_paywall@example.com is 'past_due'
-- with a NULL clock and is already locked out; giving it a trial date would
-- quietly hand it access back.
update public.profiles
set trial_ends_at = timezone('utc', now()) + interval '14 days'
where trial_ends_at is null
  and subscription_status = 'trialing';

-- ---------------------------------------------------------------------------
-- 4. Derina's comp
-- ---------------------------------------------------------------------------
update public.profiles
set comp_pro = true
where id = (select id from auth.users where email = 'derina@ntlworld.com');

-- ---------------------------------------------------------------------------
-- 5. account_access() — the canonical gate
-- ---------------------------------------------------------------------------
-- Two changes:
--
--   a) A NULL `trial_ends_at` on a 'trialing' row no longer grants access. That
--      sentinel was the whole bug. After the backfill above no app trial has a
--      NULL clock, and the two paths that used to write one deliberately
--      (handle_new_user's Stripe branch and stripe-webhook) are both changed in
--      the same session so they cannot lock a payer out.
--
--      NULL stays harmless on an 'active' row: a payer is granted by their
--      status, never by a clock.
--
--   b) comp_pro grants access and the Pro tier outright, whatever the
--      subscription says. It is set by hand, so it is trusted by hand.
create or replace function public.account_access(p_user_id uuid)
returns table (has_access boolean, tier text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    (
      coalesce(p.comp_pro, false)
      or p.subscription_status = 'active'
      or (
        p.subscription_status = 'trialing'
        and p.trial_ends_at is not null
        and p.trial_ends_at > timezone('utc', now())
      )
    ) as has_access,
    -- A trial resolves to Pro deliberately: it grants Pro FEATURES. It does not
    -- grant Pro spend, because ai_daily_limit still rates a trial separately.
    case
      when coalesce(p.comp_pro, false) then 'pro'
      when p.subscription_status = 'trialing' then 'pro'
      else coalesce(p.plan_tier, 'base')
    end as tier
  from public.profiles p
  where p.id = p_user_id;
$$;

comment on function public.account_access(uuid) is
  'Does this account have access, and on which tier? The one definition. A NULL trial_ends_at on a trialing row means NO access - it used to mean forever.';

-- has_active_access() predates account_access() and still carried its own copy
-- of the rule, including the NULL hole. Point it at the single definition.
create or replace function public.has_active_access(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce((
    select a.has_access from public.account_access(p_user_id) a
  ), false);
$$;

-- ---------------------------------------------------------------------------
-- 6. handle_new_user — never insert a NULL clock onto a trialing row
-- ---------------------------------------------------------------------------
-- The Stripe-first branch used to insert NULL on the reasoning that "Stripe
-- owns their billing clock, so no app trial". That was safe only while NULL
-- meant unlimited. It now means denied, so a customer who paid before
-- registering and arrived on a Stripe trial would be locked out at signup.
--
-- They get a 14-day app clock as a floor instead. If Stripe is genuinely
-- governing them, the webhook overwrites it with Stripe's own trial_end, or
-- flips them to 'active', where the clock is ignored.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  matching_customer_id text;
  matching_status text;
begin
  select stripe_customer_id, subscription_status
  into matching_customer_id, matching_status
  from public.allowed_signups
  where lower(email) = lower(new.email);

  if found then
    insert into public.profiles (id, email, stripe_customer_id, subscription_status, trial_ends_at)
    values (
      new.id,
      new.email,
      matching_customer_id,
      coalesce(matching_status, 'trialing'),
      case
        -- Already paying: the clock is irrelevant and never read.
        when coalesce(matching_status, 'trialing') = 'active' then null
        -- Anything else needs a real date, because NULL now denies.
        else timezone('utc', now()) + interval '14 days'
      end
    );

    delete from public.allowed_signups where lower(email) = lower(new.email);
  else
    -- Card-free signup: start the 14-day clock now.
    insert into public.profiles (id, email, subscription_status, trial_ends_at)
    values (new.id, new.email, 'trialing', timezone('utc', now()) + interval '14 days');
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Lock the gate functions down to the service role
-- ---------------------------------------------------------------------------
-- Applied as a second migration, lock_down_access_gate_rpcs, and recorded here
-- because it belongs to the same change. Both functions take a user id and run
-- SECURITY DEFINER, so while anon and authenticated held EXECUTE, anyone with
-- the public anon key could ask them about somebody else's account. Neither is
-- ever called from the browser — stripe-sync and paypal-sync call them with the
-- service role, which is the point of routing both through here.
revoke all on function public.account_access(uuid) from public, anon, authenticated;
grant execute on function public.account_access(uuid) to service_role;

revoke all on function public.is_pro_account(uuid) from public, anon, authenticated;
grant execute on function public.is_pro_account(uuid) to service_role;
