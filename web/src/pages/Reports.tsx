import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { ExternalLink, Search } from 'lucide-react'
import { api } from '../lib/api'
import { fmtKm2, fmtUtc } from '../lib/format'
import { Button, Empty, PageHeader, Spinner, Table, TierChip } from '../components/Primitives'

/**
 * The evidence-pack register. Every row is a document somebody exported, frozen at that moment;
 * opening one shows exactly what was filed, not what the incident says today. Reports are created
 * from an incident's "Export PDF", never here, so this page is deliberately read-only.
 */
export default function Reports() {
  const q = useQuery({ queryKey: ['reports'], queryFn: api.reports })
  const [search, setSearch] = useState('')

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return q.data ?? []
    return (q.data ?? []).filter((r) =>
      [r.incident_code, r.generated_by, r.snapshot?.zone, r.snapshot?.top_vessel, r.snapshot?.top_mmsi]
        .some((v) => v?.toLowerCase().includes(needle)),
    )
  }, [q.data, search])

  return (
    <div className="p-6">
      <PageHeader
        eyebrow="Evidence packs"
        title="Reports"
        description="Each export is a snapshot: the slick, the drift assumptions, the full ranking and the source hashes, frozen at the moment an officer generated it. Later re-ranking never rewrites a pack that has already been filed. Create one from an incident's Export PDF."
        actions={
          <label className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Incident, vessel, officer"
              className="w-64 rounded-md border border-line bg-surface py-1.5 pl-8 pr-3 text-sm" />
          </label>
        }
      />

      {!q.data ? <Spinner /> : q.data.length === 0 ? (
        <Empty title="No reports yet" hint="Open an incident and use Export PDF to file the first evidence pack." />
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <th>Incident</th><th>Zone</th><th className="text-right">Area</th><th>Leading candidate</th>
                <th>Exported by</th><th>Exported (UTC)</th><th className="text-right">Rev.</th><th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link to={`/app/incidents/${r.incident_id}`} className="font-mono font-semibold text-sea hover:underline">{r.incident_code}</Link>
                    {r.snapshot?.is_demo && <span className="ml-2 font-mono text-[10px] uppercase tracking-wide text-ink-3" title="Reconstructed scenario, not a recorded case">demo</span>}
                  </td>
                  <td className="text-ink-2">{r.snapshot?.zone ?? '—'}</td>
                  <td className="text-right font-mono tnum">{r.snapshot ? fmtKm2(r.snapshot.area_km2) : '—'}</td>
                  <td>
                    {r.snapshot?.top_vessel ? (
                      <span className="flex items-center gap-2">
                        {r.snapshot.top_tier && <TierChip tier={r.snapshot.top_tier} compact />}
                        <span className="truncate font-mono text-xs">{r.snapshot.top_vessel}</span>
                        {r.snapshot.top_score !== null && <span className="font-mono text-[11px] text-ink-3 tnum">{r.snapshot.top_score}/100</span>}
                      </span>
                    ) : <span className="text-ink-3">not ranked</span>}
                  </td>
                  <td>{r.generated_by}</td>
                  <td className="font-mono text-xs">{fmtUtc(r.generated_at)}</td>
                  <td className="text-right font-mono tnum">{r.revision ?? '—'}</td>
                  <td className="text-right">
                    <Link to={`/app/reports/${r.id}/print`} target="_blank" rel="noopener">
                      <Button variant="ghost" className="px-2 py-1 text-xs"><ExternalLink className="size-3.5" />Open</Button>
                    </Link>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={8} className="py-6 text-center text-ink-3">No reports match.</td></tr>}
            </tbody>
          </Table>
          <p className="mt-3 text-[11px] text-ink-3">
            A pack opens as a print-ready A4 document. Save it with your browser's print dialog (Ctrl/Cmd+P, then Save as PDF).
          </p>
        </>
      )}
    </div>
  )
}
