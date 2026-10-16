import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { ArrowLeft, Check, CheckCheck, Paperclip, Pencil, Reply, Send, Trash2, X } from 'lucide-react'
import { useMessages, type Message } from './useMessages'
import { useUploads } from './useUploads'
import { AttachmentView } from './AttachmentView'
import { ACCEPT } from '../../lib/files'
import { GroupInfo } from '../conversations/GroupDialogs'
import type { ConversationItem } from '../conversations/useConversations'

const EMOJI = ['👍', '❤️', '😂', '😮', '🙏']
const snippet = (m?: Message) => !m ? 'Original message' : m.deleted_at ? 'Message deleted' : (m.body ?? '').slice(0, 80)

export function ChatPane({ convo, meId, onBack, onChanged }: { convo: ConversationItem; meId: string; onBack: () => void; onChanged: () => void }) {
  const id = convo.id; const title = convo.title; const [info, setInfo] = useState(false); const fileRef = useRef<HTMLInputElement>(null)
  const { messages, attachments, addLocal, reactions, receipts, loading, hasMore, error, loadOlder, send, edit, remove, react } = useMessages(id, meId)
  const [text, setText] = useState(''); const [sel, setSel] = useState<string | null>(null)
  const [replyTo, setReplyTo] = useState<Message | null>(null); const [editing, setEditing] = useState<Message | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const box = useRef<HTMLDivElement>(null); const prevHeight = useRef(0); const stick = useRef(true)
  const up = useUploads(id, meId, (m, a) => { stick.current = true; addLocal(m, a) })
  const byId = new Map(messages.map(m => [m.id, m]))

  useLayoutEffect(() => {
    const el = box.current; if (!el) return
    if (stick.current) el.scrollTop = el.scrollHeight; else el.scrollTop += el.scrollHeight - prevHeight.current
    prevHeight.current = el.scrollHeight
  }, [messages, reactions])
  useEffect(() => { stick.current = true; setSel(null); setReplyTo(null); setEditing(null) }, [id])

  const submit = async () => {
    const t = text.trim(); if (!t) return
    if (editing) {
      if (t !== editing.body && !(await edit(editing.id, t))) return setNotice('Could not edit the message.')
      setEditing(null)
    } else { stick.current = true; void send(t, replyTo?.id ?? null); setReplyTo(null) }
    setText(''); setNotice(null)
  }
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void submit() } if (e.key === 'Escape') { setEditing(null); setReplyTo(null) } }
  const del = async (m: Message) => { if (window.confirm('Delete this message for everyone?') && !(await remove(m.id))) setNotice('Could not delete the message.'); setSel(null) }

  const ticks = (m: Message) => {
    if (m.sender_id !== meId || m.pending || m.failed || m.deleted_at) return null
    const r = receipts[m.id]
    return r?.read ? <CheckCheck size={13} color="var(--accent-2)" aria-label="Read" /> : r?.delivered ? <CheckCheck size={13} aria-label="Delivered" /> : <Check size={13} aria-label="Sent" />
  }

  return <section className="pane">
    <header className="row" style={{ cursor: 'default' }}>
      <button className="btn ghost" onClick={onBack} aria-label="Back" style={{ padding: 8 }}><ArrowLeft size={18} /></button>
      <strong style={{ flex: 1, cursor: convo.type === 'group' ? 'pointer' : 'default' }} onClick={() => convo.type === 'group' && setInfo(true)}>{title}{convo.type === 'group' && <span className="muted" style={{ fontWeight: 400 }}> · {convo.members.length} members</span>}</strong>
    </header>
    <div className="msgs" ref={box} onScroll={e => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80 }}>
      {hasMore && !loading && <button className="btn ghost" onClick={() => { stick.current = false; void loadOlder() }}>Load earlier messages</button>}
      {loading && <div className="muted">Loading…</div>}
      {error && <div className="err" role="alert">{error}</div>}
      {!loading && !error && messages.length === 0 && <div className="muted" style={{ margin: 'auto' }}>No messages yet. Say hello.</div>}
      {messages.map(m => {
        const own = m.sender_id === meId; const chips = new Map<string, number>()
        reactions.filter(r => r.message_id === m.id).forEach(r => chips.set(r.emoji, (chips.get(r.emoji) ?? 0) + 1))
        return <div key={m.id} style={{ alignSelf: own ? 'flex-end' : 'flex-start', maxWidth: '78%', display: 'grid', gap: 4 }}>
          <div className={`bubble ${own ? 'mine' : ''}`} style={{ maxWidth: '100%' }} onClick={() => !m.deleted_at && setSel(s => s === m.id ? null : m.id)}>
            {convo.type === 'group' && !own && <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-2)' }}>{convo.members.find(x => x.id === m.sender_id)?.display_name ?? 'Former member'}</div>}
            {m.reply_to && <div className="quote">{snippet(byId.get(m.reply_to))}</div>}
            {!m.deleted_at && attachments.filter(a => a.message_id === m.id).map(a => <AttachmentView key={a.id} att={a} />)}
            {m.deleted_at ? <em style={{ opacity: .7 }}>Message deleted</em> : m.body}
            <div className="meta" style={{ display: 'flex', gap: 4, alignItems: 'center', justifyContent: 'flex-end' }}>
              {m.edited_at && !m.deleted_at && 'edited · '}{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              {m.pending && ' · sending…'}{m.failed && ' · failed'}{ticks(m)}
            </div>
          </div>
          {chips.size > 0 && <div className="chips" style={{ justifyContent: own ? 'flex-end' : 'flex-start' }}>
            {[...chips].map(([e, n]) => <button key={e} className={`chip ${reactions.some(r => r.message_id === m.id && r.user_id === meId && r.emoji === e) ? 'on' : ''}`} onClick={() => void react(m.id, e)}>{e} {n}</button>)}</div>}
          {sel === m.id && <div className="actions" style={{ justifySelf: own ? 'end' : 'start' }}>
            {EMOJI.map(e => <button key={e} aria-label={`React ${e}`} onClick={() => { void react(m.id, e); setSel(null) }}>{e}</button>)}
            <button aria-label="Reply" onClick={() => { setReplyTo(m); setEditing(null); setSel(null) }}><Reply size={15} /></button>
            {own && <button aria-label="Edit" onClick={() => { setEditing(m); setReplyTo(null); setText(m.body ?? ''); setSel(null) }}><Pencil size={15} /></button>}
            {own && <button aria-label="Delete" onClick={() => void del(m)}><Trash2 size={15} /></button>}
          </div>}
        </div>
      })}
      {up.uploads.map(u => <div key={u.id} className="bubble mine" style={{ minWidth: 200 }}>
        <div style={{ overflowWrap: 'anywhere' }}>{u.file.name}</div>
        {u.error ? <div style={{ fontSize: 13 }}>{u.error} <button className="chip" onClick={() => up.retry(u)}>Retry</button> <button className="chip" onClick={() => up.dismiss(u.id)}>Dismiss</button></div>
          : <div className="bar" role="progressbar" aria-valuenow={u.progress}><div style={{ width: `${u.progress}%` }} /></div>}
      </div>)}
    </div>
    {(replyTo || editing) && <div className="row" style={{ cursor: 'default', borderTop: '1px solid var(--border)', borderBottom: 0 }}>
      <div style={{ flex: 1, minWidth: 0 }}><div className="muted" style={{ fontSize: 12 }}>{editing ? 'Editing message' : 'Replying to'}</div><div>{snippet(editing ?? replyTo ?? undefined)}</div></div>
      <button className="btn ghost" aria-label="Cancel" style={{ padding: 6 }} onClick={() => { setReplyTo(null); setEditing(null); setText('') }}><X size={16} /></button></div>}
    {notice && <div className="err" role="alert" style={{ padding: '0 14px' }}>{notice}</div>}
    <div className="composer">
      <input ref={fileRef} type="file" hidden multiple accept={ACCEPT} onChange={e => { const errs = up.add(e.target.files); setNotice(errs[0] ?? null); e.target.value = '' }} />
      <button className="btn ghost" aria-label="Attach file" style={{ padding: 8 }} onClick={() => fileRef.current?.click()}><Paperclip size={16} /></button>
      <textarea className="input" rows={1} placeholder="Write a message" value={text} onChange={e => setText(e.target.value)} onKeyDown={onKey} maxLength={4000} />
      <button className="btn" onClick={() => void submit()} aria-label={editing ? 'Save edit' : 'Send'}>{editing ? <Check size={16} /> : <Send size={16} />}</button>
    </div>
    {info && <GroupInfo convo={convo} meId={meId} onClose={() => setInfo(false)} onChanged={onChanged} onGone={() => { setInfo(false); onBack() }} />}
  </section>
}
