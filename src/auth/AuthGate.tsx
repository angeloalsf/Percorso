import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './AuthProvider'
import { Splash } from '@/components/ui/splash'

/** Wraps the public auth routes: signed-in users go straight to the app. */
export function AuthGate() {
  const { session, loading } = useAuth()
  if (loading) return <Splash />
  if (session) return <Navigate to="/finances" replace />
  return <Outlet />
}
