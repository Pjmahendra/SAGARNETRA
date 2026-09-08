import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { useAuth } from '../auth/store'
import { ApiError, MOCK_MODE } from '../lib/api'
import { Button, ErrorNote } from '../components/Primitives'
import SeaBackdrop from '../components/SeaBackdrop'

/**
 * Attribution for the sign-in backdrop, shown bottom-right. Set this whenever you replace
 * `public/media/login.jpg`. For the stitched satellite view that ships in the repo it is:
 *   'Chennai–Ennore · imagery © Esri, Maxar, Earthstar Geographics'
 */
const BACKDROP_CREDIT = ''

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
    <div className="relative min-h-dvh overflow-hidden">
      {/* Moving water behind the whole page. Fixed so it never scrolls on a short window. */}
      <SeaBackdrop className="pointer-events-none absolute inset-0" />
      {/* Film grain, carried over from the old panel: it ties the photographic backdrop to the
          console's printed-instrument look instead of leaving it glossy. */}
      <div className="pointer-events-none absolute inset-0 opacity-40 mix-blend-soft-light" style={{ backgroundImage: 'url("data:image/svg+xml;utf8,<svg xmlns=%27http://www.w3.org/2000/svg%27 width=%27160%27 height=%27160%27><filter id=%27n%27><feTurbulence type=%27fractalNoise%27 baseFrequency=%270.9%27 numOctaves=%272%27/></filter><rect width=%27160%27 height=%27160%27 filter=%27url(%23n)%27 opacity=%270.55%27/></svg>")' }} />

      {/* One scrim across the whole page, not per column: a gradient that stops at the grid
          boundary leaves a hard vertical seam down the middle of the sea. */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgba(8,14,20,0.8)_0%,rgba(8,14,20,0.3)_34%,transparent_58%)]" />

      {/* Credit for whatever is behind the page. Keep this in step with public/media/login.jpg:
          the stitched satellite backdrop needs Esri's credit by licence, and a photograph needs
          whatever its own licence asks for. Empty renders nothing, which is only correct when the
          image genuinely needs no attribution. */}
      {BACKDROP_CREDIT && (
        <div className="pointer-events-none absolute bottom-2 right-3 z-10 font-mono text-[10px] text-white/35">{BACKDROP_CREDIT}</div>
      )}

      <div className="relative grid min-h-dvh md:grid-cols-[1.15fr_1fr]">
      <aside className="relative hidden md:block">
        <div className="absolute left-6 top-6 font-mono text-[11px] uppercase tracking-wider text-white/70 [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">Sentinel-1A · IW GRD · VV · 2026-09-06 01:12Z</div>
        <div className="absolute bottom-6 left-6 max-w-[40ch]">
          <div className="font-display text-3xl font-semibold leading-tight text-white [text-shadow:0_2px_12px_rgba(0,0,0,0.55)]">Oil reads dark on radar. So do calm water and algae.</div>
          <p className="mt-2 text-sm text-white/80 [text-shadow:0_1px_6px_rgba(0,0,0,0.6)]">The model's job is telling them apart. The officer's job is deciding who to board. This console is where the two meet.</p>
        </div>
      </aside>

      <main className="grid place-items-center px-6 py-12">
        {/* The form sits on its own panel rather than straight on the water: sign-in has to stay
            plainly legible, and every input keeps the same contrast it had before. */}
        <form onSubmit={submit} className="w-full max-w-sm rounded-xl border border-white/20 bg-bg/92 p-7 shadow-[0_24px_70px_-20px_rgba(6,12,20,0.65)] backdrop-blur-md" noValidate>
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
    </div>
  )
}
