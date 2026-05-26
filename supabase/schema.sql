-- ============================================================
-- Mercadão MX — Supabase Schema
-- Execute this in the Supabase SQL Editor (Settings > SQL Editor)
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ─── Profiles (extends auth.users) ───────────────────────────────────────────

create table if not exists public.profiles (
  id         uuid references auth.users(id) on delete cascade primary key,
  name       text        not null default '',
  avatar_url text,
  phone      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── Listings ────────────────────────────────────────────────────────────────

create table if not exists public.listings (
  id               uuid        default uuid_generate_v4() primary key,
  user_id          uuid        references auth.users(id) on delete cascade not null,
  product_type     text        not null check (product_type in ('moto', 'peca', 'equipamento')),
  title            text        not null,
  description      text        not null default '',
  brand            text        not null default 'Outra',
  model            text        not null default '',
  year             integer     not null,
  displacement     text        not null default '250cc',
  engine_type      text        not null check (engine_type in ('two_stroke', 'four_stroke')),
  category         text        not null,
  price            integer     not null,
  accepts_trade    boolean     not null default false,
  accepts_proposals boolean    not null default true,
  city             text        not null,
  state            text        not null,
  documentation    text        not null default 'Sem documento',
  condition        text        not null default 'Seminovo',
  status           text        not null default 'active'
                               check (status in ('active', 'paused', 'sold')),
  photos           text[]      not null default '{}',
  main_photo       text        not null default '',
  views            integer     not null default 0,
  featured         boolean     not null default false,
  featured_until   timestamptz,
  source           text        not null default 'manual',
  source_url       text,
  source_platform  text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  sold_at          timestamptz
);

create index if not exists listings_user_id_idx    on public.listings(user_id);
create index if not exists listings_status_idx     on public.listings(status);
create index if not exists listings_product_type_idx on public.listings(product_type);
create index if not exists listings_created_at_idx on public.listings(created_at desc);

-- ─── Favorites ───────────────────────────────────────────────────────────────

create table if not exists public.favorites (
  id         uuid        default uuid_generate_v4() primary key,
  user_id    uuid        references auth.users(id) on delete cascade not null,
  listing_id uuid        references public.listings(id) on delete cascade not null,
  created_at timestamptz not null default now(),
  unique(user_id, listing_id)
);

create index if not exists favorites_user_id_idx on public.favorites(user_id);

-- ─── Storage bucket ──────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('listing-photos', 'listing-photos', true)
on conflict (id) do nothing;

-- ─── Row Level Security ──────────────────────────────────────────────────────

-- Profiles
alter table public.profiles enable row level security;

create policy "Profiles are publicly readable"
  on public.profiles for select using (true);

create policy "Users can insert their own profile"
  on public.profiles for insert with check (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update using (auth.uid() = id);

-- Listings
alter table public.listings enable row level security;

create policy "Listings are publicly readable"
  on public.listings for select using (true);

create policy "Authenticated users can insert listings"
  on public.listings for insert to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update their own listings"
  on public.listings for update using (auth.uid() = user_id);

create policy "Users can delete their own listings"
  on public.listings for delete using (auth.uid() = user_id);

-- Favorites
alter table public.favorites enable row level security;

create policy "Users can manage their own favorites"
  on public.favorites for all using (auth.uid() = user_id);

-- Storage
create policy "Anyone can view listing photos"
  on storage.objects for select using (bucket_id = 'listing-photos');

create policy "Authenticated users can upload listing photos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'listing-photos');

create policy "Users can delete their own listing photos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'listing-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ─── Auto-create profile on signup ───────────────────────────────────────────

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, name, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(new.email, '@', 1)
    ),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─── Helper RPCs ─────────────────────────────────────────────────────────────

create or replace function public.increment_listing_views(listing_id uuid)
returns void as $$
  update public.listings set views = views + 1 where id = listing_id;
$$ language sql security definer;
