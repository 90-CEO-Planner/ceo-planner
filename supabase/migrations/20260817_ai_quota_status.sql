-- Read today's AI usage without spending a request.
--
-- Pro item 4 shipped the allowance on the Account plan card, fed by the numbers
-- `consume_ai_quota` returns on every successful call. That covers the warning
-- perfectly — you are always mid-request when you are approaching a limit — but
-- it does not cover the Account page, which is precisely the screen you open
-- *without* making an AI call. So it showed the allowance and no usage until
-- something else happened to spend one.
--
-- This is the missing read-only half.
--
-- SECURITY: it takes NO PARAMETER and resolves auth.uid() itself. That is the
-- whole reason it is safe to grant to `authenticated`, unlike consume_ai_quota,
-- which takes a user id and is therefore service-role only — with a parameter,
-- anyone holding the public anon key could read (or, there, spend) somebody
-- else's allowance. Do not add one.
--
-- It also consumes nothing, so a page load costs no part of the day's quota.

-- One place that decides what a plan's daily limit is.
--
-- Extracted so consume_ai_quota and get_ai_quota_status cannot drift into
-- disagreeing about the same account — the app would then warn against one
-- number while the server enforced another.
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

-- Same signature and return type as before, so this is a plain replace.
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

  -- A trial gets Pro features but keeps the trial rate.
  if v_status = 'trialing' then
    v_tier := 'pro';
  end if;

  v_limit := public.ai_daily_limit(v_status, v_tier, p_trial_limit, p_paid_limit, p_pro_limit);

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
  -- Not signed in: return no rows rather than raising. The caller treats an
  -- empty result as "don't know", which is what it is.
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

  -- No row for today genuinely means nothing has been used yet, so 0 is the
  -- honest answer here — unlike the client-side cache, where "no reading" and
  -- "zero used" are different things.
  return query select coalesce(v_used, 0), public.ai_daily_limit(v_status, v_tier), v_tier;
end;
$$;

revoke all on function public.ai_daily_limit(text, text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.ai_daily_limit(text, text, integer, integer, integer) to service_role;

-- The one AI function the browser is allowed to call, because it reads only the
-- caller's own row and spends nothing.
revoke all on function public.get_ai_quota_status() from public, anon;
grant execute on function public.get_ai_quota_status() to authenticated;
