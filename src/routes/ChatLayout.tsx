import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { LogOut, Plus, Search, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { brand } from '../config/brand'
import { useAuth } from '../features/auth/AuthProvider'
import { startDirect, useConversations } from '../features/conversations/useConversations'
import { ThemeToggle } from '../components/ThemeToggle'
import { NewGroupDialog } from '../features/conversations/GroupDialogs'
import { ChatPane } from '../features/messages/ChatPane'

export function ChatLayout() {
  const { session } = useAuth(); const meId = session!.user.id
  const { id } = useParams(); const nav = useNavigate()
  const { items, loading, error, reload } = useConversations(meId)
  const [tab, setTab] = useState<'all' | 'unread' | 'groups'>('all'); const [grp, setGrp] = useState(false)
  const [q, setQ] = useState(''); const [newName, setNewName] = useState(''); const [adding, setAdding] = useState(false); const [addErr, setAddErr] = useState<string | null>(null)
  const visible = items.filter(i => !i.archived && i.title.toLowerCase().includes(q.toLowerCase())
    && (tab === 'all' || (tab === 'unread' ? i.unread > 0 : i.type === 'group')))
  const current = items.find(i => i.id === id)

  const add = async () => { setAddErr(null); const r = await startDirect(newName)
    if (r.error) return setAddErr(r.error); setAdding(false); setNewName(''); nav(`/c/${r.id}`) }

  return <div className={`app ${id ? 'in-chat' : ''}`}>
    <aside className="list">
      <div className="row" style={{ cursor: 'default', justifyContent: 'space-between' }}>
        <strong>{brand.name}</strong>
        <span><ThemeToggle /><button className="btn ghost" aria-label="New group" onClick={() => setGrp(true)} style={{ padding: 8, marginRight: 6 }}><Users size={16} /></button><button className="btn ghost" aria-label="New chat" onClick={() => setAdding(a => !a)} style={{ padding: 8, marginRight: 6 }}><Plus size={16} /></button>
        <button className="btn ghost" aria-label="Sign out" onClick={() => supabase.auth.signOut()} style={{ padding: 8 }}><LogOut size={16} /></button></span>
      </div>
      {adding && <div style={{ padding: 12, display: 'grid', gap: 8 }}>
        <input className="input" placeholder="Username" value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} />
        {addErr && <div className="err" role="alert">{addErr}</div>}
        <button className="btn" onClick={add} disabled={!newName.trim()}>Start chat</button></div>}
      <div style={{ padding: 12, position: 'relative' }}>
        <Search size={15} style={{ position: 'absolute', left: 24, top: 23, color: 'var(--muted)' }} />
        <input className="input" style={{ paddingLeft: 34 }} placeholder="Search conversations" value={q} onChange={e => setQ(e.target.value)} />
      </div>
      <div className="tabs">{(['all', 'unread', 'groups'] as const).map(t => <button key={t} className={`tab ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>{t[0].toUpperCase() + t.slice(1)}</button>)}</div>
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {loading && <div className="muted" style={{ padding: 16 }}>Loading…</div>}
        {error && <div className="err" style={{ padding: 16 }} role="alert">{error}</div>}
        {!loading && !error && visible.length === 0 && <div className="muted" style={{ padding: 16 }}>{q ? 'No matches.' : 'No conversations yet. Tap + and enter a username.'}</div>}
        {visible.map(c => <div key={c.id} className={`row ${c.id === id ? 'on' : ''}`} onClick={() => nav(`/c/${c.id}`)}>
          <div className="avatar">{c.title.slice(0, 1).toUpperCase()}</div>
          <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 600 }}>{c.title}</div>
            <div className="muted" style={{ fontSize: 12 }}>{new Date(c.last_message_at).toLocaleDateString()}</div></div>
          {c.unread > 0 && <span className="badge">{c.unread}</span>}
        </div>)}
      </div>
    </aside>
    {id && current ? <ChatPane key={id} convo={current} meId={meId} onBack={() => nav('/')} onChanged={reload} />
      : <div className="center muted pane">Select a conversation</div>}
    {grp && <NewGroupDialog meId={meId} onClose={() => setGrp(false)} onCreated={cid => { setGrp(false); void reload(); nav(`/c/${cid}`) }} />}
  </div>
}
