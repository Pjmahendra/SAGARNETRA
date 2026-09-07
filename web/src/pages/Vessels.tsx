import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { Search } from 'lucide-react'
import { api } from '../lib/api'
import { fmtAgo, fmtCoord, TYPE_LABEL } from '../lib/format'
import { useUi } from '../store/ui'
import { PageHeader, Spinner, Table } from '../components/Primitives'

export default function Vessels() {
  const q = useQuery({ queryKey: ['vessels', 'live'], queryFn: api.vesselsLive, refetchInterval: 30_000 })
  const [search, setSearch] = useState('')
  const [type, setType] = useState('all')
  const selectMmsi = useUi((s) => s.selectMmsi)
  const rows = useMemo(() => (q.data ?? []).filter((v) => (type === 'all' || v.type_group === type) && (v.name.toLowerCase().includes(search.toLowerCase()) || v.mmsi.includes(search))), [q.data, search, type])

  return (
    <div className="p-6">
      <PageHeader eyebrow="Live AIS" title="Vessels" description="Latest position for every vessel inside the watch zones. Refreshes every 30 s."
        actions={<>
          <label className="relative"><Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or MMSI" className="w-56 rounded-md border border-line bg-surface py-1.5 pl-8 pr-3 text-sm" /></label>
          <select value={type} onChange={(e) => setType(e.target.value)} className="rounded-md border border-line bg-surface px-2 py-1.5 text-sm">
            <option value="all">All types</option>
            {Object.entries(TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </>} />
      {!q.data ? <Spinner /> : (
        <Table>
          <thead><tr><th>Name</th><th>MMSI</th><th>IMO</th><th>Type</th><th>Flag</th><th className="text-right">Length</th><th className="text-right">SOG</th><th className="text-right">COG</th><th>Position</th><th>Dest.</th><th>Seen</th></tr></thead>
          <tbody>
            {rows.map((v) => (
              <tr key={v.mmsi}>
                <td><Link to="/app/map" onClick={() => selectMmsi(v.mmsi)} className="font-semibold text-sea hover:underline">{v.name}</Link></td>
                <td className="font-mono text-xs">{v.mmsi}</td>
                <td className="font-mono text-xs text-ink-2">{v.imo ?? '—'}</td>
                <td>{TYPE_LABEL[v.type_group]}</td>
                <td className="font-mono text-xs">{v.flag}</td>
                <td className="text-right font-mono tnum">{v.length_m ? `${v.length_m} m` : '—'}</td>
                <td className="text-right font-mono tnum">{v.sog_kn.toFixed(1)} kn</td>
                <td className="text-right font-mono tnum">{String(v.cog_deg).padStart(3, '0')}°</td>
                <td className="font-mono text-xs">{fmtCoord(v.position)}</td>
                <td className="font-mono text-xs text-ink-2">{v.destination ?? '—'}</td>
                <td className="text-xs text-ink-3">{fmtAgo(v.last_seen)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={11} className="py-6 text-center text-ink-3">No vessels match.</td></tr>}
          </tbody>
        </Table>
      )}
    </div>
  )
}
