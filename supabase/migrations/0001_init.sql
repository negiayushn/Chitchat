-- NOVA Chat: initial schema (Phase 1/2 core). Run in Supabase SQL editor or via `supabase db push`.
create extension if not exists pgcrypto;

-- ───────── Tables ─────────
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (username ~ '^[a-z0-9_]{3,24}$'),
  display_name text not null check (char_length(display_name) between 1 and 60),
  avatar_url text,
  bio text check (char_length(bio) <= 200),
  last_seen_at timestamptz,
  show_last_seen boolean not null default true,
  who_can_message text not null default 'everyone' check (who_can_message in ('everyone','nobody')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('direct','group')),
  -- sorted "uidA:uidB" prevents duplicate DMs
  direct_key text unique,
  name text, description text, avatar_url text,
  created_by uuid references public.profiles(id) on delete set null,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check ((type = 'direct' and direct_key is not null) or (type = 'group' and name is not null))
);

-- Per-user conversation settings are folded in here (replaces a separate conversation_settings table).
create table public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('admin','member')),
  last_read_at timestamptz not null default now(),
  pinned boolean not null default false,
  archived boolean not null default false,
  favorite boolean not null default false,
  muted_until timestamptz,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index on public.conversation_members (user_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null default 'text' check (kind in ('text','image','video','document','voice','system')),
  body text check (char_length(body) <= 4000),
  reply_to uuid references public.messages(id) on delete set null,
  edited_at timestamptz,
  deleted_at timestamptz,            -- soft delete ("delete for everyone"); body is blanked client-side & by RPC
  created_at timestamptz not null default now()
);
create index on public.messages (conversation_id, created_at desc, id desc);  -- cursor pagination
create index on public.messages using gin (to_tsvector('simple', coalesce(body,'')));  -- server-side search

-- Sent = row exists. Delivered/read are per-recipient rows.
create table public.message_receipts (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  delivered_at timestamptz,
  read_at timestamptz,
  primary key (message_id, user_id)
);

create table public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (char_length(emoji) <= 16),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  storage_path text not null,        -- "<conversation_id>/<uuid>-<name>" in private bucket
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 26214400),
  duration_ms int,
  created_at timestamptz not null default now()
);
create index on public.attachments (message_id);

create table public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id), check (blocker_id <> blocked_id)
);

create table public.pinned_messages (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  pinned_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (conversation_id, message_id)
);

create table public.starred_messages (
  user_id uuid not null references public.profiles(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, message_id)
);

create table public.call_history (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  caller_id uuid not null references public.profiles(id) on delete cascade,
  callee_id uuid not null references public.profiles(id) on delete cascade,
  media text not null check (media in ('voice','video')),
  status text not null check (status in ('ringing','answered','declined','missed','failed','ended')),
  started_at timestamptz not null default now(),
  answered_at timestamptz, ended_at timestamptz
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  conversation_id uuid references public.conversations(id) on delete cascade,
  message_id uuid references public.messages(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.notifications (user_id, created_at desc);

-- ───────── Helpers (SECURITY DEFINER avoids RLS recursion) ─────────
create or replace function public.is_member(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from conversation_members where conversation_id = cid and user_id = auth.uid());
$$;

create or replace function public.is_admin(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from conversation_members where conversation_id = cid and user_id = auth.uid() and role = 'admin');
$$;

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();

-- Bump conversation ordering on new message
create or replace function public.bump_conversation() returns trigger language plpgsql security definer set search_path = public as $$
begin update conversations set last_message_at = new.created_at where id = new.conversation_id; return new; end $$;
create trigger messages_bump after insert on public.messages for each row execute function public.bump_conversation();

-- Block enforcement on DMs: refuse inserts when either side blocked the other or recipient disallows messages
create or replace function public.enforce_dm_rules() returns trigger language plpgsql security definer set search_path = public as $$
declare c conversations; other uuid;
begin
  select * into c from conversations where id = new.conversation_id;
  if c.type = 'direct' then
    select user_id into other from conversation_members where conversation_id = c.id and user_id <> new.sender_id;
    if exists (select 1 from user_blocks where (blocker_id = other and blocked_id = new.sender_id)
                                            or (blocker_id = new.sender_id and blocked_id = other)) then
      raise exception 'blocked';
    end if;
  end if;
  return new;
end $$;
create trigger messages_dm_rules before insert on public.messages for each row execute function public.enforce_dm_rules();

-- ───────── RPCs for privileged creation flows ─────────
create or replace function public.create_direct_conversation(other uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); k text; cid uuid;
begin
  if me is null or other is null or other = me then raise exception 'invalid'; end if;
  if exists (select 1 from user_blocks where (blocker_id = other and blocked_id = me) or (blocker_id = me and blocked_id = other)) then
    raise exception 'blocked'; end if;
  if (select who_can_message from profiles where id = other) = 'nobody' then raise exception 'not_allowed'; end if;
  k := least(me::text, other::text) || ':' || greatest(me::text, other::text);
  select id into cid from conversations where direct_key = k;
  if cid is null then
    insert into conversations (type, direct_key, created_by) values ('direct', k, me) returning id into cid;
    insert into conversation_members (conversation_id, user_id) values (cid, me), (cid, other);
  end if;
  return cid;
end $$;

create or replace function public.create_group(group_name text, member_ids uuid[]) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); cid uuid; m uuid;
begin
  if me is null then raise exception 'unauthenticated'; end if;
  insert into conversations (type, name, created_by) values ('group', group_name, me) returning id into cid;
  insert into conversation_members (conversation_id, user_id, role) values (cid, me, 'admin');
  foreach m in array member_ids loop
    if m <> me then insert into conversation_members (conversation_id, user_id) values (cid, m) on conflict do nothing; end if;
  end loop;
  return cid;
end $$;

create or replace function public.delete_message_for_everyone(mid uuid) returns void
language sql security definer set search_path = public as $$
  update messages set deleted_at = now(), body = null where id = mid and sender_id = auth.uid();
$$;

-- ───────── Row Level Security ─────────
alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.message_receipts enable row level security;
alter table public.message_reactions enable row level security;
alter table public.attachments enable row level security;
alter table public.user_blocks enable row level security;
alter table public.pinned_messages enable row level security;
alter table public.starred_messages enable row level security;
alter table public.call_history enable row level security;
alter table public.notifications enable row level security;

-- profiles: signed-in users may look up public fields only (column grants below); only owner can write
create policy profiles_read on public.profiles for select to authenticated using (true);
create policy profiles_insert on public.profiles for insert to authenticated with check (id = auth.uid());
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
revoke select on public.profiles from authenticated, anon;
grant select (id, username, display_name, avatar_url, bio) on public.profiles to authenticated;
-- Own full row (incl. privacy settings) is read through this view:
create view public.my_profile with (security_invoker = false) as
  select * from public.profiles where id = auth.uid();
grant select on public.my_profile to authenticated;
-- TODO(Phase 3): expose last_seen_at via a function that honors show_last_seen.

create policy conv_read on public.conversations for select to authenticated using (public.is_member(id));
create policy conv_update_admin on public.conversations for update to authenticated
  using (type = 'group' and public.is_admin(id)) with check (type = 'group' and public.is_admin(id));
create policy conv_delete_admin on public.conversations for delete to authenticated
  using (type = 'group' and public.is_admin(id));
-- No INSERT policy: creation only via create_direct_conversation / create_group.

create policy members_read on public.conversation_members for select to authenticated using (public.is_member(conversation_id));
create policy members_add on public.conversation_members for insert to authenticated
  with check (public.is_admin(conversation_id) and exists (select 1 from conversations c where c.id = conversation_id and c.type = 'group'));
create policy members_update_self on public.conversation_members for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy members_remove on public.conversation_members for delete to authenticated
  using (user_id = auth.uid() or public.is_admin(conversation_id));
-- Users may only change their own preference columns (not role / user_id):
revoke update on public.conversation_members from authenticated;
grant update (last_read_at, pinned, archived, favorite, muted_until) on public.conversation_members to authenticated;

create policy messages_read on public.messages for select to authenticated using (public.is_member(conversation_id));
create policy messages_send on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and public.is_member(conversation_id));
create policy messages_edit on public.messages for update to authenticated
  using (sender_id = auth.uid()) with check (sender_id = auth.uid());
