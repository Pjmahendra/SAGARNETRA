import { create } from 'zustand'
import { api, tokenStore } from '../lib/api'
import type { Role, User } from '../lib/types'

interface AuthState {
  user: User | null
  status: 'idle' | 'loading' | 'ready'
  login: (email: string, password: string) => Promise<User>
  logout: () => void
  restore: () => Promise<void>
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  status: 'idle',
  async login(email, password) {
    const res = await api.login(email, password)
    tokenStore.set(res.access_token)
    set({ user: res.user, status: 'ready' })
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
    } catch {
      tokenStore.clear()
      set({ user: null, status: 'ready' })
    }
  },
}))

export const hasRole = (user: User | null, role: Role) =>
  !!user && (user.role === 'admin' || user.role === role)
