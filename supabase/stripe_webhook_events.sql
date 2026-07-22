-- Stripe webhook idempotency (run once in Supabase → SQL Editor)
-- Safe to re-run.

create table if not exists public.stripe_webhook_events (
  event_id text primary key,
  event_type text not null default '',
  livemode boolean,
  created_at timestamptz not null default now()
);

comment on table public.stripe_webhook_events is
  'Processed Stripe webhook event IDs — prevents duplicate applySubscription writes';

alter table public.stripe_webhook_events enable row level security;

-- No client policies: only service_role (webhooks) may read/write.
revoke all on table public.stripe_webhook_events from anon, authenticated;
grant select, insert, delete on table public.stripe_webhook_events to service_role;
