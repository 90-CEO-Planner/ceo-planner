-- Weekly digest (Pro item 7) — who gets one.
--
-- Two functions, both read-only. Nothing here computes a business number: the
-- app writes the whole digest snapshot as display-ready strings and this only
-- decides who is eligible to receive one.

-- ---------------------------------------------------------------------------
-- is_pro_account
-- ---------------------------------------------------------------------------
--
-- ⚠️ `profiles.plan_tier` is 'base' on EVERY row, including trials. A gate
-- written as `where plan_tier = 'pro'` matches nobody and looks like a broken
-- job rather than a wrong query.
--
-- The real rule already existed, written inline TWICE — in consume_ai_quota and
-- get_ai_quota_status. This is that same rule, extracted so there is one copy:
--
--   access  = status 'active', OR 'trialing' with the trial not yet expired
--   pro     = access AND (status is 'trialing' OR plan_tier is 'pro')
--
-- The trial resolving to Pro is deliberate and matches the client's
-- getPlanTier(). It grants Pro *features*; it does not grant Pro spend, which
-- consume_ai_quota still rates separately.
create or replace function public.is_pro_account(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce((
    select
      (
        p.subscription_status = 'active'
        or (
          p.subscription_status = 'trialing'
          and (p.trial_ends_at is null or p.trial_ends_at > timezone('utc', now()))
        )
      )
      and (
        p.subscription_status = 'trialing'
        or coalesce(p.plan_tier, 'base') = 'pro'
      )
    from public.profiles p
    where p.id = p_user_id
  ), false);
$$;

comment on function public.is_pro_account(uuid) is
  'Does this account get Pro features? Mirrors the rule inside consume_ai_quota. '
  'A trial resolves to Pro. Never gate on profiles.plan_tier alone: it is base on every row.';

-- ---------------------------------------------------------------------------
-- get_digest_recipients
-- ---------------------------------------------------------------------------
--
-- Everyone who should receive a weekly digest this Monday, with the snapshot
-- the app already prepared for them.
--
-- Three conditions, and the last one is the product rule that matters:
--
--   1. The account has Pro (or is on trial).
--   2. They have not opted out in Settings. Absent means opted IN, so an
--      existing Pro user does not have to go and find a switch to start
--      receiving something their plan includes.
--   3. **They have a plan to show.** No plan, no event, no email. An email
--      headed "here is your week" with an empty body is not a digest, it is an
--      advert for a screen they never filled in. Those accounts get the
--      separate plan_nudge instead.
create or replace function public.get_digest_recipients()
returns table (user_id uuid, email text, snapshot jsonb)
language sql
stable
security definer
set search_path to 'public'
as $$
  select p.id, p.email, u.data->'digestSnapshot'
  from public.profiles p
  join public.user_data u on u.user_id = p.id
  where public.is_pro_account(p.id)
    and p.email is not null
    and u.data->'digestSnapshot' is not null
    and coalesce((u.data->'settings'->>'emailDigest')::boolean, true)
    and coalesce((u.data->'digestSnapshot'->>'hasPlan')::boolean, false)
    -- At least one real line among the win condition and the three actions.
    --
    -- Blanks BELOW that threshold are wanted, not avoided: Jen's call, 18 Aug
    -- 2026. The "Not set yet. Open the planner and fill this one in." fallback
    -- is a prompt rather than a failure, and in a re-engagement email it is a
    -- reason to open the app. An earlier version refused to send whenever the
    -- win condition was blank; that was too strict.
    --
    -- What this still stops is an email that is nothing BUT fallback text in
    -- every slot, which is the case hasPlan was always meant to catch.
    and (
      coalesce(trim(u.data->'digestSnapshot'->>'winCondition'), '') <> ''
      or coalesce(trim(u.data->'digestSnapshot'->>'action1'), '') <> ''
      or coalesce(trim(u.data->'digestSnapshot'->>'action2'), '') <> ''
      or coalesce(trim(u.data->'digestSnapshot'->>'action3'), '') <> ''
    );
$$;

comment on function public.get_digest_recipients() is
  'Weekly digest recipients and their app-prepared snapshot. Service role only.';

-- Neither is for the browser. The digest function calls them with the service
-- role key; nothing in the app has any reason to ask who else gets an email.
revoke execute on function public.get_digest_recipients() from anon, authenticated;
