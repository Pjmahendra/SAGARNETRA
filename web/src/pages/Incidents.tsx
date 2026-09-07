import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { MapPin } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../auth/store'
import { cn } from '../lib/cn'
import { fmtKm2, fmtUtc } from '../lib/format'
import { EngineBadge, Empty, KpiTile, PageHeader, Spinner, StatusChip, Table, TierChip } from '../components/Primitives'
import type { Incident, IncidentStatus } from '../lib/types'

type TabKey = 'pending' | 'inspection' | 'closed' | 'all'

const TAB_MATCH: Record<TabKey, (s: IncidentStatus) => boolean> = {
  pending: (s) => s === 'detected' || s === 'investigating',
  inspection: (s) => s === 'inspection_requested',
  closed: (s) => s === 'closed',
  all: () => true,
}
const TABS: { key: TabKey; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'inspection', label: 'Inspection requested' },
  { key: 'closed', label: 'Closed' },
  { key: 'all', label: 'All' },
]
const TIER_RANK = { prime: 3, poi: 2, cleared: 1 } as const
const tierRank = (t: Incident['top_tier']) => (t ? TIER_RANK[t] : 0)

export default function Incidents() {
  const q = useQuery({ queryKey: ['incidents'], queryFn: api.incidents })
  const user = useAuth((s) => s.user)
  const myZoneIds = useMemo(() => user?.zone_ids ?? [], [user])
  const canScope = myZoneIds.length > 0
  const [tab, setTab] = useState<TabKey>('pending')
  const [myZones, setMyZones] = useState(false)

  const scoped = useMemo(() => {
    const all = q.data ?? []
    return myZones && canScope ? all.filter((i) => i.zone_id && myZoneIds.includes(i.zone_id)) : all
  }, [q.data, myZones, canScope, myZoneIds])

  const counts = useMemo(() => ({
    pending: scoped.filter((i) => TAB_MATCH.pending(i.status)).length,
    inspection: scoped.filter((i) => TAB_MATCH.inspection(i.status)).length,
    closed: scoped.filter((i) => TAB_MATCH.closed(i.status)).length,
    all: scoped.length,
    primeOpen: scoped.filter((i) => i.status !== 'closed' && i.top_tier === 'prime').length,
  }), [scoped])

  const rows = useMemo(
    () => scoped.filter((i) => TAB_MATCH[tab](i.status)).sort(
      (a, b) => tierRank(b.top_tier) - tierRank(a.top_tier) ||
        new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime(),
    ),
    [scoped, tab],
  )

  return (
    <div className="p-6">
      <PageHeader eyebrow="Boarding worklist" title="Incidents"
        description="Open cases awaiting a boarding decision, highest-priority suspect first. Every ranking is a lead for port-state inspection, not proof of discharge." />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <KpiTile label="Pending" value={counts.pending} hint="detected or under investigation" tone="accent" />
        <KpiTile label="Inspection requested" value={counts.inspection} hint="awaiting port-state boarding" tone={counts.inspection ? 'crit' : 'default'} />
        <KpiTile label="Prime suspects (open)" value={counts.primeOpen} hint="score ≥ 65 in an open case" tone={counts.primeOpen ? 'crit' : 'default'} />
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-lg border border-line bg-surface p-0.5">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={cn('rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                tab === t.key ? 'bg-accent text-white' : 'text-ink-2 hover:text-ink')}>
              {t.label}
              <span className={cn('ml-1.5 font-mono text-[11px]', tab === t.key ? 'text-white/80' : 'text-ink-3')}>{counts[t.key]}</span>
            </button>
          ))}
        </div>
        {canScope && (
          <button onClick={() => setMyZones((v) => !v)}
            className={cn('inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors',
              myZones ? 'border-accent/60 bg-accent/5 text-accent' : 'border-line text-ink-2 hover:text-ink')}>
            <MapPin className="size-4" />My zones{myZones ? ` (${myZoneIds.length})` : ''}
          </button>
        )}
      </div>

      {!q.data ? <Spinner label="Loading incidents" /> : rows.length === 0 ? (
        <Empty title={`No ${tab === 'all' ? '' : TABS.find((t) => t.key === tab)!.label.toLowerCase() + ' '}incidents${myZones ? ' in your zones' : ''}`}
          hint={tab === 'pending' ? 'Nothing awaiting action right now.' : undefined} />
      ) : (
        <Table>
          <thead><tr><th>Code</th><th>Status</th><th>Zone</th><th>Detected (UTC)</th><th className="text-right">Area</th><th className="text-right">Conf.</th><th>Engine</th><th>Top suspect</th><th>Assigned</th></tr></thead>
          <tbody>
            {rows.map((i) => (
              <tr key={i.id} className={cn(i.top_tier === 'prime' && i.status !== 'closed' && 'bg-crit/[0.03]')}>
                <td><Link to={`/app/incidents/${i.id}`} className="font-mono text-sea hover:underline">{i.code}</Link>{i.is_demo && <span className="ml-2 font-mono text-[10px] uppercase text-ink-3">demo</span>}</td>
                <td><StatusChip status={i.status} /></td>
                <td>{i.zone}</td>
                <td className="font-mono text-xs">{fmtUtc(i.detected_at)}</td>
                <td className="text-right font-mono tnum">{fmtKm2(i.area_km2)}</td>
                <td className="text-right font-mono tnum">{Math.round(i.confidence * 100)}%</td>
                <td><EngineBadge engine={i.engine} /></td>
                <td>{i.top_tier ? <span className="flex items-center gap-2"><TierChip tier={i.top_tier} compact /><span className="font-mono text-xs">{i.top_vessel}</span></span> : <span className="text-ink-3">—</span>}</td>
                <td className="text-ink-2">{i.assigned_to ?? <span className="text-ink-3">unassigned</span>}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  )
}
