# NOVA Chat

Real-time messaging on React + Supabase. Name and colors: `src/config/brand.ts`, `src/styles/tokens.css`.

## Setup
1. Create a Supabase project.
2. In the SQL editor run `supabase/migrations/0001_init.sql`, then `0002_unread.sql`.
3. Auth → URL Configuration: add `http://localhost:5173` and your production URL to Site URL / Redirect URLs
   (needed for email verification and `/reset`). Keep "Confirm email" enabled.
4. `cp .env.example .env` and fill in the project URL and **anon** key. Never use the service-role key in the frontend.
5. `npm install && npm run dev`.
6. Optional: run `supabase/tests/rls_test.sql` in the SQL editor to check the access rules (it rolls back).

## Status
Implemented (untested against a live project until you run it): auth with verification, login, forgot/reset password,
profile setup, protected routes, DM creation, paginated history, Realtime send/receive, server-side unread counts,
conversation search, light/dark theme, mobile single-pane layout.

Not yet implemented: groups UI, attachments, replies/reactions/edit/delete UI, receipts UI, typing, voice messages,
message search, calls, notifications, settings screens, rate limiting, E2E encryption (not planned for the MVP;
Supabase provides transport and at-rest encryption only).

## Attachments (migration 0004)
Images, video (mp4/webm), PDF, text and Office files up to 25 MB. Validated in the UI, then again by the bucket
(size + declared MIME type) and the `attachments` table (check constraint + path must sit inside the message's conversation folder).
Files are private and shown through 1-hour signed URLs. Known limits: the bucket checks the declared Content-Type, not file contents;
files of deleted messages lose their database row but the storage object is not yet purged (needs a cleanup job).
