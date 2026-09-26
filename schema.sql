-- =====================================================
-- BAND DAW DATABASE
-- VERSIONE AGGIORNATA
-- =====================================================

create table if not exists public.songs (
    id uuid primary key default gen_random_uuid(),
    title text not null,
    artist text,
    created_at timestamptz default now(),
    created_by uuid references auth.users(id)
);


create table if not exists public.stems (
    id uuid primary key default gen_random_uuid(),
    song_id uuid not null references public.songs(id) on delete cascade,
    name text not null,
    file_path text not null,
    file_type text,
    created_at timestamptz default now()
);


-- =====================================================
-- PROFILI / RUOLI
-- =====================================================

create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    nickname text not null unique,
    role text not null default 'member',
    created_at timestamptz default now(),

    constraint profiles_role_check
        check (role in ('member', 'admin'))
);


-- =====================================================
-- PROFILO AUTOMATICO PER I NUOVI UTENTI
-- =====================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    base_nickname text;
    final_nickname text;
begin

    base_nickname :=
        lower(
            split_part(
                new.email,
                '@',
                1
            )
        );

    base_nickname :=
        regexp_replace(
            base_nickname,
            '[^a-z0-9._-]',
            '',
            'g'
        );

    if base_nickname = '' then
        base_nickname := 'user';
    end if;

    final_nickname := left(base_nickname, 24);

    while exists (
        select 1
        from public.profiles
        where nickname = final_nickname
          and id <> new.id
    ) loop

        final_nickname :=
            left(base_nickname, 20)
            || '-'
            || substr(
                replace(new.id::text, '-', ''),
                1,
                4
            );

    end loop;


    insert into public.profiles (
        id,
        nickname,
        role
    )
    values (
        new.id,
        final_nickname,
        'member'
    )
    on conflict (id)
    do nothing;


    return new;

end;
$$;


drop trigger if exists on_auth_user_created
on auth.users;


create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();


-- =====================================================
-- PROFILI DEGLI UTENTI GIÀ ESISTENTI
-- =====================================================

insert into public.profiles (
    id,
    nickname,
    role
)
select
    u.id,
    left(
        regexp_replace(
            lower(split_part(u.email, '@', 1)),
            '[^a-z0-9._-]',
            '',
            'g'
        ),
        24
    ),
    'member'
from auth.users u
where u.email is not null
  and not exists (
      select 1
      from public.profiles p
      where p.id = u.id
  );


-- =====================================================
-- RLS
-- =====================================================

alter table public.songs enable row level security;
alter table public.stems enable row level security;
alter table public.profiles enable row level security;


-- =====================================================
-- RIMUOVI POLICY PRECEDENTI
-- =====================================================

drop policy if exists "Public can read songs"
on public.songs;

drop policy if exists "Public can read stems"
on public.stems;

drop policy if exists "Authenticated users can create songs"
on public.songs;

drop policy if exists "Authenticated users can create stems"
on public.stems;

drop policy if exists "Authenticated users can delete songs"
on public.songs;

drop policy if exists "Authenticated users can delete stems"
on public.stems;


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
-- PROFILI
-- =====================================================

drop policy if exists "Users can read own profile"
on public.profiles;


create policy "Users can read own profile"
on public.profiles
for select
to authenticated
using (
    id = auth.uid()
);


-- =====================================================
-- ADMIN: CREAZIONE
-- =====================================================

create policy "Admins can create songs"
on public.songs
for insert
to authenticated
with check (
    auth.uid() = created_by
    and exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role = 'admin'
    )
);


create policy "Admins can create stems"
on public.stems
for insert
to authenticated
with check (
    exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role = 'admin'
    )
);


-- =====================================================
-- ADMIN: CANCELLAZIONE
-- =====================================================

create policy "Admins can delete songs"
on public.songs
for delete
to authenticated
using (
    exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role = 'admin'
    )
);


create policy "Admins can delete stems"
on public.stems
for delete
to authenticated
using (
    exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role = 'admin'
    )
);


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


drop policy if exists "Public can read stem files"
on storage.objects;

drop policy if exists "Authenticated can upload stems"
on storage.objects;

drop policy if exists "Authenticated can delete stems"
on storage.objects;


create policy "Public can read stem files"
on storage.objects
for select
to anon, authenticated
using (
    bucket_id = 'stems'
);


create policy "Admins can upload stems"
on storage.objects
for insert
to authenticated
with check (
    bucket_id = 'stems'
    and exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role = 'admin'
    )
);


create policy "Admins can delete stems"
on storage.objects
for delete
to authenticated
using (
    bucket_id = 'stems'
    and exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role = 'admin'
    )
);


-- =====================================================
-- DOPO AVER CREATO / MIGRATO IL TUO UTENTE:
--
-- update public.profiles
-- set role = 'admin'
-- where nickname = 'IL_TUO_NICKNAME';
--
-- Esempio:
-- update public.profiles
-- set role = 'admin'
-- where nickname = 'marco';
-- =====================================================
