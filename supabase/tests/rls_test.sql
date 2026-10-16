-- RLS smoke tests. Run in the Supabase SQL editor (or `psql`) as the postgres role.
-- Everything runs in one transaction that is ROLLED BACK, so no data is left behind.
-- Any failed expectation raises an exception. A final NOTICE means all checks passed.
-- NOTE: inserts a minimal row into auth.users; if your Supabase version requires more NOT NULL columns, add them.
begin;

create or replace function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create or replace function pg_temp.as_admin() returns void language plpgsql as $$ begin execute 'reset role'; end $$;

do $$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid();
  cid uuid; gid uuid; mid uuid; n int; failed boolean;
begin
  insert into auth.users (id, email) values (a,'a@test.dev'),(b,'b@test.dev'),(c,'c@test.dev');
  insert into profiles (id, username, display_name) values (a,'user_a','A'),(b,'user_b','B'),(c,'user_c','C');

  -- 1. A opens a DM with B; creating a DM with yourself is rejected
  perform pg_temp.as_user(a);
  cid := create_direct_conversation(b);
  failed := false; begin perform create_direct_conversation(a); exception when others then failed := true; end;
  assert failed, 'self-DM must be rejected';

  -- 2. A sends a message
  insert into messages (conversation_id, sender_id, body) values (cid, a, 'hello') returning id into mid;

  -- 3. Outsider C cannot read or write
  perform pg_temp.as_user(c);
  select count(*) into n from messages where conversation_id = cid;
  assert n = 0, 'outsider must not read messages';
  select count(*) into n from conversations where id = cid;
  assert n = 0, 'outsider must not see the conversation';
  failed := false; begin insert into messages (conversation_id, sender_id, body) values (cid, c, 'intrude'); exception when others then failed := true; end;
  assert failed, 'outsider must not send messages';

  -- 4. Impersonation: A cannot send as B
  perform pg_temp.as_user(a);
  failed := false; begin insert into messages (conversation_id, sender_id, body) values (cid, b, 'forged'); exception when others then failed := true; end;
  assert failed, 'sender spoofing must be rejected';

  -- 5. B cannot edit A's message, and column grants stop changing sender_id
  perform pg_temp.as_user(b);
  update messages set body = 'hacked' where id = mid;
  perform pg_temp.as_admin();
  assert (select body from messages where id = mid) = 'hello', 'non-sender edit must have no effect';
  perform pg_temp.as_user(a);
  failed := false; begin update messages set sender_id = b where id = mid; exception when others then failed := true; end;
  assert failed, 'sender_id must not be updatable';

  -- 6. Receipts: B may record own receipt but not forge A's
  perform pg_temp.as_user(b);
  insert into message_receipts (message_id, user_id, delivered_at) values (mid, b, now());
  failed := false; begin insert into message_receipts (message_id, user_id, read_at) values (mid, a, now()); exception when others then failed := true; end;
  assert failed, 'forged receipt must be rejected';

  -- 7. Blocking: after B blocks A, A cannot send
  insert into user_blocks (blocker_id, blocked_id) values (b, a);
  perform pg_temp.as_user(a);
  failed := false; begin insert into messages (conversation_id, sender_id, body) values (cid, a, 'after block'); exception when others then failed := true; end;
  assert failed, 'blocked user must not be able to send';

  -- 8. Groups: only admins add members; members can't promote themselves
  perform pg_temp.as_user(a);
  gid := create_group('Team', array[b]);
  perform pg_temp.as_user(b);
  failed := false; begin insert into conversation_members (conversation_id, user_id) values (gid, c); exception when others then failed := true; end;
  assert failed, 'non-admin must not add members';
  failed := false; begin update conversation_members set role = 'admin' where conversation_id = gid and user_id = b; exception when others then failed := true; end;
  assert failed, 'members must not change their own role';
  perform pg_temp.as_user(a);
  insert into conversation_members (conversation_id, user_id) values (gid, c);   -- admin can

  perform pg_temp.as_admin();
  raise notice 'All RLS checks passed.';
end $$;

rollback;
