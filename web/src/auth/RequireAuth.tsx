import { useEffect } from 'react'
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router'
import { useAuth } from './store'
import { UNAUTHORIZED_EVENT } from '../lib/api'
import { Spinner } from '../components/Primitives'

export default function RequireAuth() {
  const { user, status, restore, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => { if (status === 'idle') void restore() }, [status, restore])
  useEffect(() => {
    const onUnauthorized = () => { logout(); void navigate('/login', { replace: true, state: { from: location.pathname, reason: 'expired' } }) }
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
  }, [logout, navigate, location.pathname])

  if (status !== 'ready') {
    return <div className="grid h-dvh place-items-center text-ink-3"><Spinner label="Restoring session" /></div>
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <Outlet />
}
