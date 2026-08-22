-- A comped account is Pro in full, allowance included.
--
-- Until now the allowance was worked out from `subscription_status` alone, while
-- the FEATURE tier came from account_access(), which resolves comp_pro to 'pro'.
-- A comp therefore ran the whole Pro product on the trial rate of 30 a day --
-- a quarter of what a paying Base customer gets -- while four live AI surfaces
-- spend quota on page load. derina@ntlworld.com, the only real customer, was in
-- exactly that state.
--
-- It was also about to start lying: the client rewrites a lapsed trial to
-- 'trial_expired' locally (js/supabaseClient.js:129-135) while the database row
-- still says 'trialing', so from 2 Sep 2026 aiDailyAllowance() would have
-- promised a comp 300 a day while the server cut them off at 30.
--
-- Decided with Jen, 21 Aug 2026: a comp is entitled to every Pro benefit.
-- The rule stays inside ai_daily_limit so consume_ai_quota and
-- get_ai_quota_status cannot drift apart -- which is why that function was
-- extracted in the first place (see 20260817_ai_quota_status.sql).
--
-- Applied to the live project on 21 Aug 2026 via the Supabase MCP. This file
-- exists so the repo matches what is actually running.

-- Signature change, so the old one goes first. Both callers are replaced below.
drop function if exists public.ai_daily_limit(text, text, integer, integer, integer);

create or replace function public.ai_daily_limit(
  p_status text,
  p_tier text,
  p_trial_limit integer default 30,
  p_paid_limit integer default 120,
  p_pro_limit integer default 300,
  p_comp boolean default false
)
returns integer
language sql
immutable
as $function$
  select case
    -- A comp counts as entitled here exactly as it does in account_access().
    when p_tier = 'pro' and (p_status = 'active' or p_comp) then p_pro_limit
    when p_status = 'active' then p_paid_limit
    else p_trial_limit
  end;
$function$;

revoke all on function public.ai_daily_limit(text, text, integer, integer, integer, boolean) from public, anon, authenticated;
grant execute on function public.ai_daily_limit(text, text, integer, integer, integer, boolean) to service_role;

create or replace function public.consume_ai_quota(
  p_user_id uuid,
  p_trial_limit integer default 30,
  p_paid_limit integer default 120,
  p_pro_limit integer default 300
)
returns table(allowed boolean, reason text, used integer, quota integer, tier text)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_status text;
  v_comp boolean;
  v_tier text;
  v_has_access boolean;
  v_limit integer;
  v_used integer;
begin
  select p.subscription_status, coalesce(p.comp_pro, false)
    into v_status, v_comp
  from public.profiles p where p.id = p_user_id;

  if not found then
    return query select false, 'no_profile'::text, 0, 0, 'base'::text;
    return;
  end if;

  select a.has_access, a.tier into v_has_access, v_tier
  from public.account_access(p_user_id) a;

  if not v_has_access then
    return query select false, 'no_access'::text, 0, 0, v_tier;
    return;
  end if;

  v_limit := public.ai_daily_limit(v_status, v_tier, p_trial_limit, p_paid_limit, p_pro_limit, v_comp);

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
$function$;

create or replace function public.get_ai_quota_status()
returns table(used integer, quota integer, tier text)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_status text;
  v_comp boolean;
  v_tier text;
  v_used integer;
begin
  if v_uid is null then
    return;
  end if;

  select p.subscription_status, coalesce(p.comp_pro, false)
    into v_status, v_comp
  from public.profiles p where p.id = v_uid;

  if not found then
    return;
  end if;

  select a.tier into v_tier from public.account_access(v_uid) a;

  select u.calls into v_used
  from public.ai_usage u
  where u.user_id = v_uid and u.day = (timezone('utc', now()))::date;

  return query select coalesce(v_used, 0),
                      public.ai_daily_limit(v_status, v_tier, 30, 120, 300, v_comp),
                      v_tier;
end;
$function$;
