import { useQuery } from '@tanstack/react-query'
import { ChevronDown, FileText, Globe2, LogOut, ScanSearch, ShieldCheck, Ship, Siren } from 'lucide-react'
import { NavLink, Outlet, useNavigate } from 'react-router'
import type { LucideIcon } from 'lucide-react'
import { hasRole, useAuth } from '../auth/store'
import { api, MOCK_MODE } from '../lib/api'
import { cn } from '../lib/cn'
import PageCurtain from './PageCurtain'
import { useUi } from '../store/ui'

const NAV: { to: string; label: string; end?: boolean; Icon?: LucideIcon }[] = [
  { to: '/app', label: 'Dashboard', end: true },
  { to: '/app/detect', label: 'Detect', Icon: ScanSearch },
  { to: '/app/map', label: 'Live Map', Icon: Globe2 },
  { to: '/app/incidents', label: 'Incidents', Icon: Siren },
  { to: '/app/vessels', label: 'Vessels', Icon: Ship },
  { to: '/app/reports', label: 'Reports', Icon: FileText },
]

const navLink = ({ isActive }: { isActive: boolean }) =>
  cn(
    'inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-ink-2 transition-colors hover:bg-surface hover:text-ink',
    isActive && 'bg-ink text-bg shadow-sm hover:bg-ink hover:text-bg',
  )

function Dot({ ok, label, detail }: { ok: boolean | null; label: string; detail: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-ink-3" title={`${label}: ${detail}`}>
      <span className={cn('size-1.5 rounded-full', ok === null ? 'bg-ink-3 animate-pulse' : ok ? 'bg-ok' : 'bg-crit')} />
      {label}
    </span>
  )
}

export default function AppShell() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { zoneId, setZone } = useUi()
  const health = useQuery({ queryKey: ['health'], queryFn: api.health, refetchInterval: 30_000 })
  const overview = useQuery({ queryKey: ['overview'], queryFn: api.overview })
  const h = health.data

  const onLogout = () => { logout(); void navigate('/login', { replace: true }) }

  return (
    <div className="grid h-dvh grid-rows-[64px_1fr] bg-bg">
      {/* Top navigation. Buttons, not a sidebar — every destination is one click away, always visible. */}
      <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur">
        {/* Three zones spread across the full width: identity left, destinations centre,
            working context + account right. */}
        <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between gap-4 px-4">
          <div className="flex justify-start">
            <NavLink to="/app" className="flex shrink-0 items-center gap-2">
              <span className="grid size-8 place-items-center rounded bg-ink font-pixel text-sm text-bg">S</span>
              <span className="hidden font-display text-[15px] font-bold tracking-wide sm:inline">SAGARNETRA</span>
            </NavLink>
          </div>

          <nav className="flex min-w-0 items-center gap-0.5 overflow-x-auto rounded-lg bg-surface-2/70 p-1">
            {NAV.map(({ to, label, end, Icon }) => (
              <NavLink key={to} to={to} end={end} className={navLink}>
                {Icon && <Icon className="size-[15px]" aria-hidden />}
                {label}
              </NavLink>
            ))}
            {hasRole(user, 'admin') && (
              <NavLink to="/app/admin" className={navLink}>
                <ShieldCheck className="size-[15px]" aria-hidden />
                Admin
              </NavLink>
            )}
          </nav>

          <div className="flex items-center justify-end gap-3">
            <div className="hidden items-center gap-3 lg:flex">
              <Dot ok={h ? h.model !== 'missing' : null} label="model" detail={h?.model ?? 'checking'} />
              <Dot ok={h ? h.database !== 'disconnected' : null} label="db" detail={h?.database ?? 'checking'} />
              <Dot ok={h ? h.ais_collector !== 'stopped' : null} label="ais" detail={h?.ais_collector ?? 'checking'} />
            </div>

            {MOCK_MODE && (
              <span
                className="hidden shrink-0 rounded border border-accent/40 bg-accent-soft px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-accent-deep sm:inline"
                title="VITE_API_BASE is empty: the UI is running on bundled mock data"
              >
                mock data
              </span>
            )}

            <span className="hidden h-6 w-px shrink-0 bg-line lg:block" aria-hidden />

            <label className="relative hidden shrink-0 items-center md:flex">
              <span className="sr-only">Zone</span>
              <select
                value={zoneId}
                onChange={(e) => setZone(e.target.value)}
                className="appearance-none rounded-md border border-line bg-surface-2 py-1.5 pl-3 pr-7 font-mono text-xs text-ink"
              >
                {(overview.data?.zones ?? [{ id: zoneId, name: 'Loading…' }]).map((z) => (
                  <option key={z.id} value={z.id}>{z.name}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 size-3.5 text-ink-3" aria-hidden />
            </label>

            <button
              onClick={onLogout}
              className="flex shrink-0 items-center gap-2 rounded-full bg-ink py-1.5 pl-1.5 pr-3 text-bg transition-opacity hover:opacity-90"
              title="Sign out"
            >
              <span className="grid size-6 place-items-center rounded-full bg-white/15 text-[11px] font-semibold uppercase">
                {(user?.name ?? user?.role ?? '?').slice(0, 1)}
              </span>
              <span className="hidden text-xs font-semibold sm:inline">{user?.role}</span>
              <LogOut className="size-3.5" aria-hidden />
            </button>
          </div>
        </div>
      </header>

      <main className="min-h-0 overflow-auto">
        <Outlet />
      </main>

      <PageCurtain />
    </div>
  )
}
