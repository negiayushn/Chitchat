-- Server-side attachment rules. Keep the allowlist in sync with src/lib/files.ts.
-- Note: Storage checks the *declared* Content-Type; it does not sniff file contents. SVG is deliberately excluded (script risk).
update storage.buckets set
  file_size_limit = 26214400,   -- 25 MB
  allowed_mime_types = array[
    'image/jpeg','image/png','image/gif','image/webp',
    'video/mp4','video/webm',
    'audio/webm','audio/mp4','audio/ogg',
    'application/pdf','text/plain',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation']
where id = 'attachments';

alter table public.attachments add constraint attachments_mime_allowed check (mime_type in (
    'image/jpeg','image/png','image/gif','image/webp','video/mp4','video/webm','audio/webm','audio/mp4','audio/ogg',
    'application/pdf','text/plain',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'));

-- An attachment row must point inside its own conversation's folder (no linking to other chats' files).
drop policy attach_add on public.attachments;
create policy attach_add on public.attachments for insert to authenticated
  with check (exists (select 1 from public.messages m
    where m.id = message_id and m.sender_id = auth.uid() and storage_path like m.conversation_id::text || '/%'));

-- Deleting for everyone also removes the attachment rows so the file can no longer be looked up.
create or replace function public.delete_message_for_everyone(mid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update messages set deleted_at = now(), body = null where id = mid and sender_id = auth.uid();
  if found then delete from attachments where message_id = mid; end if;
end $$;

alter publication supabase_realtime add table public.attachments;
