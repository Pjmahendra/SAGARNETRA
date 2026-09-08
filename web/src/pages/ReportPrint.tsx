import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { ArrowLeft, Printer } from 'lucide-react'
import { api } from '../lib/api'
import { fmtCoord, fmtKm2, fmtUtc, STATUS_LABEL, TIER_LABEL, TYPE_LABEL } from '../lib/format'
import FeatureBars from '../components/FeatureBars'
import PlanView from '../components/PlanView'
import { Button, EngineBadge, Spinner, TierChip } from '../components/Primitives'

/**
 * A4 evidence pack, meant to be printed or saved as PDF via the browser's own print dialog (Ctrl/Cmd+P).
 * Lives outside AppShell so nothing but the document renders. `.no-print` is hidden in @media print
 * (see `@layer print` in index.css) and @page sets A4 margins.
 */
export default function ReportPrint() {
  const { id = '' } = useParams()
  const report = useQuery({ queryKey: ['report', id], queryFn: () => api.report(id), enabled: !!id })
  const incidentId = report.data?.incident_id
  const incident = useQuery({ queryKey: ['incident', incidentId], queryFn: () => api.incident(incidentId!), enabled: !!incidentId })

  if (report.isLoading || incident.isLoading) return <div className="grid min-h-dvh place-items-center"><Spinner label="Loading report" /></div>
  const r = report.data
  const d = incident.data
  if (!r) return <div className="p-10 text-center text-ink-2">Report not found.</div>

  const s = r.snapshot
  // A pack is a snapshot, so it has to stay readable even when the case it came from is gone —
  // reopened under a new id, purged, archived. The frozen figures below are the record; only the
  // sections that genuinely need the live incident (its outline, ranking and timeline) drop out.
  const stale = !!d && (s.area_km2 !== d.area_km2 || s.status !== d.status || s.top_vessel !== d.top_vessel || s.ranked_count !== d.ranking.length)

  return (
    <div className="min-h-dvh bg-surface-2 print:bg-white">
      <div className="no-print sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface px-6 py-3">
        <Link to={d ? `/app/incidents/${d.id}` : '/app/reports'} className="inline-flex items-center gap-1.5 text-sm text-ink-2 hover:text-ink"><ArrowLeft className="size-4" />{d ? 'Back to investigation' : 'Back to reports'}</Link>
        <div className="flex items-center gap-2">
          <span className="text-xs text-ink-3">Revision {r.revision} · exported {fmtUtc(r.generated_at)} by {r.generated_by}</span>
          <Button onClick={() => window.print()}><Printer className="size-4" />Print / Save as PDF</Button>
        </div>
      </div>

      <main className="mx-auto max-w-[210mm] bg-white p-[14mm] text-ink shadow-sm print:max-w-none print:p-0 print:shadow-none">
        {stale && (
          <div className="no-print mb-5 rounded-md border border-warn bg-warn-soft px-3 py-2 text-xs text-warn">
            The incident has changed since this report was exported (revision {r.revision}). The numbers below are the snapshot at export
            time. Export a new report from the investigation page to capture the current state.
          </div>
        )}

        <header className="mb-6 flex items-start justify-between border-b-2 border-ink pb-4">
          <div>
            <div className="font-pixel text-lg font-bold tracking-wide">SAGARNETRA</div>
            <div className="label-caps mt-0.5">Marine Pollution Evidence Report</div>
          </div>
          <div className="text-right text-xs text-ink-2">
            <div className="font-mono font-semibold text-ink">{r.incident_code} · rev. {r.revision}</div>
            <div>Exported {fmtUtc(r.generated_at)}</div>
            <div>By {r.generated_by}</div>
            <div className="font-mono text-[10px] text-ink-3">Report ID {r.id}</div>
          </div>
        </header>

        {/* Provenance, stated exactly. The two cases differ in opposite directions — a Gujarat pack
            is ranked against a written scenario, a Dover pack against hundreds of genuinely
            recorded hulls — so one sentence cannot cover both, and getting it backwards in a
            document meant as evidence is worse than saying nothing. Read from the snapshot, so a
            pack keeps the wording that was true when it was filed. */}
        {s.is_demo && (
          <div className="mb-5 rounded border border-line bg-surface-2 px-3 py-2 text-xs text-ink-2">
            {s.ais_source === 'live' ? (
              <>
                <strong className="text-ink">Real AIS, placeholder tile — no discharge is alleged.</strong> The vessel
                positions, tracks and identities below were recorded live from AIS and are genuine, as are the weather
                and the drift calculation. The SAR tile is a synthetic placeholder: no Sentinel-1 scene is bundled for
                this sector, so the slick outline and its area are illustrative and the imagery must not be read as
                satellite data. <strong className="text-ink">No spill is known to have occurred at this location.</strong>{' '}
                The named vessels are listed solely to demonstrate the correlation step against real traffic, and
                nothing here is a finding against any of them.
              </>
            ) : (
              <>
                <strong className="text-ink">Demonstration incident.</strong> The satellite tile, weather and drift
                calculation are real. The vessel history for this case is a labelled scenario used for evaluation,
                not a recorded historical track.
              </>
            )}
          </div>
        )}

        <section className="mb-6 grid grid-cols-4 gap-x-4 gap-y-3 text-sm">
          <Field label="Zone">{s.zone}</Field>
          <Field label="Status">{STATUS_LABEL[s.status]}</Field>
          <Field label="Detected (UTC)">{fmtUtc(s.detected_at)}</Field>
          <Field label="Source scene">{s.scene}</Field>
          <Field label="Slick area">{fmtKm2(s.area_km2)}</Field>
          <Field label="Confidence">{Math.round(s.confidence * 100)}%</Field>
          <Field label="Centroid">{fmtCoord(s.centroid)}</Field>
          <Field label="Detection engine"><EngineBadge engine={s.engine} /></Field>
        </section>

        {!d && (
          <div className="mb-5 rounded border border-warn/40 bg-warn-soft px-3 py-2 text-xs text-warn">
            The incident this pack was exported from is no longer in the system. Everything above is the
            snapshot taken at export and is unchanged; the map, ranking and timeline below needed the live
            case and cannot be shown.
          </div>
        )}

        {d && <>
        <section className="mb-6">
          <h2 className="label-caps mb-2 border-b border-line pb-1">Slick and origin zones</h2>
          <div className="aspect-[16/9] overflow-hidden rounded border border-line">
            <PlanView className="size-full" polygon={d.polygon} zones={d.origin_zones}
              vessels={d.ranking.slice(0, 8).map((r2) => ({ mmsi: r2.mmsi, name: r2.name, type: r2.type_group, position: r2.track.at(-1)?.p ?? d.centroid, cog: 0 }))} />
          </div>
        </section>

        <section className="mb-6 grid grid-cols-2 gap-6">
          <div>
            <h2 className="label-caps mb-2 border-b border-line pb-1">Drift assumptions</h2>
            <dl className="space-y-1 text-sm">
              <Row k="Wind">{d.drift_inputs.wind_kn} kn from {d.drift_inputs.wind_dir_deg}°</Row>
              <Row k="Current">{d.drift_inputs.current_kn} kn to {d.drift_inputs.current_dir_deg}°</Row>
              <Row k="Leeway factor">{Math.round((d.drift_inputs.leeway ?? 0.03) * 100)}% of wind</Row>
              <Row k="Origin zones">{d.origin_zones.map((z) => `t−${z.hours_before}h`).join(' · ')}</Row>
              <Row k="Weather source">{d.drift_inputs.weather_source === 'fallback' ? 'Climatological fallback (service unreachable)' : 'Open-Meteo, live'}</Row>
            </dl>
            <p className="mt-2 text-[11px] text-ink-3">{d.drift_inputs.source}. First-order Lagrangian backtrack; uncertainty grows 0.5 km/h along the drift direction and 0.3 km/h across it.</p>
          </div>
          <div>
            <h2 className="label-caps mb-2 border-b border-line pb-1">Chain of custody</h2>
            <dl className="space-y-1 text-xs">
              <Row k="Tile SHA-256"><span className="break-all font-mono">{s.hashes.tile_sha256 ?? '—'}</span></Row>
              <Row k="Mask SHA-256"><span className="break-all font-mono">{s.hashes.mask_sha256 ?? '—'}</span></Row>
              <Row k="Candidates considered">{s.candidates_considered ?? '—'}</Row>
              <Row k="Vessels ranked">{s.ranked_count}</Row>
            </dl>
          </div>
        </section>

        <section className="mb-6">
          <h2 className="label-caps mb-2 border-b border-line pb-1">Ranked vessels</h2>
          {d.ranking.length === 0 ? (
            <p className="text-sm text-ink-2">No vessel came within reach of the backtracked origin zones in the time window.</p>
          ) : (
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-ink text-left font-mono uppercase text-ink-3">
                  <th className="py-1 pr-2">#</th><th className="py-1 pr-2">Vessel</th><th className="py-1 pr-2">MMSI</th>
                  <th className="py-1 pr-2">Type</th><th className="py-1 pr-2">Flag</th><th className="py-1 pr-2">Behaviour</th>
                  <th className="py-1 pr-2 text-right">Score</th><th className="py-1 pr-2">Tier</th>
                </tr>
              </thead>
              <tbody>
                {d.ranking.map((row, i) => (
                  <tr key={row.mmsi} className="break-inside-avoid border-b border-line align-top">
                    <td className="py-1.5 pr-2 tnum">{i + 1}</td>
                    <td className="py-1.5 pr-2 font-semibold">{row.name}</td>
                    <td className="py-1.5 pr-2 font-mono">{row.mmsi}</td>
                    <td className="py-1.5 pr-2">{TYPE_LABEL[row.type_group]}</td>
                    <td className="py-1.5 pr-2 font-mono">{row.flag}</td>
                    <td className="py-1.5 pr-2">{row.behaviour}{row.behaviour === 'dark' ? ' (AIS gap)' : ''}</td>
                    <td className="py-1.5 pr-2 text-right tnum">{row.score}/100</td>
                    <td className="py-1.5 pr-2"><TierChip tier={row.tier} compact /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {d.ranking[0] && (
            <div className="mt-3 break-inside-avoid rounded border border-line p-3">
              <div className="mb-1.5 flex items-center gap-2 text-sm font-semibold">Leading candidate: {d.ranking[0].name} <TierChip tier={d.ranking[0].tier} compact /></div>
              <FeatureBars features={d.ranking[0].features} />
            </div>
          )}
        </section>

        <section className="mb-2">
          <h2 className="label-caps mb-2 border-b border-line pb-1">Case timeline</h2>
          <ul className="space-y-1.5 text-xs">
            {d.events.map((e, i) => (
              <li key={i} className="flex gap-3 break-inside-avoid">
                <span className="w-36 shrink-0 font-mono text-ink-3">{fmtUtc(e.at)}</span>
                <span><span className="font-semibold">{e.who}</span> — {e.text}</span>
              </li>
            ))}
          </ul>
        </section>
        </>}

        <footer className="mt-8 border-t border-ink pt-3 text-[10px] text-ink-3">
          Generated by SAGARNETRA, a satellite-and-AIS correlation tool. This report identifies vessels for inspection
          priority; it is not proof of discharge. Confirmation requires boarding and an oil-sample match under MARPOL
          Annex I. {TIER_LABEL.prime} and {TIER_LABEL.poi} are risk tiers, not findings of fact.
        </footer>
      </main>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><dt className="label-caps">{label}</dt><dd className="mt-0.5 font-mono text-sm">{children}</dd></div>
}
function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return <div className="flex justify-between gap-3"><dt className="text-ink-2">{k}</dt><dd className="text-right font-mono">{children}</dd></div>
}
