import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { supabase } from '../../lib/supabase'
import { useAuth } from './AuthProvider'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState(''); const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setError(null)
    if (!z.string().email().safeParse(email).success) return setError('Enter a valid email')
    setBusy(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset` })
    setBusy(false)
    // Same message whether or not the account exists, so this form can't be used to probe for emails.
    if (error && error.status === 429) return setError('Too many requests. Please wait a minute and try again.')
    setDone(true)
  }
  if (done) return <div className="center"><div className="card"><h3 style={{ margin: 0 }}>Check your inbox</h3>
    <span className="muted">If an account exists for {email}, a reset link is on its way.</span><Link to="/login">Back to sign in</Link></div></div>
  return <div className="center"><form className="card" onSubmit={submit}>
    <h2 style={{ margin: 0 }}>Reset your password</h2>
    <input className="input" type="email" placeholder="Email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} />
    {error && <div className="err" role="alert">{error}</div>}
    <button className="btn" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button>
    <Link to="/login" className="muted">Back to sign in</Link>
  </form></div>
}

export function ResetPasswordPage() {
  // Opening the emailed link signs the user into a recovery session, which AuthProvider picks up.
  const { session, loading } = useAuth(); const nav = useNavigate()
  const [pw, setPw] = useState(''); const [pw2, setPw2] = useState('')
  const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setError(null)
    if (pw.length < 8) return setError('At least 8 characters')
    if (pw !== pw2) return setError('Passwords do not match')
    setBusy(true); const { error } = await supabase.auth.updateUser({ password: pw }); setBusy(false)
    if (error) return setError(error.message)
    nav('/')
  }
  if (loading) return <div className="center muted">Loading…</div>
  if (!session) return <div className="center"><div className="card"><h3 style={{ margin: 0 }}>Link expired or invalid</h3>
    <Link to="/forgot">Request a new reset link</Link></div></div>
  return <div className="center"><form className="card" onSubmit={submit}>
    <h2 style={{ margin: 0 }}>Choose a new password</h2>
    <input className="input" type="password" placeholder="New password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} />
    <input className="input" type="password" placeholder="Confirm password" autoComplete="new-password" value={pw2} onChange={e => setPw2(e.target.value)} />
    {error && <div className="err" role="alert">{error}</div>}
    <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Update password'}</button>
  </form></div>
}
