-- Unread count per conversation for the current user (server-side, no message download).
create or replace function public.unread_counts()
returns table (conversation_id uuid, unread bigint)
language sql stable security invoker set search_path = public as $$
  select cm.conversation_id, count(m.id)
  from conversation_members cm
  left join messages m on m.conversation_id = cm.conversation_id
    and m.created_at > cm.last_read_at and m.sender_id <> cm.user_id and m.deleted_at is null
  where cm.user_id = auth.uid()
  group by cm.conversation_id;
$$;
