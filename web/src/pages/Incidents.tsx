import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { api } from '../lib/api'
import { fmtKm2, fmtUtc } from '../lib/format'
import { EngineBadge, PageHeader, Spinner, StatusChip, Table, TierChip } from '../components/Primitives'

export default function Incidents() {
  const q = useQuery({ queryKey: ['incidents'], queryFn: api.incidents })
  return (
    <div className="p-6">
      <PageHeader eyebrow="Case list" title="Incidents" description="Every slick that became a case, newest first." />
      {!q.data ? <Spinner /> : (
        <Table>
          <thead><tr><th>Code</th><th>Status</th><th>Zone</th><th>Detected (UTC)</th><th className="text-right">Area</th><th className="text-right">Conf.</th><th>Engine</th><th>Top suspect</th><th>Assigned</th></tr></thead>
          <tbody>
            {q.data.map((i) => (
              <tr key={i.id}>
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
