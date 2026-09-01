```sql
-- =====================================================
-- BAND DAW DATABASE
-- =====================================================


-- BRANI
create table if not exists public.songs (

    id uuid primary key default gen_random_uuid(),

    title text not null,

    artist text,

    created_at timestamptz
        default now(),

    created_by uuid
        references auth.users(id)
);


-- STEM
create table if not exists public.stems (

    id uuid primary key default gen_random_uuid(),

    song_id uuid
        not null
        references public.songs(id)
        on delete cascade,

    name text not null,

    file_path text not null,

    file_type text,

    created_at timestamptz
        default now()

);


-- =====================================================
-- RLS
-- =====================================================

alter table public.songs
enable row level security;

alter table public.stems
enable row level security;


-- =====================================================
-- LETTURA PUBBLICA
-- =====================================================

create policy "Public can read songs"

on public.songs

for select

to anon, authenticated

using (true);


create policy "Public can read stems"

on public.stems

for select

to anon, authenticated

using (true);


-- =====================================================
-- ADMIN: CREAZIONE BRANI
-- =====================================================

create policy "Authenticated users can create songs"

on public.songs

for insert

to authenticated

with check (
    auth.uid() = created_by
);


create policy "Authenticated users can create stems"

on public.stems

for insert

to authenticated

with check (true);


-- =====================================================
-- ADMIN: MODIFICA / CANCELLAZIONE
-- =====================================================

create policy "Authenticated users can delete songs"

on public.songs

for delete

to authenticated

using (true);


create policy "Authenticated users can delete stems"

on public.stems

for delete

to authenticated

using (true);


-- =====================================================
-- STORAGE
-- =====================================================

insert into storage.buckets (
    id,
    name,
    public
)

values (
    'stems',
    'stems',
    true
)

on conflict (id)
do update set public = true;


-- PUBBLICO PUÒ LEGGERE GLI AUDIO

create policy "Public can read stem files"

on storage.objects

for select

to anon, authenticated

using (
    bucket_id = 'stems'
);


-- UTENTI AUTENTICATI POSSONO CARICARE

create policy "Authenticated can upload stems"

on storage.objects

for insert

to authenticated

with check (
    bucket_id = 'stems'
);


-- UTENTI AUTENTICATI POSSONO CANCELLARE

create policy "Authenticated can delete stems"

on storage.objects

for delete

to authenticated

using (
    bucket_id = 'stems'
);
```
