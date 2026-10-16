import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export type Person = { id: string; username: string; display_name: string; avatar_url: string | null }
export type Member = Person & { role: 'admin' | 'member' }
export type ConversationItem = {
  id: string; type: 'direct' | 'group'; title: string; description: string | null; last_message_at: string
  pinned: boolean; archived: boolean; unread: number; members: Member[]; myRole: 'admin' | 'member'
}

export function useConversations(meId: string) {
  const [items, setItems] = useState<ConversationItem[]>([])
  const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [rows, counts] = await Promise.all([
      supabase.from('conversation_members')
        .select('pinned, archived, role, conversations(id, type, name, description, last_message_at, conversation_members(role, profiles(id, username, display_name, avatar_url)))')
        .eq('user_id', meId),
      supabase.rpc('unread_counts'),
    ])
    if (rows.error) { setError('Could not load conversations.'); setLoading(false); return }
    const unread = new Map<string, number>((counts.data ?? []).map((c: { conversation_id: string; unread: number }) => [c.conversation_id, Number(c.unread)]))
    const list = (rows.data as any[]).filter(r => r.conversations).map((r): ConversationItem => {
      const c = r.conversations
      const members: Member[] = c.conversation_members.filter((m: any) => m.profiles).map((m: any) => ({ ...m.profiles, role: m.role }))
      const other = members.find(p => p.id !== meId)
      return { id: c.id, type: c.type, description: c.description, last_message_at: c.last_message_at, pinned: r.pinned, archived: r.archived,
        title: c.type === 'group' ? c.name : other?.display_name ?? 'Unknown', unread: unread.get(c.id) ?? 0, members, myRole: r.role }
    })
    list.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.last_message_at.localeCompare(a.last_message_at))
    setItems(list); setError(null); setLoading(false)
  }, [meId])

  useEffect(() => {
    void load()
    const ch = supabase.channel('inbox')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, p => {
        // Record "delivered" when an incoming message reaches this open session (never overwrites an existing receipt).
        const m = p.new as { id?: string; sender_id?: string }
        if (p.eventType === 'INSERT' && m.id && m.sender_id !== meId)
          void supabase.from('message_receipts').upsert({ message_id: m.id, user_id: meId, delivered_at: new Date().toISOString() }, { onConflict: 'message_id,user_id', ignoreDuplicates: true })
        void load() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversation_members' }, () => void load())
      .subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [load, meId])

  return { items, loading, error, reload: load }
}

export async function startDirect(username: string): Promise<{ id?: string; error?: string }> {
  const { data: p } = await supabase.from('profiles').select('id').eq('username', username.trim().toLowerCase()).maybeSingle()
  if (!p) return { error: 'No user with that username.' }
  const { data, error } = await supabase.rpc('create_direct_conversation', { other: p.id })
  if (error) return { error: error.message.includes('blocked') ? 'You can’t message this user.' : error.message.includes('not_allowed') ? 'This user isn’t accepting messages.' : 'Could not start the conversation.' }
  return { id: data as string }
}
