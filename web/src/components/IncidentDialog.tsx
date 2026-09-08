import * as Dialog from '@radix-ui/react-dialog'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { ArrowRight, Ship, Waves, Wind, X } from 'lucide-react'
import { api } from '../lib/api'
import { fmtKm2, fmtUtc, TYPE_LABEL } from '../lib/format'
import { EngineBadge, Spinner, StatusChip, TierChip } from './Primitives'

/** Quick-look for a case: the wind/drift and AIS picture in a dialog, with a link into the full investigation. */
export default function IncidentDialog({ incidentId, onClose }: { incidentId: string | null; onClose: () => void }) {
  const q = useQuery({ queryKey: ['incident', incidentId], queryFn: () => api.incident(incidentId as string), enabled: !!incidentId })
  const d = q.data

  return (
    <Dialog.Root open={!!incidentId} onOpenChange={(o) => { if (!o) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-[min(680px,92vw)] -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-xl border border-line bg-surface shadow-2xl focus:outline-none">
          {!d ? (
            <div className="p-10"><Spinner label="Loading incident" /></div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Dialog.Title className="font-mono text-lg font-semibold">{d.code}</Dialog.Title>
                    <StatusChip status={d.status} />
                    <EngineBadge engine={d.engine} />
                    {d.is_demo && <span className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-ink-3">demo scenario</span>}
                  </div>
                  <Dialog.Description className="mt-0.5 text-sm text-ink-2">{d.zone} · {fmtKm2(d.area_km2)} · {fmtUtc(d.detected_at)}</Dialog.Description>
                </div>
                <Dialog.Close className="rounded p-1 text-ink-3 hover:bg-surface-2 hover:text-ink"><X className="size-5" /></Dialog.Close>
              </div>

              <div className="grid gap-4 p-5 sm:grid-cols-2">
                <section className="rounded-lg border border-line p-4">
                  <div className="label-caps mb-2 flex items-center gap-1.5"><Wind className="size-3.5" />Wind &amp; drift</div>
                  <dl className="space-y-1.5 text-sm">
                    <div className="flex justify-between"><dt className="text-ink-2">Wind</dt><dd className="font-mono tnum">{d.drift_inputs.wind_kn} kn from {d.drift_inputs.wind_dir_deg}°</dd></div>
                    <div className="flex justify-between"><dt className="text-ink-2">Current</dt><dd className="font-mono tnum">{d.drift_inputs.current_kn} kn to {d.drift_inputs.current_dir_deg}°</dd></div>
                    <div className="flex justify-between"><dt className="text-ink-2">Origin zones</dt><dd className="font-mono tnum">{d.origin_zones.map((z) => `t−${z.hours_before}h`).join(' · ')}</dd></div>
                  </dl>
                  <p className="mt-2 text-[11px] text-ink-3">{d.drift_inputs.source}</p>
                  {d.drift_inputs.weather_source === 'fallback' && <p className="mt-1 text-[11px] text-warn">Weather service unreachable; climatological fallback used.</p>}
                </section>

                <section className="rounded-lg border border-line p-4">
                  <div className="label-caps mb-2 flex items-center gap-1.5"><Waves className="size-3.5" />Slick</div>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                    <div><dt className="label-caps text-[10px]">Area</dt><dd className="font-mono tnum">{fmtKm2(d.area_km2)}</dd></div>
                    <div><dt className="label-caps text-[10px]">Confidence</dt><dd className="font-mono tnum">{Math.round(d.confidence * 100)}%</dd></div>
                    <div><dt className="label-caps text-[10px]">Long axis</dt><dd className="font-mono tnum">{String(d.heading_deg).padStart(3, '0')}°</dd></div>
                    <div><dt className="label-caps text-[10px]">Centroid</dt><dd className="font-mono text-[11px] tnum">{d.centroid[1].toFixed(3)}°N {d.centroid[0].toFixed(3)}°E</dd></div>
                  </dl>
                </section>
              </div>

              <div className="px-5 pb-4">
                <div className="label-caps mb-2 flex items-center gap-1.5"><Ship className="size-3.5" />AIS vessels in the origin zones · {d.ranking.length}</div>
                {d.ranking.length === 0 ? (
                  <div className="rounded-lg border border-line px-3 py-2 text-sm text-ink-3">No vessels ranked for this slick.</div>
                ) : (
                  <ul className="divide-y divide-line rounded-lg border border-line">
                    {d.ranking.slice(0, 6).map((r) => (
                      <li key={r.mmsi} className="flex items-center justify-between gap-3 px-3 py-2">
                        <span className="min-w-0">
                          <span className="flex items-center gap-2"><span className="truncate text-sm font-medium">{r.name}</span><TierChip tier={r.tier} compact /></span>
                          <span className="block font-mono text-[11px] text-ink-3">MMSI {r.mmsi} · {TYPE_LABEL[r.type_group]} · {r.flag} · {r.behaviour}{r.behaviour === 'dark' ? ' (AIS gap)' : ''}</span>
                        </span>
                        <span className="font-display text-xl font-semibold tnum">{r.score}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex justify-end border-t border-line px-5 py-3">
                <Link to={`/app/incidents/${d.id}`} onClick={onClose}
                  className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-deep">
                  Open full investigation <ArrowRight className="size-4" />
                </Link>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
