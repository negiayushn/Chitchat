import { supabase } from '../../lib/supabase'
import type { Person } from './useConversations'

type Err = { message: string; code?: string } | null
const msg = (e: NonNullable<Err>) =>
  e.code === '23505' ? 'Already a member.' : e.message.includes('blocked') ? 'You can’t add this user.'
  : e.message.includes('not_allowed') ? 'This user doesn’t accept group invitations.'
  : e.message.includes('forbidden') || e.code === '42501' ? 'Only admins can do that.'
  : e.message.includes('last_admin') ? 'A group needs at least one admin.' : 'Something went wrong. Please try again.'
const res = (e: Err): string | null => (e ? msg(e) : null)

export async function findUser(username: string): Promise<Person | null> {
  const { data } = await supabase.from('profiles').select('id, username, display_name, avatar_url').eq('username', username.trim().toLowerCase()).maybeSingle()
  return (data as Person | null) ?? null
}
export async function createGroup(name: string, ids: string[]): Promise<{ id?: string; error?: string }> {
  const { data, error } = await supabase.rpc('create_group', { group_name: name, member_ids: ids })
  return error ? { error: msg(error) } : { id: data as string }
}
export async function addMember(cid: string, username: string) {
  const u = await findUser(username); if (!u) return 'No user with that username.'
  return res((await supabase.from('conversation_members').insert({ conversation_id: cid, user_id: u.id })).error)
}
export const removeMember = async (cid: string, uid: string) => res((await supabase.from('conversation_members').delete().eq('conversation_id', cid).eq('user_id', uid)).error)
export const setRole = async (cid: string, uid: string, role: 'admin' | 'member') => res((await supabase.rpc('set_member_role', { cid, uid, new_role: role })).error)
export const updateGroup = async (cid: string, name: string, description: string) => res((await supabase.from('conversations').update({ name, description: description || null }).eq('id', cid)).error)
export const deleteGroup = async (cid: string) => res((await supabase.from('conversations').delete().eq('id', cid)).error)
