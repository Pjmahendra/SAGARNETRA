import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { KeyRound, Plus, ShieldCheck, UserPlus } from 'lucide-react'
import { api } from '../lib/api'
import { fmtAgo, fmtUtc } from '../lib/format'
import { cn } from '../lib/cn'
import { Button, ErrorNote, PageHeader, Panel, Spinner, Table } from '../components/Primitives'
import type { AdminUser, Region, Role, ZoneStatus } from '../lib/types'

const TABS = ['Officers', 'Sectors', 'Audit log', 'System health'] as const
const REGIONS: Region[] = ['West', 'North-West', 'East', 'North-East', 'A&N', 'Europe']

/**
 * Admin console. Two things happen here that nothing else in the product can do: an officer account
 * is created, and an officer is given sectors.
 *
 * Sector assignment is not cosmetic. Every read endpoint filters by the officer's `zone_ids`, so
 * this screen decides what each officer can see: their incidents, their vessels, their reports.
 */
export default function Admin() {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Officers')
  const qc = useQueryClient()
  const users = useQuery({ queryKey: ['admin', 'users'], queryFn: api.adminUsers })
  const zones = useQuery({ queryKey: ['admin', 'zones'], queryFn: api.adminZones })
  const audit = useQuery({ queryKey: ['admin', 'audit'], queryFn: api.adminAudit, enabled: tab === 'Audit log' })
  const health = useQuery({ queryKey: ['health'], queryFn: api.health })

  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<AdminUser | null>(null)

  const refetch = () => { void qc.invalidateQueries({ queryKey: ['admin'] }) }
  const onErr = (e: unknown) => setError(e instanceof Error ? e.message : 'Something went wrong')

  const patch = useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Parameters<typeof api.adminPatchUser>[1]) => api.adminPatchUser(id, body),
    onSuccess: () => { setError(null); refetch() }, onError: onErr,
  })
  const reset = useMutation({
    mutationFn: (id: string) => api.adminResetPassword(id),
    onSuccess: (r) => { setError(null); setNotice(`Temporary password: ${r.temp_password} — give it to the officer; they must change it at next sign-in.`) },
    onError: onErr,
  })

  const zoneName = useMemo(() => new Map((zones.data ?? []).map((z) => [z.id, z.name])), [zones.data])
  const officersByZone = useMemo(() => {
    const m = new Map<string, AdminUser[]>()
    for (const u of users.data ?? []) for (const z of u.zone_ids ?? []) m.set(z, [...(m.get(z) ?? []), u])
    return m
  }, [users.data])

  return (
    <div className="p-6">
      <PageHeader eyebrow="Administration" title="Admin"
        description="Provision officer accounts, assign the sectors each one is responsible for, and check that every part of the platform is running. An officer sees only the sectors assigned here." />

      <div className="mb-4 flex gap-1 border-b border-line">
        {TABS.map((t) => (
          <button key={t} onClick={() => { setTab(t); setNotice(null) }}
            className={cn('-mb-px border-b-2 px-3 py-2 text-sm', tab === t ? 'border-accent text-ink' : 'border-transparent text-ink-3 hover:text-ink')}>{t}</button>
        ))}
      </div>

      {error && <div className="mb-3"><ErrorNote message={error} /></div>}
      {notice && (
        <div className="mb-3 flex items-start justify-between gap-3 rounded-md border border-ok/40 bg-ok-soft px-3 py-2 text-sm">
          <span className="font-mono">{notice}</span>
          <button onClick={() => setNotice(null)} className="shrink-0 text-xs text-ink-2 underline">dismiss</button>
        </div>
      )}

      {tab === 'Officers' && (!users.data ? <Spinner /> : (
        <>
          <div className="mb-3 flex justify-end">
            <Button onClick={() => setCreating(true)}><UserPlus className="size-4" />New officer</Button>
          </div>
          <Table>
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Region</th><th>Sectors</th><th>Status</th><th>Last login</th><th /></tr></thead>
            <tbody>
              {users.data.map((u) => (
                <tr key={u.id}>
                  <td className="font-semibold">{u.name}</td>
                  <td className="font-mono text-xs">{u.email}</td>
                  <td>
                    <span className={cn('rounded border px-1.5 py-0.5 font-mono text-[11px] uppercase', u.role === 'admin' ? 'border-accent/40 text-accent' : 'border-sea/40 text-sea')}>{u.role}</span>
                  </td>
                  <td className="text-ink-2">{u.region ?? '—'}</td>
                  <td>
                    {u.role === 'admin' ? (
                      <span className="inline-flex items-center gap-1 text-xs text-ink-2" title="Admins are not sector-scoped"><ShieldCheck className="size-3.5" />all sectors</span>
                    ) : (u.zone_ids ?? []).length === 0 ? (
                      // Worth flagging loudly: an officer with no sectors is not restricted, they
                      // are unrestricted, because an empty list cannot be distinguished from "no
                      // filter" at the query layer.
                      <span className="rounded border border-warn/50 bg-warn-soft px-1.5 py-0.5 font-mono text-[10px] uppercase text-warn" title="No sectors assigned: this officer currently sees every zone">unscoped</span>
                    ) : (
                      <span className="flex flex-wrap gap-1">
                        {(u.zone_ids ?? []).map((z) => (
                          <span key={z} className="rounded border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[10px]">{zoneName.get(z) ?? z}</span>
                        ))}
                      </span>
                    )}
                  </td>
                  <td>{u.active ? <span className="text-ok">active</span> : <span className="text-ink-3">disabled</span>}</td>
                  <td className="text-xs text-ink-3">{u.last_login ? fmtAgo(u.last_login) : 'never'}</td>
                  <td className="whitespace-nowrap text-right">
                    <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => { setNotice(null); setEditing(u) }}>Sectors</Button>{' '}
                    <Button variant="ghost" className="px-2 py-1 text-xs" disabled={reset.isPending}
                      onClick={() => { if (window.confirm(`Reset the password for ${u.email}?`)) reset.mutate(u.id) }}>
                      <KeyRound className="size-3.5" />Reset
                    </Button>{' '}
                    <Button variant={u.active ? 'danger' : 'ghost'} className="px-2 py-1 text-xs" disabled={patch.isPending}
                      onClick={() => patch.mutate({ id: u.id, active: !u.active })}>{u.active ? 'Disable' : 'Enable'}</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </>
      ))}

      {tab === 'Sectors' && (!zones.data ? <Spinner /> : (
        <>
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="max-w-[70ch] text-sm text-ink-2">
              A sector is one stretch of water an officer is answerable for. Sectors must not overlap: a detection is
              filed under the first sector whose outline contains it, so two overlapping sectors would make that
              arbitrary. Water outside every sector is visible to admins only. The badge on each sector says where
              its vessels come from — <strong className="text-ok">live AIS</strong> is real recorded traffic,{' '}
              <strong className="text-warn">scenario</strong> is the seeded reconstruction.
            </p>
            <NewSectorButton onDone={(msg) => { setNotice(msg); refetch() }} onError={onErr} />
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {zones.data.map((z) => (
              <Panel key={z.id} title={z.name}>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-ink-2">{z.region ?? 'region not set'}</span>
                  <span className="font-mono text-xs text-ink-3">{z.id}</span>
                </div>
                <dl className="mt-2 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-ink-2">Vessel feed</dt>
                    <dd>
                      {z.feed === 'live'
                        ? <span className="rounded border border-ok/40 bg-ok-soft px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-ok" title="Real AIS recorded from AISStream">live ais</span>
                        : z.feed === 'scenario'
                          ? <span className="rounded border border-warn/50 bg-warn-soft px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-warn" title="Seeded reconstruction, not real AIS">scenario</span>
                          : <span className="rounded border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-ink-3" title="No vessels filed under this sector at all">no data</span>}
                    </dd>
                  </div>
                  <div className="flex justify-between"><dt className="text-ink-2">Vessels now</dt><dd className="font-mono tnum">{z.vessels_now}</dd></div>
                  <div className="flex justify-between"><dt className="text-ink-2">Last scene</dt><dd className="font-mono text-xs">{z.last_scene_at ? fmtUtc(z.last_scene_at) : 'none'}</dd></div>
                </dl>
                <div className="mt-3 border-t border-line pt-2">
                  <div className="label-caps mb-1">Assigned officers</div>
                  {(officersByZone.get(z.id) ?? []).length === 0
                    ? <div className="text-xs text-warn">Nobody is watching this sector.</div>
                    : <div className="flex flex-wrap gap-1">{(officersByZone.get(z.id) ?? []).map((u) => (
                        <span key={u.id} className="rounded border border-line bg-surface-2 px-1.5 py-0.5 text-[11px]">{u.name}</span>
                      ))}</div>}
                </div>
              </Panel>
            ))}
          </div>
        </>
      ))}

      {tab === 'Audit log' && (!audit.data ? <Spinner /> : (
        <Table>
          <thead><tr><th>When (UTC)</th><th>Who</th><th>Action</th><th>Target</th></tr></thead>
          <tbody>{audit.data.map((a) => <tr key={a.id}><td className="font-mono text-xs">{fmtUtc(a.at)}</td><td className="font-mono text-xs">{a.who}</td><td className="font-mono text-xs text-accent">{a.action}</td><td className="font-mono text-xs text-ink-2">{a.target}</td></tr>)}</tbody>
        </Table>
      ))}

      {tab === 'System health' && (!health.data ? <Spinner /> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['Status', health.data.status, health.data.status === 'ok'],
            ['Database', health.data.database, health.data.database !== 'disconnected'],
            ['Model', health.data.model, health.data.model !== 'missing'],
            ['AIS collector', health.data.ais_collector, health.data.ais_collector !== 'stopped'],
          ].map(([k, v, ok]) => (
            <div key={String(k)} className="rounded-md border border-line bg-surface p-4">
              <div className="label-caps">{k}</div>
              <div className={cn('mt-1 font-display text-2xl font-semibold', ok ? 'text-ok' : 'text-crit')}>{String(v)}</div>
            </div>
          ))}
          <div className="rounded-md border border-line bg-surface p-4 text-xs text-ink-3 sm:col-span-2 lg:col-span-4">API version {health.data.version}</div>
        </div>
      ))}

      {creating && (
        <NewOfficerDialog zones={zones.data ?? []} onClose={() => setCreating(false)}
          onCreated={(msg) => { setCreating(false); setNotice(msg); refetch() }} onError={onErr} />
      )}
      {editing && (
        <SectorsDialog user={editing} zones={zones.data ?? []} onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refetch() }} onError={onErr} />
      )}
    </div>
  )
}

