import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { supabase } from '../../lib/supabase'
import { brand } from '../../config/brand'
import { useAuth } from './AuthProvider'

const creds = z.object({ email: z.string().email('Enter a valid email'), password: z.string().min(8, 'At least 8 characters') })
const profile = z.object({
  username: z.string().regex(/^[a-z0-9_]{3,24}$/, '3–24 chars: lowercase letters, numbers, underscore'),
  display_name: z.string().min(1, 'Display name is required').max(60),
})

function useSubmit(fn: () => Promise<string | null>) {
  const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => { e.preventDefault(); setBusy(true); setError(null)
    try { setError(await fn()) } catch { setError('Something went wrong. Please try again.') } finally { setBusy(false) } }
  return { error, busy, submit }
}

export function LoginPage() {
  const { session } = useAuth()
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('')
  const { error, busy, submit } = useSubmit(async () => {
    const p = creds.safeParse({ email, password }); if (!p.success) return p.error.issues[0].message
    const { error } = await supabase.auth.signInWithPassword(p.data)
    if (error) return error.message === 'Email not confirmed' ? 'Please verify your email first.' : 'Invalid email or password.'
    return null
  })
  if (session) return <Navigate to="/" replace />
  return <div className="center"><form className="card" onSubmit={submit}>
    <h2 style={{ margin: 0 }}>{brand.name}</h2><span className="muted">{brand.tagline}</span>
    <input className="input" type="email" placeholder="Email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} />
    <input className="input" type="password" placeholder="Password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} />
    {error && <div className="err" role="alert">{error}</div>}
    <button className="btn" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
    <Link to="/forgot" className="muted">Forgot password?</Link>
    <span className="muted">New here? <Link to="/register">Create an account</Link></span>
  </form></div>
}

export function RegisterPage() {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [sent, setSent] = useState(false)
  const { error, busy, submit } = useSubmit(async () => {
    const p = creds.safeParse({ email, password }); if (!p.success) return p.error.issues[0].message
    const { error } = await supabase.auth.signUp({ ...p.data, options: { emailRedirectTo: window.location.origin } })
    if (error) return error.message
    setSent(true); return null
  })
  if (sent) return <div className="center"><div className="card"><h3 style={{ margin: 0 }}>Check your inbox</h3>
    <span className="muted">We sent a verification link to {email}. Open it, then sign in.</span><Link to="/login">Back to sign in</Link></div></div>
  return <div className="center"><form className="card" onSubmit={submit}>
    <h2 style={{ margin: 0 }}>Create your account</h2>
    <input className="input" type="email" placeholder="Email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} />
    <input className="input" type="password" placeholder="Password (8+ characters)" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} />
    {error && <div className="err" role="alert">{error}</div>}
    <button className="btn" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
    <span className="muted">Have an account? <Link to="/login">Sign in</Link></span>
  </form></div>
}

export function ProfileSetupPage() {
  const { session, hasProfile, refreshProfile } = useAuth(); const nav = useNavigate()
  const [username, setUsername] = useState(''); const [display_name, setName] = useState('')
  const { error, busy, submit } = useSubmit(async () => {
    const p = profile.safeParse({ username: username.toLowerCase(), display_name: display_name.trim() }); if (!p.success) return p.error.issues[0].message
    const { error } = await supabase.from('profiles').insert({ id: session!.user.id, ...p.data })
    if (error) return error.code === '23505' ? 'That username is taken.' : 'Could not save your profile.'
    await refreshProfile(); nav('/'); return null
  })
  if (!session) return <Navigate to="/login" replace />
  if (hasProfile) return <Navigate to="/" replace />
  return <div className="center"><form className="card" onSubmit={submit}>
    <h2 style={{ margin: 0 }}>Set up your profile</h2>
    <input className="input" placeholder="Display name" value={display_name} onChange={e => setName(e.target.value)} />
    <input className="input" placeholder="username" value={username} onChange={e => setUsername(e.target.value)} />
    {error && <div className="err" role="alert">{error}</div>}
    <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Continue'}</button>
  </form></div>
}
