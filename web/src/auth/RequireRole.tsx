import { Navigate, Outlet } from 'react-router'
import { hasRole, useAuth } from './store'
import type { Role } from '../lib/types'

export default function RequireRole({ role }: { role: Role }) {
  const user = useAuth((s) => s.user)
  if (!hasRole(user, role)) return <Navigate to="/app" replace />
  return <Outlet />
}