function Overlay({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-lg border border-line bg-surface p-5 shadow-xl">
        <h2 className="mb-4 font-display text-lg font-semibold">{title}</h2>
        {children}
      </div>
    </div>
  )
}

const field = 'mt-1 w-full rounded-md border border-line bg-bg px-3 py-2 text-sm'

/** Sector checkboxes, shared by "new officer" and "change sectors". */
function ZonePicker({ zones, value, onChange }: { zones: ZoneStatus[]; value: string[]; onChange: (v: string[]) => void }) {
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((z) => z !== id) : [...value, id])
  return (
    <div className="mt-1 max-h-56 space-y-1 overflow-auto rounded-md border border-line bg-bg p-2">
      {zones.length === 0 && <div className="p-2 text-xs text-ink-3">No sectors defined yet.</div>}
      {zones.map((z) => (
        <label key={z.id} className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-surface-2">
          <input type="checkbox" className="accent-accent" checked={value.includes(z.id)} onChange={() => toggle(z.id)} />
          <span className="flex-1">{z.name}</span>
          <span className="font-mono text-[10px] text-ink-3">{z.region ?? '—'}</span>
        </label>
      ))}
    </div>
  )
}

function NewOfficerDialog({ zones, onClose, onCreated, onError }: {
  zones: ZoneStatus[]; onClose: () => void; onCreated: (msg: string) => void; onError: (e: unknown) => void
}) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [org, setOrg] = useState('')
  const [role, setRole] = useState<Role>('officer')
  const [region, setRegion] = useState<Region>('West')
  const [zoneIds, setZoneIds] = useState<string[]>([])

  const create = useMutation({
    mutationFn: () => api.adminCreateUser({ email: email.trim(), name: name.trim(), role, org: org.trim(), region, zone_ids: zoneIds }),
    onSuccess: (r) => onCreated(`Created ${r.user.email}. Temporary password: ${r.temp_password} — they must change it at first sign-in.`),
    onError,
  })

  const valid = email.includes('@') && name.trim().length > 0 && (role === 'admin' || zoneIds.length > 0)

  return (
    <Overlay title="New officer">
      <div className="space-y-3">
        <label className="block text-sm"><span className="label-caps">Email</span>
          <input className={field} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@sagarnetra.in" /></label>
        <label className="block text-sm"><span className="label-caps">Name</span>
          <input className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="Lt. A. Menon" /></label>
        <label className="block text-sm"><span className="label-caps">Organisation</span>
          <input className={field} value={org} onChange={(e) => setOrg(e.target.value)} placeholder="ICG Region West, Porbandar" /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm"><span className="label-caps">Role</span>
            <select className={field} value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="officer">officer</option><option value="admin">admin</option>
            </select></label>
          <label className="block text-sm"><span className="label-caps">Region</span>
            <select className={field} value={region} onChange={(e) => setRegion(e.target.value as Region)}>
              {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select></label>
        </div>
        <div className="text-sm">
          <span className="label-caps">Sectors</span>
          <ZonePicker zones={zones} value={zoneIds} onChange={setZoneIds} />
          <p className="mt-1 text-[11px] text-ink-3">
            {role === 'admin'
              ? 'Admins see every sector regardless.'
              : 'At least one. An officer with none is unscoped and sees everything, which is almost never what you want.'}
          </p>
        </div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button disabled={!valid || create.isPending} onClick={() => create.mutate()}>
          {create.isPending ? 'Creating…' : 'Create officer'}
        </Button>
      </div>
    </Overlay>
  )
}