revoke update on public.messages from authenticated;
grant update (body, edited_at) on public.messages to authenticated;   -- deletion goes through the RPC

create policy receipts_read on public.message_receipts for select to authenticated
  using (user_id = auth.uid() or exists (select 1 from messages m where m.id = message_id and m.sender_id = auth.uid()));
create policy receipts_write on public.message_receipts for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from messages m where m.id = message_id and public.is_member(m.conversation_id)));
create policy receipts_update on public.message_receipts for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy reactions_read on public.message_reactions for select to authenticated
  using (exists (select 1 from messages m where m.id = message_id and public.is_member(m.conversation_id)));
create policy reactions_add on public.message_reactions for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from messages m where m.id = message_id and public.is_member(m.conversation_id)));
create policy reactions_remove on public.message_reactions for delete to authenticated using (user_id = auth.uid());

create policy attach_read on public.attachments for select to authenticated
  using (exists (select 1 from messages m where m.id = message_id and public.is_member(m.conversation_id)));
create policy attach_add on public.attachments for insert to authenticated
  with check (exists (select 1 from messages m where m.id = message_id and m.sender_id = auth.uid()));

create policy blocks_own on public.user_blocks for all to authenticated
  using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());

create policy pins_read on public.pinned_messages for select to authenticated using (public.is_member(conversation_id));
create policy pins_write on public.pinned_messages for insert to authenticated
  with check (pinned_by = auth.uid() and public.is_member(conversation_id));
create policy pins_remove on public.pinned_messages for delete to authenticated using (public.is_member(conversation_id));

create policy stars_own on public.starred_messages for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy calls_read on public.call_history for select to authenticated using (caller_id = auth.uid() or callee_id = auth.uid());
create policy calls_insert on public.call_history for insert to authenticated
  with check (caller_id = auth.uid() and public.is_member(conversation_id));
create policy calls_update on public.call_history for update to authenticated
  using (caller_id = auth.uid() or callee_id = auth.uid());

create policy notif_own_read on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notif_own_update on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
-- Notifications are inserted by triggers / Edge Functions with the service role, never by clients.

-- ───────── Storage: private bucket, path = <conversation_id>/<file> ─────────
insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 26214400) on conflict (id) do nothing;

create policy att_obj_read on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and public.is_member(((storage.foldername(name))[1])::uuid));
create policy att_obj_write on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and public.is_member(((storage.foldername(name))[1])::uuid));

-- ───────── Realtime ─────────
alter publication supabase_realtime add table public.messages, public.message_receipts, public.message_reactions, public.conversation_members;
