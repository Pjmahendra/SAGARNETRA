import { create } from 'zustand'
import { api, tokenStore } from '../lib/api'
import type { Role, User } from '../lib/types'
import { useUi } from '../store/ui'

interface AuthState {
  user: User | null
  status: 'idle' | 'loading' | 'ready'
  login: (email: string, password: string) => Promise<User>
  logout: () => void
  restore: () => Promise<void>
}

// An officer's sector is their zone_ids; land them on it, not on whatever the last session's
// zone happened to be. Admins have none, so leave the zone selector wherever it already is.
const landOnHomeSector = (user: User) => {
  if (user.zone_ids.length > 0) useUi.getState().setZone(user.zone_ids[0])
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  status: 'idle',
  async login(email, password) {
    const res = await api.login(email, password)
    tokenStore.set(res.access_token)
    set({ user: res.user, status: 'ready' })
    landOnHomeSector(res.user)
    return res.user
  },
  logout() {
    tokenStore.clear()
    set({ user: null, status: 'ready' })
    void api.logout().catch(() => undefined)
  },
  async restore() {
    if (!tokenStore.get()) { set({ user: null, status: 'ready' }); return }
    set({ status: 'loading' })
    try {
      const user = await api.me()
      set({ user, status: 'ready' })
      landOnHomeSector(user)
    } catch {
      tokenStore.clear()
      set({ user: null, status: 'ready' })
    }
  },
}))

export const hasRole = (user: User | null, role: Role) =>
  !!user && (user.role === 'admin' || user.role === role)
