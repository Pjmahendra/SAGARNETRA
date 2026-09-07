import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { useAuth } from '../auth/store'
import { ApiError, MOCK_MODE } from '../lib/api'
import { Button, ErrorNote } from '../components/Primitives'

export default function Login() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const state = (location.state ?? {}) as { from?: string; reason?: string }
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(state.reason === 'expired' ? 'Your session expired. Sign in again.' : null)

  if (user) return <Navigate to={state.from && state.from !== '/login' ? state.from : '/app'} replace />

  const submit = async (e?: FormEvent, creds?: [string, string]) => {
    e?.preventDefault()
    const [em, pw] = creds ?? [email, password]
    if (!em || !pw) { setError('Enter your email and password.'); return }
    setBusy(true); setError(null)
    try {
      await login(em, pw)
      void navigate(state.from && state.from !== '/login' ? state.from : '/app', { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sign-in failed. Try again.')
    } finally { setBusy(false) }
  }

  return (
    <div className="grid min-h-dvh md:grid-cols-[1.15fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-[#0a1220] md:block">
        <div className="absolute inset-0 opacity-90" style={{ background: 'radial-gradient(ellipse at 62% 48%, #05080e 0 9%, transparent 22%), radial-gradient(ellipse at 40% 60%, #101a2c 0 30%, transparent 55%), repeating-linear-gradient(135deg, #0c1424 0 2px, #0e1729 2px 4px)' }} />
        <div className="absolute inset-0 mix-blend-soft-light" style={{ backgroundImage: 'url("data:image/svg+xml;utf8,<svg xmlns=%27http://www.w3.org/2000/svg%27 width=%27160%27 height=%27160%27><filter id=%27n%27><feTurbulence type=%27fractalNoise%27 baseFrequency=%270.9%27 numOctaves=%272%27/></filter><rect width=%27160%27 height=%27160%27 filter=%27url(%23n)%27 opacity=%270.55%27/></svg>")' }} />
        <div className="absolute left-6 top-6 font-mono text-[11px] uppercase tracking-wider text-ink-3">Sentinel-1A · IW GRD · VV · 2026-09-06 01:12Z</div>
        <div className="absolute bottom-6 left-6 max-w-[40ch]">
          <div className="font-display text-3xl font-semibold leading-tight">Oil reads dark on radar. So do calm water and algae.</div>
          <p className="mt-2 text-sm text-ink-2">The model's job is telling them apart. The officer's job is deciding who to board. This console is where the two meet.</p>
        </div>
      </aside>

      <main className="grid place-items-center px-6 py-12">
        <form onSubmit={submit} className="w-full max-w-sm" noValidate>
          <div className="mb-8 flex items-center gap-2.5">
            <div className="grid size-9 place-items-center rounded bg-ink font-pixel text-base text-bg">S</div>
            <div>
              <div className="font-display text-xl font-bold tracking-wide">SAGARNETRA</div>
              <div className="label-caps text-[10px]">Indian Coast Guard · restricted</div>
            </div>
          </div>
          <h1 className="text-2xl font-semibold">Sign in</h1>
          <p className="mt-1 text-sm text-ink-3">Accounts are issued by your administrator. There is no self-registration.</p>

          <label className="mt-6 block text-sm">
            <span className="label-caps">Email</span>
            <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-ink placeholder:text-ink-3 focus:border-accent" placeholder="name@sagarnetra.in" />
          </label>
          <label className="mt-4 block text-sm">
            <span className="label-caps">Password</span>
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-ink focus:border-accent" />
          </label>

          {error && <div className="mt-4"><ErrorNote message={error} /></div>}

          <Button type="submit" disabled={busy} className="mt-5 w-full">{busy ? 'Signing in…' : 'Sign in'}</Button>

          <div className="mt-6 rounded-md border border-dashed border-line p-3 text-xs text-ink-3">
            <div className="label-caps mb-2">Demo accounts{MOCK_MODE ? ' · mock mode' : ''}</div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="ghost" disabled={busy} onClick={() => void submit(undefined, ['officer@sagarnetra.in', 'Officer@123'])}>Sign in as demo officer</Button>
              <Button type="button" variant="ghost" disabled={busy} onClick={() => void submit(undefined, ['admin@sagarnetra.in', 'Admin@123'])}>as admin</Button>
            </div>
          </div>
        </form>
      </main>
    </div>
  )
}
