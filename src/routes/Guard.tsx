import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthProvider'

export function Protected() {
  const { session, loading, hasProfile } = useAuth()
  if (loading || (session && hasProfile === null)) return <div className="center muted">Loading…</div>
  if (!session) return <Navigate to="/login" replace />
  if (!hasProfile) return <Navigate to="/setup" replace />
  return <Outlet />
}
