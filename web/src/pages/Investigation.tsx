import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { CheckCircle2, ClipboardCheck, FileDown, LayoutGrid, Map as MapIcon, MessageSquarePlus, RefreshCw, Ship } from 'lucide-react'
import { api } from '../lib/api'
import { positionAt } from '../lib/geo'
import { fmtCoord, fmtKm2, fmtUtc, TYPE_LABEL } from '../lib/format'
import type { IncidentDetail } from '../lib/types'
import { useUi } from '../store/ui'
import FeatureBars from '../components/FeatureBars'
import IncidentMap from '../components/IncidentMap'
import PlanView from '../components/PlanView'
import { Button, Empty, EngineBadge, PageHeader, Panel, Spinner, StatusChip, TierChip } from '../components/Primitives'

function TaggedChip() {
  return (
    <span className="inline-flex items-center gap-1 rounded border border-accent/50 bg-accent/10 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-accent" title="Tagged for port-state inspection">
      <ClipboardCheck className="size-3" aria-hidden />tagged
    </span>
  )
}

export default function Investigation() {
  const { id = '' } = useParams()
  const q = useQuery({ queryKey: ['incident', id], queryFn: () => api.incident(id), enabled: !!id })
  const { selectedMmsi, selectMmsi } = useUi()
  // The full map (slick, drift ellipses, every ranked ship with its trajectory, replay) is a
  // mode of this case file, not a page of its own -- it expands in place of the panels below.
  const [mapOpen, setMapOpen] = useState(false)
  const qc = useQueryClient()
  const d = q.data
  const refresh = (doc: IncidentDetail) => qc.setQueryData(['incident', id], doc)
  const addEvent = useMutation({ mutationFn: (body: Parameters<typeof api.addIncidentEvent>[1]) => api.addIncidentEvent(id, body), onSuccess: refresh })
  const rerank = useMutation({ mutationFn: () => api.rerankIncident(id), onSuccess: refresh })
  // Exporting freezes a revision server-side, then opens the printable pack in its own tab so the
  // case file stays where the officer left it. The incident is refetched because the export writes
  // a line into its timeline.
  const exportReport = useMutation({
    mutationFn: () => api.createReport(id),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['incident', id] })
      void qc.invalidateQueries({ queryKey: ['reports'] })
      window.open(`/app/reports/${r.id}/print`, '_blank', 'noopener')
    },
  })
  // Closing the case is the end of the workflow: set status to closed AND freeze the evidence pack in one step,
  // then open the printable report. A closed case with no report on file would be a gap in the chain of custody.
  const closeCase = useMutation({
    mutationFn: async () => {
      await api.addIncidentEvent(id, { type: 'status', status: 'closed', text: 'Investigation closed; evidence pack generated.' })
      return api.createReport(id)
    },
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['incident', id] })
      void qc.invalidateQueries({ queryKey: ['reports'] })
      void qc.invalidateQueries({ queryKey: ['incidents'] })
      window.open(`/app/reports/${r.id}/print`, '_blank', 'noopener')
    },
  })
  const onClose = () => {
    if (window.confirm('Close this investigation? The case is marked closed and its evidence-pack report is generated.')) closeCase.mutate()
  }
  const onNote = () => { const text = window.prompt('Note for the case file'); if (text?.trim()) addEvent.mutate({ type: 'note', text: text.trim() }) }
  const onInspect = () => { if (!sel) return; if (window.confirm(`Mark ${sel.name} for inspection? Status becomes "inspection requested".`)) addEvent.mutate({ type: 'inspection', mmsi: sel.mmsi, text: `${sel.name} (MMSI ${sel.mmsi}) marked for inspection, score ${sel.score}/100` }) }
  useEffect(() => { if (d && !d.ranking.some((r) => r.mmsi === selectedMmsi)) selectMmsi(d.ranking[0]?.mmsi ?? null) }, [d, selectedMmsi, selectMmsi])
  const sel = d?.ranking.find((r) => r.mmsi === selectedMmsi)

  const gapWindow = useMemo(() => {
    if (!sel || !d) return null
    const t0 = new Date(d.detected_at).getTime()
    const gaps = sel.track.filter((k) => k.gap).map((k) => new Date(k.t).getTime())
    if (gaps.length === 0) return null
    const idx = sel.track.findIndex((k) => k.gap)
    const start = new Date(sel.track[idx - 1]?.t ?? sel.track[idx].t).getTime()
    return { fromH: (t0 - start) / 3600_000, toH: (t0 - Math.max(...gaps)) / 3600_000 }
  }, [sel, d])

  if (!d) return <div className="p-6"><Spinner label="Loading incident" /></div>
  const t0 = new Date(d.detected_at).getTime()
  const tagged = new Set(
    d.events.filter((e) => (e.type === 'inspection' || e.type === 'psc_request') && e.mmsi).map((e) => e.mmsi as string),
  )
  const taggedRows = d.ranking.filter((r) => tagged.has(r.mmsi))
  const selTagged = !!sel && tagged.has(sel.mmsi)

  return (
    <div className="p-6">
      <PageHeader eyebrow={`${d.zone} · ${d.scene}`} title={d.code}
        description={`${fmtKm2(d.area_km2)} slick at ${fmtCoord(d.centroid)}, acquired ${fmtUtc(d.detected_at)}. ${d.ranking.length} vessels were inside the origin zones.`}
        actions={<>
          <StatusChip status={d.status} />
          <Button onClick={() => setMapOpen((v) => !v)} title={mapOpen ? 'Back to the evidence panels' : 'Slick, drift zones, every ranked vessel and its track, on real satellite imagery'}>
            {mapOpen ? <><LayoutGrid className="size-4" />Case file</> : <><MapIcon className="size-4" />Open the map</>}
          </Button>
          <Button variant="ghost" onClick={onNote} disabled={addEvent.isPending}><MessageSquarePlus className="size-4" />Add note</Button>
          <Button variant="ghost" onClick={onInspect} disabled={addEvent.isPending || !sel || selTagged || d.status === 'closed'} title={selTagged ? 'This vessel is already tagged for inspection' : undefined}><ClipboardCheck className="size-4" />{selTagged ? 'Tagged' : 'Mark for inspection'}</Button>
          <Button variant="ghost" onClick={() => rerank.mutate()} disabled={rerank.isPending} title="Recompute drift and ranking with the latest AIS data"><RefreshCw className={`size-4 ${rerank.isPending ? 'animate-spin' : ''}`} />Re-rank</Button>
          <Button variant="ghost" onClick={() => exportReport.mutate()} disabled={exportReport.isPending}
            title="Freeze the current numbers as a numbered revision and open the printable evidence pack">
            <FileDown className="size-4" />{exportReport.isPending ? 'Preparing…' : 'Export PDF'}
          </Button>
          <Button onClick={onClose} disabled={closeCase.isPending || d.status === 'closed'}
            title={d.status === 'closed' ? 'This case is already closed' : 'Close the investigation and generate its evidence pack'}>
            <CheckCircle2 className="size-4" />{d.status === 'closed' ? 'Closed' : closeCase.isPending ? 'Closing…' : 'Close & report'}
          </Button>
        </>} />

      <AnimatePresence mode="wait" initial={false}>
      {mapOpen ? (
        <motion.div key="map" initial={{ opacity: 0, scale: 0.985 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.985 }} transition={{ duration: 0.28, ease: 'easeOut' }}>
          <IncidentMap d={d} />
        </motion.div>
      ) : (
      <motion.div key="panels" className="grid gap-4 xl:grid-cols-[300px_1fr_360px]" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.22, ease: 'easeOut' }}>
        {/* evidence */}
        <div className="space-y-4">
          <Panel title="Slick" bodyClassName="p-0">
            <div className="aspect-[4/3] bg-bg">
              <PlanView className="size-full" polygon={d.polygon} showGrid={false} />
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 p-4 text-sm">
              <div><dt className="label-caps">Engine</dt><dd><EngineBadge engine={d.engine} /></dd></div>
              <div><dt className="label-caps">Confidence</dt><dd className="font-mono tnum">{Math.round(d.confidence * 100)}%</dd></div>
              <div><dt className="label-caps">Area</dt><dd className="font-mono tnum">{fmtKm2(d.area_km2)}</dd></div>
              <div><dt className="label-caps">Long axis</dt><dd className="font-mono tnum">{String(d.heading_deg).padStart(3, '0')}°</dd></div>
              <div className="col-span-2"><dt className="label-caps">Tile SHA-256</dt><dd className="truncate font-mono text-[11px] text-ink-3" title={d.hashes.tile_sha256}>{d.hashes.tile_sha256}</dd></div>
            </dl>
          </Panel>
          <Panel title="Drift assumptions">
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-ink-2">Wind</dt><dd className="font-mono tnum">{d.drift_inputs.wind_kn} kn from {d.drift_inputs.wind_dir_deg}°</dd></div>
              <div className="flex justify-between"><dt className="text-ink-2">Current</dt><dd className="font-mono tnum">{d.drift_inputs.current_kn} kn to {d.drift_inputs.current_dir_deg}°</dd></div>
              <div className="flex justify-between"><dt className="text-ink-2">Leeway</dt><dd className="font-mono tnum">3% of wind</dd></div>
              <div className="flex justify-between"><dt className="text-ink-2">Zones</dt><dd className="font-mono tnum">{d.origin_zones.map((z) => `t−${z.hours_before}h`).join(' · ')}</dd></div>
            </dl>
            <p className="mt-3 text-[11px] text-ink-3">{d.drift_inputs.source}. First-order Lagrangian model; uncertainty grows 0.5 km/h along drift and 0.3 km/h across.{typeof d.candidates_considered === 'number' ? ` ${d.candidates_considered} vessels considered.` : ''}</p>
            {d.drift_inputs.weather_source === 'fallback' && <p className="mt-2 rounded border border-warn/40 bg-warn/10 px-2 py-1 text-[11px] text-warn">Weather service was unreachable; climatological defaults were used. Re-rank when online.</p>}
          </Panel>
          <Panel title="Timeline" bodyClassName="p-0">
            <ul className="divide-y divide-line">
              {d.events.map((e, i) => (
                <li key={i} className="px-4 py-2.5 text-sm">
                  <div className="flex justify-between font-mono text-[11px] text-ink-3"><span>{e.type}</span><span>{fmtUtc(e.at)}</span></div>
                  <div className="mt-0.5 text-ink-2"><span className="font-semibold text-ink">{e.who}</span> · {e.text}</div>
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        {/* ranking */}
        <Panel title={`Ranked vessels · ${d.ranking.length}`} bodyClassName="p-0">
          {d.ranking.length === 0 ? <div className="p-4"><Empty title={typeof d.candidates_considered === 'number' ? 'No vessels in the origin zones' : 'Not ranked yet'} hint={typeof d.candidates_considered === 'number' ? `${d.candidates_considered} vessels had AIS reports nearby; none came within reach of the backtracked zones in the time window. Re-rank when more AIS history arrives.` : 'Ranking runs when an incident is opened.'} /></div> : (
            <ul className="divide-y divide-line">
              {d.ranking.map((r, i) => (
                <li key={r.mmsi}>
                  <button onClick={() => selectMmsi(r.mmsi)} className={`grid w-full grid-cols-[28px_1fr_auto] items-center gap-3 px-4 py-3 text-left hover:bg-surface-2/60 ${r.mmsi === selectedMmsi ? 'bg-surface-2' : ''} ${r.tier === 'prime' ? 'shadow-[inset_3px_0_0_0_var(--color-crit)]' : r.tier === 'poi' ? 'shadow-[inset_3px_0_0_0_var(--color-warn)]' : ''}`}>
                    <span className="font-mono text-sm text-ink-3 tnum">{i + 1}</span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-2"><span className="truncate font-semibold">{r.name}</span><TierChip tier={r.tier} compact />{tagged.has(r.mmsi) && <TaggedChip />}</span>
                      <span className="block text-xs text-ink-2">{TYPE_LABEL[r.type_group]} · {r.flag} · {r.behaviour}{r.behaviour === 'dark' ? ' (AIS gap)' : ''}</span>
                    </span>
                    <span className="flex items-center gap-3">
                      <FeatureBars features={r.features} dense />
                      <span className="w-12 text-right font-display text-2xl font-semibold tnum">{r.score}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* vessel detail */}
        <div className="space-y-4">
          <Panel title={`Tagged for inspection · ${taggedRows.length}`} bodyClassName={taggedRows.length ? 'p-0' : 'p-4'}>
            {taggedRows.length === 0 ? (
              <Empty title="No vessels tagged" hint="Select a suspect and use “Mark for inspection” to add it to the boarding shortlist." />
            ) : (
              <ul className="divide-y divide-line">
                {taggedRows.map((r) => (
                  <li key={r.mmsi}>
                    <button onClick={() => selectMmsi(r.mmsi)}
                      className={`flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-surface-2/60 ${r.mmsi === selectedMmsi ? 'bg-surface-2' : ''}`}>
                      <span className="min-w-0">
                        <span className="flex items-center gap-2"><span className="truncate text-sm font-semibold">{r.name}</span><TierChip tier={r.tier} compact /></span>
                        <span className="block font-mono text-[11px] text-ink-3">MMSI {r.mmsi} · {r.flag}</span>
                      </span>
                      <span className="font-display text-xl font-semibold tnum">{r.score}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          {sel ? (
            <>
              <Panel title={<div className="flex items-center gap-2"><Ship className="size-4 text-ink-3" /><h3 className="text-[15px] font-semibold">{sel.name}</h3></div>} actions={<span className="flex items-center gap-2">{selTagged && <TaggedChip />}<TierChip tier={sel.tier} /></span>}>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                  <div><dt className="label-caps">MMSI</dt><dd className="font-mono">{sel.mmsi}</dd></div>
                  <div><dt className="label-caps">Flag</dt><dd className="font-mono">{sel.flag}</dd></div>
                  <div><dt className="label-caps">Type</dt><dd>{TYPE_LABEL[sel.type_group]}</dd></div>
                  <div><dt className="label-caps">Behaviour</dt><dd className={sel.behaviour === 'dark' ? 'text-crit' : ''}>{sel.behaviour}</dd></div>
                  <div className="col-span-2"><dt className="label-caps">Score</dt><dd className="font-display text-3xl font-semibold tnum">{sel.score}<span className="text-base text-ink-3">/100</span></dd></div>
                </dl>
                <div className="mt-4"><FeatureBars features={sel.features} /></div>
              </Panel>
              <Panel title="Track vs origin zones" bodyClassName="p-0">
                <div className="aspect-[4/3] bg-bg">
                  <PlanView className="size-full" polygon={d.polygon} zones={d.origin_zones} track={{ points: sel.track }}
                    vessels={[{ mmsi: sel.mmsi, name: sel.name, type: sel.type_group, position: sel.track[sel.track.length - 1].p, cog: 0, selected: true }]} showGrid={false} />
                </div>
                <div className="p-4">
                  <div className="label-caps mb-1.5">AIS reports, t−24h to acquisition</div>
                  <div className="relative h-3 rounded-sm bg-surface-3">
                    {gapWindow && <div className="absolute inset-y-0 rounded-sm bg-crit" style={{ left: `${(1 - gapWindow.fromH / 24) * 100}%`, width: `${((gapWindow.fromH - gapWindow.toH) / 24) * 100}%` }} title="Transponder gap" />}
                    {sel.track.map((k, i) => { const h = (t0 - new Date(k.t).getTime()) / 3600_000; return <span key={i} className="absolute top-0 h-3 w-px bg-ink-2" style={{ left: `${(1 - h / 24) * 100}%` }} /> })}
                  </div>
                  <div className="mt-1 flex justify-between font-mono text-[10px] text-ink-3"><span>t−24h</span><span>t−12h</span><span>t0</span></div>
                  {gapWindow ? <p className="mt-2 text-xs text-crit">No AIS reports for {Math.round((gapWindow.fromH - gapWindow.toH) * 60)} min while crossing the t−12h origin zone.</p> : <p className="mt-2 text-xs text-ink-3">Continuous reporting through the window.</p>}
                  {(() => { const at = positionAt(sel.track, t0 - 12 * 3600_000); return at ? <p className="mt-1 font-mono text-[11px] text-ink-3">at t−12h: {fmtCoord(at.p)}</p> : null })()}
                </div>
              </Panel>
              <button type="button" onClick={() => setMapOpen(true)} className="block w-full text-center text-xs text-sea hover:underline">Replay on the map</button>
            </>
          ) : <Empty title="Select a vessel" />}
        </div>
      </motion.div>
      )}
      </AnimatePresence>
    </div>
  )
}
