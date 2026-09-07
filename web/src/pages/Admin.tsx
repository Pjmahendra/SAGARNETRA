import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { fmtAgo, fmtUtc } from '../lib/format'
import { cn } from '../lib/cn'
import { Button, PageHeader, Panel, Spinner, Table } from '../components/Primitives'

const TABS = ['Users', 'Watch zones', 'Audit log', 'System health'] as const

export default function Admin() {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Users')
  const users = useQuery({ queryKey: ['admin', 'users'], queryFn: api.adminUsers })
  const audit = useQuery({ queryKey: ['admin', 'audit'], queryFn: api.adminAudit, enabled: tab === 'Audit log' })
  const zones = useQuery({ queryKey: ['admin', 'zones'], queryFn: api.adminZones, enabled: tab === 'Watch zones' })
  const health = useQuery({ queryKey: ['health'], queryFn: api.health })

  return (
    <div className="p-6">
      <PageHeader eyebrow="Administration" title="Admin" description="Provision officer accounts, define the sea areas to monitor, and check that every part of the platform is running." />
      <div className="mb-4 flex gap-1 border-b border-line">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cn('-mb-px border-b-2 px-3 py-2 text-sm', tab === t ? 'border-accent text-ink' : 'border-transparent text-ink-3 hover:text-ink')}>{t}</button>
        ))}
      </div>

      {tab === 'Users' && (!users.data ? <Spinner /> : (
        <>
          <div className="mb-3 flex justify-end"><Button>New user</Button></div>
          <Table>
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Organisation</th><th>Status</th><th>Last login</th><th></th></tr></thead>
            <tbody>
              {users.data.map((u) => (
                <tr key={u.id}>
                  <td className="font-semibold">{u.name}</td>
                  <td className="font-mono text-xs">{u.email}</td>
                  <td><span className={cn('rounded border px-1.5 py-0.5 font-mono text-[11px] uppercase', u.role === 'admin' ? 'border-accent/40 text-accent' : 'border-sea/40 text-sea')}>{u.role}</span></td>
                  <td className="text-ink-2">{u.org}</td>
                  <td>{u.active ? <span className="text-ok">active</span> : <span className="text-ink-3">disabled</span>}</td>
                  <td className="text-xs text-ink-3">{u.last_login ? fmtAgo(u.last_login) : 'never'}</td>
                  <td className="text-right"><Button variant="ghost" className="px-2 py-1 text-xs">Reset password</Button> <Button variant={u.active ? 'danger' : 'ghost'} className="px-2 py-1 text-xs">{u.active ? 'Disable' : 'Enable'}</Button></td>
                </tr>
              ))}
            </tbody>
          </Table>
        </>
      ))}

      {tab === 'Watch zones' && (!zones.data ? <Spinner /> : (
        <div className="grid gap-3 md:grid-cols-3">
          {zones.data.map((z) => (
            <Panel key={z.id} title={z.name}>
              <div className="text-sm text-ink-2">Last scene {z.last_scene_at ? fmtUtc(z.last_scene_at) : 'none'}</div>
              <div className="text-sm text-ink-2">{z.vessels_now} vessels now</div>
              <div className="mt-3 text-[11px] text-ink-3">Polygon editor arrives with the Cesium map (week 4).</div>
            </Panel>
          ))}
        </div>
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
          <div className="rounded-md border border-line bg-surface p-4 sm:col-span-2 lg:col-span-4 text-xs text-ink-3">API version {health.data.version}</div>
        </div>
      ))}
    </div>
  )
}
