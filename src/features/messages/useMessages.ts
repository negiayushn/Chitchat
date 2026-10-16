import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'

export type Message = { id: string; conversation_id: string; sender_id: string; body: string | null; reply_to: string | null; created_at: string; edited_at: string | null; deleted_at: string | null; pending?: boolean; failed?: boolean }
export type Attachment = { id: string; message_id: string; storage_path: string; file_name: string; mime_type: string; size_bytes: number; duration_ms: number | null }
export type Reaction = { message_id: string; user_id: string; emoji: string }
export type Receipt = { delivered: boolean; read: boolean }   // "any recipient" semantics; exact for DMs
const PAGE = 40

export function useMessages(conversationId: string, meId: string) {
  const [messages, setMessages] = useState<Message[]>([])
  const [reactions, setReactions] = useState<Reaction[]>([])
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [receipts, setReceipts] = useState<Record<string, Receipt>>({})
  const [loading, setLoading] = useState(true); const [hasMore, setHasMore] = useState(true); const [error, setError] = useState<string | null>(null)
  const oldest = useRef<string | null>(null)
  const gen = useRef(0)   // bumped whenever the conversation (or a StrictMode re-run) restarts; stale responses are dropped
  const ids = useRef(new Set<string>()); const mine = useRef(new Set<string>())

  const markRead = useCallback(async (incomingIds: string[] = []) => {
    const now = new Date().toISOString()
    await supabase.from('conversation_members').update({ last_read_at: now }).eq('conversation_id', conversationId).eq('user_id', meId)
    if (incomingIds.length) await supabase.from('message_receipts')
      .upsert(incomingIds.map(message_id => ({ message_id, user_id: meId, delivered_at: now, read_at: now })), { onConflict: 'message_id,user_id' })
  }, [conversationId, meId])

  const loadExtras = useCallback(async (page: Message[]) => {
    const all = page.map(m => m.id); const own = page.filter(m => m.sender_id === meId).map(m => m.id)
    all.forEach(i => ids.current.add(i)); own.forEach(i => mine.current.add(i))
    if (all.length) {
      const { data } = await supabase.from('message_reactions').select('message_id, user_id, emoji').in('message_id', all)
      if (data) setReactions(prev => [...prev.filter(r => !all.includes(r.message_id)), ...(data as Reaction[])])
      const { data: att } = await supabase.from('attachments').select('*').in('message_id', all)
      if (att) setAttachments(prev => [...prev.filter(a => !all.includes(a.message_id)), ...(att as Attachment[])])
    }
    if (own.length) {
      const { data } = await supabase.from('message_receipts').select('message_id, delivered_at, read_at').in('message_id', own)
      if (data) setReceipts(prev => { const n = { ...prev }
        for (const r of data) { const c = n[r.message_id] ?? { delivered: false, read: false }
          n[r.message_id] = { delivered: c.delivered || !!r.delivered_at, read: c.read || !!r.read_at } }
        return n })
    }
  }, [meId])

  const loadOlder = useCallback(async () => {
    const g = gen.current
    let q = supabase.from('messages').select('*').eq('conversation_id', conversationId).order('created_at', { ascending: false }).limit(PAGE)
    if (oldest.current) q = q.lt('created_at', oldest.current)
    const { data, error } = await q
    if (g !== gen.current) return
    if (error) { setError('Could not load messages.'); setLoading(false); return }
    const page = (data as Message[]).reverse()
    if (page.length) oldest.current = page[0].created_at
    setHasMore(data.length === PAGE)
    setMessages(prev => { const have = new Set(prev.map(m => m.id)); return [...page.filter(m => !have.has(m.id)), ...prev] })
    setLoading(false)
    await loadExtras(page)
    return page
  }, [conversationId, loadExtras])

  useEffect(() => {
    gen.current += 1
    setMessages([]); setReactions([]); setAttachments([]); setReceipts({}); setLoading(true); setHasMore(true); setError(null)
    oldest.current = null; ids.current.clear(); mine.current.clear()
    void loadOlder().then(page => markRead((page ?? []).filter(m => m.sender_id !== meId).map(m => m.id)))
    const f = `conversation_id=eq.${conversationId}`
    const ch = supabase.channel(`msgs:${conversationId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: f }, p => {
        const m = p.new as Message; ids.current.add(m.id); if (m.sender_id === meId) mine.current.add(m.id)
        setMessages(prev => prev.some(x => x.id === m.id) ? prev : [...prev.filter(x => !(x.pending && x.body === m.body && m.sender_id === meId)), m])
        if (m.sender_id !== meId) void markRead([m.id]) })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: f }, p =>
        setMessages(prev => prev.map(x => x.id === (p.new as Message).id ? (p.new as Message) : x)))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, p => {
        const r = (p.eventType === 'DELETE' ? p.old : p.new) as Reaction
        if (!ids.current.has(r.message_id)) return   // other conversation (RLS already limits to ours)
        setReactions(prev => { const rest = prev.filter(x => !(x.message_id === r.message_id && x.user_id === r.user_id && x.emoji === r.emoji))
          return p.eventType === 'DELETE' ? rest : [...rest, r] }) })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_receipts' }, p => {
        const r = p.new as { message_id: string; delivered_at: string | null; read_at: string | null }
        if (!mine.current.has(r.message_id)) return
        setReceipts(prev => { const c = prev[r.message_id] ?? { delivered: false, read: false }
          return { ...prev, [r.message_id]: { delivered: c.delivered || !!r.delivered_at, read: c.read || !!r.read_at } } }) })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'attachments' }, p => {
        const a = p.new as Attachment   // arrives just after its message; RLS limits events to our conversations
        setAttachments(prev => prev.some(x => x.id === a.id) ? prev : [...prev, a]) })
      .subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [conversationId, loadOlder, markRead, meId])

  const send = useCallback(async (body: string, replyTo: string | null = null) => {
    const temp: Message = { id: `tmp-${crypto.randomUUID()}`, conversation_id: conversationId, sender_id: meId, body, reply_to: replyTo, created_at: new Date().toISOString(), edited_at: null, deleted_at: null, pending: true }
    setMessages(prev => [...prev, temp])
    const { data, error } = await supabase.from('messages').insert({ conversation_id: conversationId, sender_id: meId, body, reply_to: replyTo }).select().single()
    if (data) { ids.current.add(data.id); mine.current.add(data.id) }
    setMessages(prev => error ? prev.map(m => m.id === temp.id ? { ...m, pending: false, failed: true } : m)
      : [...prev.filter(m => m.id !== temp.id && m.id !== data.id), data as Message])
  }, [conversationId, meId])

  const edit = useCallback(async (id: string, body: string): Promise<boolean> => {
    const edited_at = new Date().toISOString()
    const { error } = await supabase.from('messages').update({ body, edited_at }).eq('id', id)
    if (!error) setMessages(prev => prev.map(m => m.id === id ? { ...m, body, edited_at } : m))
    return !error
  }, [])

  const remove = useCallback(async (id: string): Promise<boolean> => {
    const { error } = await supabase.rpc('delete_message_for_everyone', { mid: id })
    if (!error) setMessages(prev => prev.map(m => m.id === id ? { ...m, body: null, deleted_at: new Date().toISOString() } : m))
    return !error
  }, [])

  const react = useCallback(async (message_id: string, emoji: string) => {
    const has = reactions.some(r => r.message_id === message_id && r.user_id === meId && r.emoji === emoji)
    const mineR: Reaction = { message_id, user_id: meId, emoji }
    setReactions(prev => has ? prev.filter(r => !(r.message_id === message_id && r.user_id === meId && r.emoji === emoji)) : [...prev, mineR])
    const { error } = has
      ? await supabase.from('message_reactions').delete().match(mineR)
      : await supabase.from('message_reactions').insert(mineR)
    if (error) setReactions(prev => has ? [...prev, mineR] : prev.filter(r => !(r.message_id === message_id && r.user_id === meId && r.emoji === emoji)))
  }, [reactions, meId])

  const addLocal = useCallback((m: Message, a?: Attachment) => {
    ids.current.add(m.id); mine.current.add(m.id)
    setMessages(prev => prev.some(x => x.id === m.id) ? prev : [...prev, m])
    if (a) setAttachments(prev => prev.some(x => x.id === a.id) ? prev : [...prev, a])
  }, [])

  return { messages, attachments, addLocal, reactions, receipts, loading, hasMore, error, loadOlder, send, edit, remove, react }
}