function SectorsDialog({ user, zones, onClose, onSaved, onError }: {
  user: AdminUser; zones: ZoneStatus[]; onClose: () => void; onSaved: () => void; onError: (e: unknown) => void
}) {
  const [zoneIds, setZoneIds] = useState<string[]>(user.zone_ids ?? [])
  const [region, setRegion] = useState<Region>((user.region as Region) ?? 'West')
  const save = useMutation({
    mutationFn: () => api.adminPatchUser(user.id, { zone_ids: zoneIds, region }),
    onSuccess: onSaved, onError,
  })
  return (
    <Overlay title={`Sectors — ${user.name}`}>
      <p className="mb-3 text-sm text-ink-2">
        This decides what {user.name.split(' ').slice(-1)[0]} can see: incidents, vessels and reports are all filtered
        to these sectors.
      </p>
      <label className="block text-sm"><span className="label-caps">Region</span>
        <select className={field} value={region} onChange={(e) => setRegion(e.target.value as Region)}>
          {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select></label>
      <div className="mt-3 text-sm"><span className="label-caps">Sectors</span>
        <ZonePicker zones={zones} value={zoneIds} onChange={setZoneIds} /></div>
      {zoneIds.length === 0 && user.role === 'officer' && (
        <p className="mt-2 text-[11px] text-warn">With no sectors this officer is unscoped and will see every zone.</p>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save sectors'}</Button>
      </div>
    </Overlay>
  )
}

/** Sectors are rectangles here. A drawn polygon needs a map editor; a bounding box needs four numbers. */
function NewSectorButton({ onDone, onError }: { onDone: (msg: string) => void; onError: (e: unknown) => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [region, setRegion] = useState<Region>('West')
  const [box, setBox] = useState({ west: '', south: '', east: '', north: '' })
  const n = (v: string) => Number(v)
  const valid = name.trim() && Object.values(box).every((v) => v !== '' && Number.isFinite(Number(v)))
    && n(box.west) < n(box.east) && n(box.south) < n(box.north)

  const create = useMutation({
    mutationFn: () => api.adminCreateZone({
      name: name.trim(), region,
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [n(box.west), n(box.south)], [n(box.east), n(box.south)],
          [n(box.east), n(box.north)], [n(box.west), n(box.north)], [n(box.west), n(box.south)],
        ]],
      },
    }),
    onSuccess: () => { setOpen(false); setName(''); setBox({ west: '', south: '', east: '', north: '' }); onDone(`Sector "${name.trim()}" created.`) },
    onError,
  })

  if (!open) return <Button onClick={() => setOpen(true)}><Plus className="size-4" />New sector</Button>
  return (
    <Overlay title="New sector">
      <div className="space-y-3">
        <label className="block text-sm"><span className="label-caps">Name</span>
          <input className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="Kandla Approaches" /></label>
        <label className="block text-sm"><span className="label-caps">Region</span>
          <select className={field} value={region} onChange={(e) => setRegion(e.target.value as Region)}>
            {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select></label>
        <div>
          <span className="label-caps">Bounding box, decimal degrees</span>
          <div className="mt-1 grid grid-cols-4 gap-2">
            {(['west', 'south', 'east', 'north'] as const).map((k) => (
              <label key={k} className="text-xs text-ink-2">{k}
                <input className={field} inputMode="decimal" value={box[k]} onChange={(e) => setBox({ ...box, [k]: e.target.value })} /></label>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-ink-3">
            Keep it clear of the sectors that already exist — overlapping sectors make it arbitrary which one a
            detection is filed under. Longitude east positive, latitude north positive.
          </p>
        </div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
        <Button disabled={!valid || create.isPending} onClick={() => create.mutate()}>{create.isPending ? 'Creating…' : 'Create sector'}</Button>
      </div>
    </Overlay>
  )
}
