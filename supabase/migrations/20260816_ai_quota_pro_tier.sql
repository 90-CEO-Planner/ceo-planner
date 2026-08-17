-- Phase 2, Pro item 4: a third AI limit, for paying Pro accounts.
--
-- Until now consume_ai_quota knew two rates: 30/day on trial, 120/day paid.
-- That was enough while every AI call came from the chat widget, which only
-- fires when somebody types into it. Item 4 fires calls from the dashboard and
-- the planner without being asked, so a Pro account's ceiling has to be set
-- deliberately rather than inherited from the base plan.
--
-- Three rates now:
--   trialing        ->  30/day  (unchanged — a card-free signup must stay cheap)
--   active + base   -> 120/day  (unchanged)
--   active + pro    -> 300/day
--
-- The trial deliberately keeps the trial rate even though it resolves to Pro in
-- the client. That was decided in batch 8: a trial grants Pro *features*, never
-- Pro *spend*. The client's own automatic-call budget (js/liveAI.js) is set
-- lower again on trial for the same reason.
--
-- The function also now returns the caller's tier, so the chat edge function can
-- refuse a Pro-only request without a second round trip to profiles.
--
-- Adding a return column means this cannot be a plain `create or replace` —
-- Postgres refuses to change a function's return type in place. Dropping the old
-- signature and creating the new one inside one migration is safe: it is
-- transactional, so no request can land between the two. Deploy order does not
-- matter either — the currently deployed chat function passes p_user_id by name
-- and ignores extra columns, so it keeps working against the new function.
--
-- Reversible: drop the 4-arg form and restore the 3-arg one from git history.

drop function if exists public.consume_ai_quota(uuid, integer, integer);

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

  -- A trial resolves to Pro in the client, so report it as pro here too. The
  -- limit below deliberately does not follow: features yes, spend no.
  if v_status = 'trialing' then
    v_tier := 'pro';
  end if;

  v_limit := case
    when v_status = 'active' and v_tier = 'pro' then p_pro_limit
    when v_status = 'active' then p_paid_limit
    else p_trial_limit
  end;

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

-- Grants are attached to the signature, so the new 4-argument form needs its
-- own. Without the revoke, anyone holding the public anon key could call this
-- with someone else's user id and burn their daily allowance.
revoke all on function public.consume_ai_quota(uuid, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_ai_quota(uuid, integer, integer, integer) to service_role;
