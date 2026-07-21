-- Vestra Style DNA + saved outfits (run in Supabase SQL Editor)
-- Matches the app's vestra.profile.v1 localStorage shape.

-- Profiles: one row per auth user (Style DNA)
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
  -- quiz-in-progress + UI prefs (optional; mirrors localStorage answers/lang)
  answers jsonb not null default '{}'::jsonb,
  lang text not null default 'en',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Saved / bookmarked outfits
create table if not exists public.saved_outfits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Full outfit object as produced by the stylist (items[], whyThisWorks, etc.)
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

-- Row Level Security: each user only sees their own data
alter table public.profiles enable row level security;
alter table public.saved_outfits enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "saved_outfits_select_own" on public.saved_outfits;
create policy "saved_outfits_select_own"
  on public.saved_outfits for select
  using (auth.uid() = user_id);

drop policy if exists "saved_outfits_insert_own" on public.saved_outfits;
create policy "saved_outfits_insert_own"
  on public.saved_outfits for insert
  with check (auth.uid() = user_id);

drop policy if exists "saved_outfits_delete_own" on public.saved_outfits;
create policy "saved_outfits_delete_own"
  on public.saved_outfits for delete
  using (auth.uid() = user_id);

drop policy if exists "saved_outfits_update_own" on public.saved_outfits;
create policy "saved_outfits_update_own"
  on public.saved_outfits for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
