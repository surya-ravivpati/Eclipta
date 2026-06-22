-- Study Rooms — cozy public/private study spaces with live chat and a chosen
-- Ecliptar per member. Self-contained and idempotent (safe to paste into the
-- Supabase SQL editor of the project the app uses: xrzvbxhnitkdrozmecim).

create extension if not exists pgcrypto;

-- ── Tables ───────────────────────────────────────────────────────────────
create table if not exists public.study_rooms (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  topic       text,
  is_public   boolean not null default true,
  join_code   text unique,                 -- present for private rooms
  owner_id    uuid not null,
  created_at  timestamptz not null default now()
);

create table if not exists public.study_room_members (
  room_id       uuid not null references public.study_rooms(id) on delete cascade,
  user_id       uuid not null,
  display_name  text,
  ecliptar_slug text,
  joined_at     timestamptz not null default now(),
  primary key (room_id, user_id)
);

create table if not exists public.study_room_messages (
  id            uuid primary key default gen_random_uuid(),
  room_id       uuid not null references public.study_rooms(id) on delete cascade,
  user_id       uuid not null,
  author_name   text,
  ecliptar_slug text,
  body          text not null,
  created_at    timestamptz not null default now()
);

create index if not exists idx_srm_room   on public.study_room_members(room_id);
create index if not exists idx_srmsg_room on public.study_room_messages(room_id, created_at);

alter table public.study_rooms         enable row level security;
alter table public.study_room_members  enable row level security;
alter table public.study_room_messages enable row level security;

-- Membership check that bypasses RLS, so policies don't recurse.
create or replace function public.is_study_member(p_room uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists(
    select 1 from public.study_room_members m
    where m.room_id = p_room and m.user_id = auth.uid()
  );
$$;

-- ── RLS ──────────────────────────────────────────────────────────────────
-- Rooms: public rooms visible to all; private rooms only to owner/members.
drop policy if exists "view rooms" on public.study_rooms;
create policy "view rooms" on public.study_rooms for select to authenticated
  using (is_public or owner_id = auth.uid() or public.is_study_member(id));

-- Members: visible if you can see the room.
drop policy if exists "view members" on public.study_room_members;
create policy "view members" on public.study_room_members for select to authenticated
  using (
    public.is_study_member(room_id)
    or exists (select 1 from public.study_rooms r
               where r.id = room_id and (r.is_public or r.owner_id = auth.uid()))
  );

-- Messages: only members can read; members can post as themselves.
drop policy if exists "view messages" on public.study_room_messages;
create policy "view messages" on public.study_room_messages for select to authenticated
  using (public.is_study_member(room_id));

drop policy if exists "post messages" on public.study_room_messages;
create policy "post messages" on public.study_room_messages for insert to authenticated
  with check (user_id = auth.uid() and public.is_study_member(room_id));

-- Members may update their own row (e.g. change Ecliptar).
drop policy if exists "update own membership" on public.study_room_members;
create policy "update own membership" on public.study_room_members for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── Write RPCs (validated, SECURITY DEFINER) ───────────────────────────────
create or replace function public.create_study_room(
  p_name text, p_topic text, p_is_public boolean,
  p_display_name text, p_ecliptar_slug text
) returns public.study_rooms
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_room public.study_rooms; v_code text;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Room name is required'; end if;
  if not coalesce(p_is_public, true) then
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  end if;
  insert into public.study_rooms(name, topic, is_public, join_code, owner_id)
  values (left(trim(p_name), 60), left(coalesce(trim(p_topic), ''), 140),
          coalesce(p_is_public, true), v_code, v_uid)
  returning * into v_room;
  insert into public.study_room_members(room_id, user_id, display_name, ecliptar_slug)
  values (v_room.id, v_uid, p_display_name, p_ecliptar_slug);
  return v_room;
end; $$;

create or replace function public.join_study_room(
  p_room uuid, p_code text, p_display_name text, p_ecliptar_slug text
) returns public.study_rooms
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_room public.study_rooms;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_room is not null then
    select * into v_room from public.study_rooms where id = p_room;
  elsif coalesce(trim(p_code), '') <> '' then
    select * into v_room from public.study_rooms where join_code = upper(trim(p_code));
  end if;
  if v_room.id is null then raise exception 'Room not found'; end if;
  if not v_room.is_public
     and (coalesce(trim(p_code), '') = '' or upper(trim(p_code)) <> v_room.join_code) then
    raise exception 'This room is private — a join code is required';
  end if;
  insert into public.study_room_members(room_id, user_id, display_name, ecliptar_slug)
  values (v_room.id, v_uid, p_display_name, p_ecliptar_slug)
  on conflict (room_id, user_id)
    do update set ecliptar_slug = coalesce(excluded.ecliptar_slug, study_room_members.ecliptar_slug),
                  display_name  = coalesce(excluded.display_name,  study_room_members.display_name);
  return v_room;
end; $$;

create or replace function public.leave_study_room(p_room uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  delete from public.study_room_members where room_id = p_room and user_id = v_uid;
  -- Clean up an empty room so the lobby doesn't fill with ghosts.
  delete from public.study_rooms r
  where r.id = p_room
    and not exists (select 1 from public.study_room_members m where m.room_id = r.id);
end; $$;

-- Lobby feed: public rooms + rooms I'm in, with counts. join_code is only
-- exposed to a room's owner/members so it can be shared.
create or replace function public.get_study_rooms()
returns table(
  id uuid, name text, topic text, is_public boolean, owner_id uuid,
  created_at timestamptz, member_count bigint, am_member boolean, join_code text
) language sql security definer set search_path = public stable as $$
  select r.id, r.name, r.topic, r.is_public, r.owner_id, r.created_at,
    (select count(*) from public.study_room_members m where m.room_id = r.id) as member_count,
    exists(select 1 from public.study_room_members m
           where m.room_id = r.id and m.user_id = auth.uid()) as am_member,
    case when r.owner_id = auth.uid()
              or exists(select 1 from public.study_room_members m
                        where m.room_id = r.id and m.user_id = auth.uid())
         then r.join_code else null end as join_code
  from public.study_rooms r
  where r.is_public
     or r.owner_id = auth.uid()
     or exists(select 1 from public.study_room_members m
               where m.room_id = r.id and m.user_id = auth.uid())
  order by member_count desc, r.created_at desc;
$$;

grant execute on function public.is_study_member(uuid)                        to authenticated;
grant execute on function public.create_study_room(text,text,boolean,text,text) to authenticated;
grant execute on function public.join_study_room(uuid,text,text,text)         to authenticated;
grant execute on function public.leave_study_room(uuid)                       to authenticated;
grant execute on function public.get_study_rooms()                            to authenticated;

-- ── Realtime ───────────────────────────────────────────────────────────────
alter table public.study_room_members  replica identity full;
alter table public.study_room_messages replica identity full;
do $$ begin
  begin alter publication supabase_realtime add table public.study_room_messages; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.study_room_members;  exception when duplicate_object then null; end;
end $$;

notify pgrst, 'reload schema';
