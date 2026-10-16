-- Group hardening and admin tooling.

-- Admins may only change group metadata columns (not type, direct_key, created_by, ...).
revoke update on public.conversations from authenticated;
grant update (name, description, avatar_url) on public.conversations to authenticated;

-- Role changes only through this function (members cannot change roles directly: no column grant).
create or replace function public.set_member_role(cid uuid, uid uuid, new_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if new_role not in ('admin','member') then raise exception 'invalid'; end if;
  if not exists (select 1 from conversations where id = cid and type = 'group') then raise exception 'invalid'; end if;
  if not is_admin(cid) then raise exception 'forbidden'; end if;
  update conversation_members set role = new_role where conversation_id = cid and user_id = uid;
  if not exists (select 1 from conversation_members where conversation_id = cid and role = 'admin') then
    raise exception 'last_admin';
  end if;
end $$;

-- Adding someone else to a group must respect blocks and their "who can message me" setting.
create or replace function public.check_member_add() returns trigger
language plpgsql security definer set search_path = public as $$
declare t text; me uuid := auth.uid();
begin
  select type into t from conversations where id = new.conversation_id;
  if t = 'group' and me is not null and new.user_id <> me then
    if exists (select 1 from user_blocks where (blocker_id = new.user_id and blocked_id = me) or (blocker_id = me and blocked_id = new.user_id)) then
      raise exception 'blocked'; end if;
    if (select who_can_message from profiles where id = new.user_id) = 'nobody' then raise exception 'not_allowed'; end if;
  end if;
  return new;
end $$;
create trigger members_before_insert before insert on public.conversation_members
  for each row execute function public.check_member_add();

-- When someone leaves: delete empty groups; if no admin remains, promote the longest-standing member.
create or replace function public.after_member_removed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from conversations where id = old.conversation_id and type = 'group') then return null; end if;
  if not exists (select 1 from conversation_members where conversation_id = old.conversation_id) then
    delete from conversations where id = old.conversation_id;
  elsif not exists (select 1 from conversation_members where conversation_id = old.conversation_id and role = 'admin') then
    update conversation_members set role = 'admin'
     where (conversation_id, user_id) = (select conversation_id, user_id from conversation_members
                                         where conversation_id = old.conversation_id order by joined_at limit 1);
  end if;
  return null;
end $$;
create trigger members_after_delete after delete on public.conversation_members
  for each row execute function public.after_member_removed();
