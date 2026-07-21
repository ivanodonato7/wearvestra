-- Vestra billing columns (run once in Supabase → SQL Editor after schema.sql)
-- Safe to re-run (IF NOT EXISTS / replace triggers).

alter table public.profiles
  add column if not exists subscription_status text not null default 'free',
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists stylist_requests_used integer not null default 0,
  add column if not exists stylist_requests_period text not null default '';

comment on column public.profiles.subscription_status is
  'free | active | trialing | past_due | canceled | unpaid | incomplete…';
comment on column public.profiles.stylist_requests_period is
  'UTC YYYY-MM bucket for free-tier stylist usage';

-- Clients must not self-upgrade or reset usage. Service role (webhooks / stylist fn) can.
create or replace function public.protect_billing_columns()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and coalesce(auth.role(), '') is distinct from 'service_role' then
    new.subscription_status := old.subscription_status;
    new.stripe_customer_id := old.stripe_customer_id;
    new.stripe_subscription_id := old.stripe_subscription_id;
    new.stylist_requests_used := old.stylist_requests_used;
    new.stylist_requests_period := old.stylist_requests_period;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_billing on public.profiles;
create trigger profiles_protect_billing
  before update on public.profiles
  for each row execute function public.protect_billing_columns();

create index if not exists profiles_stripe_customer_id_idx
  on public.profiles (stripe_customer_id)
  where stripe_customer_id is not null;
