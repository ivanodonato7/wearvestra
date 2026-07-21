-- Vestra Style DNA + saved outfits
-- Run this entire file once in Supabase → SQL Editor → New query → Run
--
-- Tables:
--   profiles       — Style DNA per auth user (mirrors vestra.profile.v1 → profile)
--   saved_outfits  — bookmarked outfits (mirrors vestra.profile.v1 → savedOutfits[])
--
-- RLS: enabled WITH explicit policies so each signed-in user can only
-- read/write their own rows (not "RLS on with zero policies", which blocks everyone).

-- Profiles: one row per auth user
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  archetype text,
  fit text,
  lifestyle text,
  palette text[] not null default '{}',
  avoid text[] not null default '{}',
  budget text,
  occasions text[] not null default '{}',
  favorite_stores text[] not null default '{}',
  answers jsonb not null default '{}'::jsonb,
  lang text not null default 'en',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Saved / bookmarked outfits
create table if not exists public.saved_outfits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  outfit jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists saved_outfits_user_id_created_at_idx
  on public.saved_outfits (user_id, created_at desc);

-- updated_at trigger
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create empty profile row on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Privileges for the authenticated role (required alongside RLS)
grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.profiles to authenticated;
grant select, insert, update, delete on table public.saved_outfits to authenticated;

-- Row Level Security + real per-user policies
alter table public.profiles enable row level security;
alter table public.saved_outfits enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_delete_own"
  on public.profiles for delete
  to authenticated
  using (auth.uid() = id);

drop policy if exists "saved_outfits_select_own" on public.saved_outfits;
create policy "saved_outfits_select_own"
  on public.saved_outfits for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "saved_outfits_insert_own" on public.saved_outfits;
create policy "saved_outfits_insert_own"
  on public.saved_outfits for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "saved_outfits_update_own" on public.saved_outfits;
create policy "saved_outfits_update_own"
  on public.saved_outfits for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "saved_outfits_delete_own" on public.saved_outfits;
create policy "saved_outfits_delete_own"
  on public.saved_outfits for delete
  to authenticated
  using (auth.uid() = user_id);
