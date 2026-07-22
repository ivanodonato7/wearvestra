-- Account deletion soft-delete column (run once in Supabase → SQL Editor)
-- Safe to re-run.

alter table public.profiles
  add column if not exists deletion_requested_at timestamptz;

comment on column public.profiles.deletion_requested_at is
  'When set, account is pending permanent deletion (30-day grace). Cleared only by support/service_role.';

create index if not exists profiles_deletion_requested_at_idx
  on public.profiles (deletion_requested_at)
  where deletion_requested_at is not null;

-- Extend billing protect trigger to also lock deletion_requested_at for clients
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
    new.deletion_requested_at := old.deletion_requested_at;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_billing on public.profiles;
create trigger profiles_protect_billing
  before update on public.profiles
  for each row execute function public.protect_billing_columns();
