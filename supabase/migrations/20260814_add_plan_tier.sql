-- Phase 2, base/pro tiers.
--
-- setup.sql is the from-scratch schema; this is the same change for the live
-- database, which already has a profiles table. Additive and reversible
-- (`alter table public.profiles drop column plan_tier;`).
--
-- Existing rows default to 'base'. That is correct even for the current trial
-- user: the trial resolves to Pro from subscription_status in the client, not
-- from this column, so nobody loses access when this runs.
--
-- Run this BEFORE deploying the bundle that reads plan_tier. The client has a
-- fallback for the missing column, but it degrades every paying account to base
-- until this lands.

alter table public.profiles
  add column if not exists plan_tier text not null default 'base';

-- Separate statement so re-running the migration doesn't fail on the constraint.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_plan_tier_check'
  ) then
    alter table public.profiles
      add constraint profiles_plan_tier_check check (plan_tier in ('base', 'pro'));
  end if;
end $$;
