-- ============================================================================
-- Catat Balik — skema Supabase
-- Jalankan SEKALI lewat Supabase Dashboard > SQL Editor > New query > Run.
-- Aman dijalankan ulang (idempoten).
--
-- Catatan penting:
-- * updated_at SELALU diisi server (trigger), bukan dari perangkat. Mesin
--   sinkron memakainya sebagai cursor, jadi jam HP yang meleset tidak merusak.
-- * Penghapusan memakai deleted_at (soft delete) agar ikut tersinkron ke
--   perangkat lain.
-- * owner_id = auth.uid() dan dikunci oleh Row Level Security, sehingga anon
--   key boleh dipublikasikan di repo publik.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- trigger ---

create or replace function public.catat_balik_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' and new.created_at is null then
    new.created_at := now();
  end if;
  return new;
end;
$$;

-- ----------------------------------------------------------------- tabel ----

create table if not exists public.people (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nama        text not null check (length(btrim(nama)) > 0),
  alias       text,
  telepon     text,
  alamat      text,
  hubungan    text not null default 'lainnya'
              check (hubungan in ('keluarga', 'tetangga', 'kerja', 'teman', 'lainnya')),
  catatan     text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nama        text not null check (length(btrim(nama)) > 0),
  jenis       text not null default 'lainnya'
              check (jenis in ('pernikahan', 'khitanan', 'aqiqah', 'syukuran', 'lainnya')),
  tanggal     date,
  pihak       text not null default 'saya' check (pihak in ('saya', 'orang_lain')),
  person_id   uuid references public.people (id) on delete set null,
  lokasi      text,
  catatan     text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create table if not exists public.entries (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  arah           text not null check (arah in ('masuk', 'keluar')),
  person_id      uuid not null references public.people (id) on delete cascade,
  event_id       uuid references public.events (id) on delete set null,
  tanggal        date not null default current_date,
  jenis          text not null check (jenis in ('uang', 'barang')),
  nominal        bigint not null default 0 check (nominal >= 0),
  barang_nama    text,
  barang_jumlah  numeric,
  barang_satuan  text,
  nilai_taksir   bigint not null default 0 check (nilai_taksir >= 0),
  -- Entri keluar boleh menunjuk entri masuk yang dibalasnya. DEFERRABLE supaya
  -- satu batch push yang memuat keduanya tidak gagal karena urutan baris.
  balas_untuk_id uuid references public.entries (id) on delete set null
                 deferrable initially deferred,
  catatan        text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

-- ---------------------------------------------------------------- indeks ----

create index if not exists people_sync_idx  on public.people  (owner_id, updated_at);
create index if not exists events_sync_idx  on public.events  (owner_id, updated_at);
create index if not exists entries_sync_idx on public.entries (owner_id, updated_at);
create index if not exists entries_orang_idx on public.entries (owner_id, person_id);
create index if not exists entries_acara_idx on public.entries (owner_id, event_id);
create index if not exists entries_tanggal_idx on public.entries (owner_id, tanggal);

-- --------------------------------------------------------------- trigger ----

drop trigger if exists people_updated_at  on public.people;
drop trigger if exists events_updated_at  on public.events;
drop trigger if exists entries_updated_at on public.entries;

create trigger people_updated_at  before insert or update on public.people
  for each row execute function public.catat_balik_set_updated_at();
create trigger events_updated_at  before insert or update on public.events
  for each row execute function public.catat_balik_set_updated_at();
create trigger entries_updated_at before insert or update on public.entries
  for each row execute function public.catat_balik_set_updated_at();

-- ------------------------------------------------------------------- RLS ----

alter table public.people  enable row level security;
alter table public.events  enable row level security;
alter table public.entries enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['people', 'events', 'entries'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);

    execute format(
      'create policy %I on public.%I for select to authenticated using (owner_id = auth.uid())',
      t || '_select', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (owner_id = auth.uid())',
      t || '_insert', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid())',
      t || '_update', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (owner_id = auth.uid())',
      t || '_delete', t);
  end loop;
end;
$$;

-- ============================================================================
-- Selesai. Uji cepat setelah login dari aplikasi:
--   select count(*) from public.entries;            -- hanya baris milik sendiri
--   select * from pg_policies where tablename in ('people','events','entries');
-- ============================================================================
