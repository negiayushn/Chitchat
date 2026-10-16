import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'

type Ctx = { session: Session | null; loading: boolean; hasProfile: boolean | null; refreshProfile: () => Promise<void> }
const AuthCtx = createContext<Ctx>({ session: null, loading: true, hasProfile: null, refreshProfile: async () => {} })
export const useAuth = () => useContext(AuthCtx)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [hasProfile, setHasProfile] = useState<boolean | null>(null)

  const refreshProfile = async () => {
    const { data: { session: s } } = await supabase.auth.getSession()
    if (!s) return setHasProfile(null)
    const { data } = await supabase.from('profiles').select('id').eq('id', s.user.id).maybeSingle()
    setHasProfile(!!data)
  }
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s)) // fires on expiry/sign-out too
    return () => sub.subscription.unsubscribe()
  }, [])
  useEffect(() => { void refreshProfile() }, [session?.user.id])

  return <AuthCtx.Provider value={{ session, loading, hasProfile, refreshProfile }}>{children}</AuthCtx.Provider>
}
