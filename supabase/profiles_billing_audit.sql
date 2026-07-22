-- Profiles billing audit trail (run once in Supabase → SQL Editor)
-- Immutable log of changes to stripe_customer_id / stripe_subscription_id / subscription_status.
-- Safe to re-run.

create table if not exists public.profiles_billing_audit (
  id bigint generated always as identity primary key,
  profile_id uuid not null,
  changed_at timestamptz not null default now(),
  -- Who / how
  db_user text,
  session_user text,
  auth_role text,
  auth_uid uuid,
  jwt_claims jsonb,
  application_name text,
  client_addr inet,
  -- Old → new billing fields
  old_subscription_status text,
  new_subscription_status text,
  old_stripe_customer_id text,
  new_stripe_customer_id text,
  old_stripe_subscription_id text,
  new_stripe_subscription_id text
);

comment on table public.profiles_billing_audit is
  'Append-only audit of profiles billing column changes (who/when/old/new)';

create index if not exists profiles_billing_audit_profile_changed_at_idx
  on public.profiles_billing_audit (profile_id, changed_at desc);

create index if not exists profiles_billing_audit_changed_at_idx
  on public.profiles_billing_audit (changed_at desc);

create or replace function public.audit_profiles_billing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  claims jsonb;
begin
  -- Only log when billing fields actually change
  if tg_op = 'UPDATE'
     and old.subscription_status is not distinct from new.subscription_status
     and old.stripe_customer_id is not distinct from new.stripe_customer_id
     and old.stripe_subscription_id is not distinct from new.stripe_subscription_id
  then
    return new;
  end if;

  begin
    claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  exception when others then
    claims := null;
  end;

  insert into public.profiles_billing_audit (
    profile_id,
    db_user,
    session_user,
    auth_role,
    auth_uid,
    jwt_claims,
    application_name,
    client_addr,
    old_subscription_status,
    new_subscription_status,
    old_stripe_customer_id,
    new_stripe_customer_id,
    old_stripe_subscription_id,
    new_stripe_subscription_id
  ) values (
    new.id,
    current_user,
    session_user,
    coalesce(auth.role(), null),
    auth.uid(),
    claims,
    nullif(current_setting('application_name', true), ''),
    inet_client_addr(),
    old.subscription_status,
    new.subscription_status,
    old.stripe_customer_id,
    new.stripe_customer_id,
    old.stripe_subscription_id,
    new.stripe_subscription_id
  );

  return new;
end;
$$;

drop trigger if exists profiles_billing_audit_trg on public.profiles;
create trigger profiles_billing_audit_trg
  after update on public.profiles
  for each row
  execute function public.audit_profiles_billing();

-- Append-only: clients cannot read/write; service_role can SELECT for investigation.
alter table public.profiles_billing_audit enable row level security;

revoke all on table public.profiles_billing_audit from anon, authenticated;
grant select on table public.profiles_billing_audit to service_role;

-- Block updates/deletes even for elevated roles via trigger (immutable log)
create or replace function public.forbid_profiles_billing_audit_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'profiles_billing_audit is append-only';
end;
$$;

drop trigger if exists profiles_billing_audit_no_update on public.profiles_billing_audit;
create trigger profiles_billing_audit_no_update
  before update or delete on public.profiles_billing_audit
  for each row
  execute function public.forbid_profiles_billing_audit_mutation();
