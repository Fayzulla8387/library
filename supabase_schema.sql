-- =========================================================
--  KITOB-AYLANMA — Supabase SQL sxemasi
--  Ushbu skriptni Supabase loyihangizda:
--  Dashboard -> SQL Editor -> New query -> shu faylni joylashtiring -> RUN
-- =========================================================

-- Kengaytmalar (gen_random_uuid() uchun kerak, odatda Supabase'da yoqilgan bo'ladi)
create extension if not exists "pgcrypto";

-- =========================================================
-- 1) PROFILES — foydalanuvchi profili (ism, telefon, telegram)
-- =========================================================
create table if not exists public.profiles (
  id                  uuid references auth.users(id) on delete cascade primary key,
  full_name           text not null,
  phone               text,
  telegram_username   text,
  created_at          timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_all"   on public.profiles;
drop policy if exists "profiles_insert_own"   on public.profiles;
drop policy if exists "profiles_update_own"   on public.profiles;

-- Har kim profillarni ko'ra oladi (kitob egasining kontaktini ko'rsatish uchun kerak)
create policy "profiles_select_all"
  on public.profiles for select
  using (true);

-- Faqat o'zi uchun profil yaratishi mumkin
create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Faqat o'z profilini tahrirlashi mumkin
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id);


-- =========================================================
-- 2) BOOKS — e'lon qilingan kitoblar
-- =========================================================
create table if not exists public.books (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  title         text not null,
  author        text not null,
  genre         text,
  condition     text not null default 'Yaxshi'
                  check (condition in ('Yangi', 'Yaxshi', 'O''rtacha')),
  cover_url     text,
  region        text,
  district      text,
  neighborhood  text,
  type          text not null
                  check (type in ('almashish', 'bepul', 'ijara')),
  rent_price    numeric,
  description   text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

create index if not exists books_created_at_idx on public.books (created_at desc);
create index if not exists books_type_idx on public.books (type);
create index if not exists books_owner_idx on public.books (owner_id);

alter table public.books enable row level security;

drop policy if exists "books_select_all"    on public.books;
drop policy if exists "books_insert_own"    on public.books;
drop policy if exists "books_update_own"    on public.books;
drop policy if exists "books_delete_own"    on public.books;

-- Barcha faol e'lonlarni hamma ko'ra oladi (tizimga kirmaganlar ham)
create policy "books_select_all"
  on public.books for select
  using (true);

-- Faqat tizimga kirgan foydalanuvchi, faqat o'z nomidan e'lon qo'sha oladi
create policy "books_insert_own"
  on public.books for insert
  with check (auth.uid() = owner_id);

-- Faqat egasi o'z e'lonini tahrirlay oladi
create policy "books_update_own"
  on public.books for update
  using (auth.uid() = owner_id);

-- Faqat egasi o'z e'lonini o'chira oladi
create policy "books_delete_own"
  on public.books for delete
  using (auth.uid() = owner_id);


-- =========================================================
-- 3) REQUESTS — kitobga yuborilgan so'rovlar (ichki so'rov formasi)
-- =========================================================
create table if not exists public.requests (
  id            uuid primary key default gen_random_uuid(),
  book_id       uuid not null references public.books(id) on delete cascade,
  requester_id  uuid not null references auth.users(id) on delete cascade,
  owner_id      uuid not null references auth.users(id) on delete cascade,
  message       text not null,
  status        text not null default 'yangi'
                  check (status in ('yangi', 'ko''rildi', 'yakunlandi')),
  created_at    timestamptz not null default now()
);

create index if not exists requests_owner_idx on public.requests (owner_id);
create index if not exists requests_requester_idx on public.requests (requester_id);

alter table public.requests enable row level security;

drop policy if exists "requests_select_related" on public.requests;
drop policy if exists "requests_insert_own"      on public.requests;
drop policy if exists "requests_update_owner"    on public.requests;

-- Faqat so'rov yuborgan yoki kitob egasi shu so'rovni ko'ra oladi
create policy "requests_select_related"
  on public.requests for select
  using (auth.uid() = requester_id or auth.uid() = owner_id);

-- Faqat tizimga kirgan foydalanuvchi, faqat o'z nomidan so'rov yuboradi
create policy "requests_insert_own"
  on public.requests for insert
  with check (auth.uid() = requester_id);

-- Kitob egasi so'rov holatini yangilashi mumkin (masalan "ko'rildi")
create policy "requests_update_owner"
  on public.requests for update
  using (auth.uid() = owner_id);

-- =========================================================
-- TAYYOR!
-- Endi Supabase Dashboard -> Authentication -> Providers bo'limida
-- "Email" provayderi yoqilganligiga ishonch hosil qiling
-- (Confirm email talabini xohlasangiz o'chirib qo'yishingiz mumkin, tezroq test uchun).
-- =========================================================
