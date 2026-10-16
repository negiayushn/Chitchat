import { useState } from 'react'
import { Crown, LogOut, Trash2, UserMinus, X } from 'lucide-react'
import { addMember, createGroup, deleteGroup, findUser, removeMember, setRole, updateGroup } from './groupApi'
import type { ConversationItem, Person } from './useConversations'

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="overlay" onClick={onClose}><div className="card dialog" role="dialog" aria-label={title} onClick={e => e.stopPropagation()}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><h3 style={{ margin: 0 }}>{title}</h3>
      <button className="btn ghost" aria-label="Close" style={{ padding: 6 }} onClick={onClose}><X size={16} /></button></div>{children}</div></div>
}

export function NewGroupDialog({ meId, onClose, onCreated }: { meId: string; onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState(''); const [uname, setUname] = useState(''); const [people, setPeople] = useState<Person[]>([])
  const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false)
  const add = async () => {
    setError(null); const p = await findUser(uname)
    if (!p) return setError('No user with that username.')
    if (p.id === meId || people.some(x => x.id === p.id)) return setError('Already added.')
    setPeople([...people, p]); setUname('')
  }
  const create = async () => {
    const n = name.trim(); if (!n || n.length > 60) return setError('Enter a group name (max 60 characters).')
    if (!people.length) return setError('Add at least one member.')
    setBusy(true); const r = await createGroup(n, people.map(p => p.id)); setBusy(false)
    if (r.error) return setError(r.error); onCreated(r.id!)
  }
  return <Modal title="New group" onClose={onClose}>
    <input className="input" placeholder="Group name" value={name} maxLength={60} onChange={e => setName(e.target.value)} />
    <div style={{ display: 'flex', gap: 8 }}><input className="input" placeholder="Add by username" value={uname} onChange={e => setUname(e.target.value)} onKeyDown={e => e.key === 'Enter' && void add()} />
      <button className="btn ghost" onClick={() => void add()} disabled={!uname.trim()}>Add</button></div>
    <div className="chips">{people.map(p => <button key={p.id} className="chip" onClick={() => setPeople(people.filter(x => x.id !== p.id))}>{p.display_name} ✕</button>)}</div>
    {error && <div className="err" role="alert">{error}</div>}
    <button className="btn" onClick={() => void create()} disabled={busy}>{busy ? 'Creating…' : 'Create group'}</button>
  </Modal>
}

export function GroupInfo({ convo, meId, onClose, onChanged, onGone }: { convo: ConversationItem; meId: string; onClose: () => void; onChanged: () => void; onGone: () => void }) {
  const admin = convo.myRole === 'admin'
  const [name, setName] = useState(convo.title); const [desc, setDesc] = useState(convo.description ?? ''); const [uname, setUname] = useState('')
  const [error, setError] = useState<string | null>(null)
  const run = async (fn: () => Promise<string | null>, after?: () => void) => { setError(null); const e = await fn(); if (e) return setError(e); onChanged(); after?.() }

  return <Modal title="Group info" onClose={onClose}>
    {admin ? <>
      <input className="input" value={name} maxLength={60} onChange={e => setName(e.target.value)} aria-label="Group name" />
      <textarea className="input" rows={2} placeholder="Description" value={desc} maxLength={200} onChange={e => setDesc(e.target.value)} />
      <button className="btn ghost" disabled={!name.trim()} onClick={() => void run(() => updateGroup(convo.id, name.trim(), desc.trim()))}>Save details</button></>
      : <><strong>{convo.title}</strong>{convo.description && <span className="muted">{convo.description}</span>}</>}
    <div className="muted" style={{ fontSize: 13 }}>{convo.members.length} members</div>
    <div style={{ maxHeight: 220, overflowY: 'auto' }}>{convo.members.map(m => <div key={m.id} className="row" style={{ cursor: 'default', padding: '8px 0' }}>
      <div className="avatar" style={{ width: 32, height: 32 }}>{m.display_name.slice(0, 1).toUpperCase()}</div>
      <div style={{ flex: 1 }}>{m.display_name}{m.id === meId && ' (you)'} <span className="muted">@{m.username}</span></div>
      {m.role === 'admin' && <Crown size={14} color="var(--accent-2)" aria-label="Admin" />}
      {admin && m.id !== meId && <>
        <button className="btn ghost" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => void run(() => setRole(convo.id, m.id, m.role === 'admin' ? 'member' : 'admin'))}>{m.role === 'admin' ? 'Demote' : 'Make admin'}</button>
        <button className="btn ghost" aria-label={`Remove ${m.display_name}`} style={{ padding: 6 }} onClick={() => window.confirm(`Remove ${m.display_name}?`) && void run(() => removeMember(convo.id, m.id))}><UserMinus size={14} /></button></>}
    </div>)}</div>
    {admin && <div style={{ display: 'flex', gap: 8 }}><input className="input" placeholder="Add member by username" value={uname} onChange={e => setUname(e.target.value)} />
      <button className="btn ghost" disabled={!uname.trim()} onClick={() => void run(() => addMember(convo.id, uname), () => setUname(''))}>Add</button></div>}
    {error && <div className="err" role="alert">{error}</div>}
    <div style={{ display: 'flex', gap: 8 }}>
      <button className="btn ghost" onClick={() => window.confirm('Leave this group?') && void run(() => removeMember(convo.id, meId), onGone)}><LogOut size={14} /> Leave</button>
      {admin && <button className="btn ghost" style={{ color: 'var(--danger)' }} onClick={() => window.confirm('Delete this group and all its messages for everyone?') && void run(() => deleteGroup(convo.id), onGone)}><Trash2 size={14} /> Delete group</button>}
    </div>
  </Modal>
}
