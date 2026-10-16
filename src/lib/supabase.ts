import { createClient } from '@supabase/supabase-js'
const rawUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
if (!rawUrl || !key) throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env and restart the dev server.')
// Accept common copy/paste mistakes: trailing slash or the REST endpoint ("/rest/v1").
export const supabaseUrl = rawUrl.trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '')
if (!/^https:\/\/[^/]+$/.test(supabaseUrl)) throw new Error('VITE_SUPABASE_URL must look like https://YOUR-PROJECT.supabase.co')
export const supabase = createClient(supabaseUrl, key, { auth: { persistSession: true, autoRefreshToken: true } })
