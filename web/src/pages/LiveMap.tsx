import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { Map as MapIcon, Radar } from 'lucide-react'
import { api } from '../lib/api'
import { positionAt } from '../lib/geo'
import { fmtCoord, fmtUtc, TYPE_LABEL } from '../lib/format'
import { useUi } from '../store/ui'
import { cn } from '../lib/cn'
import PlanView, { type PlanVessel } from '../components/PlanView'
import RealMap from '../components/RealMap'
import { Spinner, TierChip } from '../components/Primitives'

export default function LiveMap() {
  const incidents = useQuery({ queryKey: ['incidents'], queryFn: api.incidents })
  const open = incidents.data?.find((i) => i.status !== 'closed')
  const detail = useQuery({ queryKey: ['incident', open?.id], queryFn: () => api.incident(open!.id), enabled: !!open })
  const { selectedMmsi, selectMmsi, replayHours, setReplayHours } = useUi()
  const d = detail.data
  // Plan view is the offline-safe default (hand-drawn, no network); Map view is a real,
  // coordinate-accurate slippy map that needs to fetch tiles. An explicit choice, not a
  // silent fallback — Plan view's SVG math was never built to zoom/pan correctly, Map
  // view is, but only Plan view is guaranteed to work with no network at demo time.
  const [mode, setMode] = useState<'plan' | 'map'>('plan')

  const t = d ? new Date(d.detected_at).getTime() - replayHours * 3600_000 : 0
  const vessels: PlanVessel[] = useMemo(() => (d?.ranking ?? []).map((r) => {
    const at = positionAt(r.track, t)
    const prev = positionAt(r.track, t - 600_000)
    const cog = at && prev ? (Math.atan2((at.p[0] - prev.p[0]) * Math.cos((at.p[1] * Math.PI) / 180), at.p[1] - prev.p[1]) * 180) / Math.PI : 0
    return { mmsi: r.mmsi, name: r.name, type: r.type_group, position: at?.p ?? r.track[r.track.length - 1].p, cog: (cog + 360) % 360, selected: r.mmsi === selectedMmsi, dark: !!at?.gap }
  }), [d, t, selectedMmsi])
  const sel = d?.ranking.find((r) => r.mmsi === selectedMmsi)

  return (
    <div className="relative h-full min-h-[560px] bg-bg">
      {!d ? <div className="grid h-full place-items-center"><Spinner label="Loading incident" /></div> : mode === 'plan' ? (
        <PlanView className="absolute inset-0 size-full" polygon={d.polygon} zones={d.origin_zones} vessels={vessels}
          track={sel ? { points: sel.track } : undefined} onSelect={(m) => selectMmsi(m === selectedMmsi ? null : m)} />
      ) : (
        <RealMap className="absolute inset-0 size-full" polygon={d.polygon} zones={d.origin_zones} vessels={vessels}
          track={sel ? { points: sel.track } : undefined} onSelect={(m) => selectMmsi(m === selectedMmsi ? null : m)} />
      )}

      <div className="absolute left-4 top-4 z-[500] flex rounded-md border border-line bg-surface/90 p-1 text-xs backdrop-blur">
        <button type="button" onClick={() => setMode('plan')}
          className={cn('flex items-center gap-1.5 rounded px-2.5 py-1.5 font-medium', mode === 'plan' ? 'bg-ink text-bg' : 'text-ink-2 hover:text-ink')}>
          <Radar className="size-3.5" /> Plan view
        </button>
        <button type="button" onClick={() => setMode('map')}
          className={cn('flex items-center gap-1.5 rounded px-2.5 py-1.5 font-medium', mode === 'map' ? 'bg-ink text-bg' : 'text-ink-2 hover:text-ink')}
          title="Real coordinates on OpenStreetMap tiles. Needs network access.">
          <MapIcon className="size-3.5" /> Map view
        </button>
      </div>

      <div className="absolute left-4 top-16 z-[500] w-64 rounded-md border border-line bg-surface/90 p-3 text-sm backdrop-blur">
        <div className="label-caps mb-1">Layers</div>
        {['Slick polygon', 'Drift origin zones', 'AIS vessels', 'Selected track'].map((l) => (
          <label key={l} className="flex items-center gap-2 py-0.5 text-ink-2"><input type="checkbox" defaultChecked className="accent-accent" />{l}</label>
        ))}
        <div className="mt-2 border-t border-line pt-2 text-[11px] text-ink-3">
          {mode === 'plan'
            ? 'Offline-safe plan view: real geometry, no basemap, no network needed.'
            : 'Real OpenStreetMap tiles with correct scroll/pinch zoom. Needs network access.'}
        </div>
      </div>

      {d && (
        <div className="absolute right-4 top-4 z-[500] w-72 rounded-md border border-line bg-surface/90 p-3 text-sm backdrop-blur">
          <div className="flex items-center justify-between"><span className="font-mono">{d.code}</span>{d.top_tier && <TierChip tier={d.top_tier} compact />}</div>
          <div className="mt-1 text-xs text-ink-2">{d.zone} · {d.area_km2.toFixed(2)} km² · {fmtUtc(d.detected_at)}</div>
          <div className="mt-1 font-mono text-xs text-ink-3">{fmtCoord(d.centroid)}</div>
          {sel ? (
            <div className="mt-3 border-t border-line pt-2">
              <div className="font-semibold">{sel.name}</div>
              <div className="text-xs text-ink-2">{TYPE_LABEL[sel.type_group]} · {sel.flag} · MMSI {sel.mmsi} · {sel.behaviour}</div>
              <div className="mt-1 flex items-center gap-2"><TierChip tier={sel.tier} compact /><span className="font-mono text-sm tnum">{sel.score}/100</span></div>
              <Link to={`/app/incidents/${d.id}`} className="mt-2 inline-block text-xs text-sea hover:underline">Open investigation</Link>
            </div>
          ) : <div className="mt-3 border-t border-line pt-2 text-xs text-ink-3">Click a vessel for its card.</div>}
        </div>
      )}

      {d && (
        <div className="absolute bottom-4 left-1/2 z-[500] w-[min(640px,90%)] -translate-x-1/2 rounded-md border border-line bg-surface/90 px-4 py-3 backdrop-blur">
          <div className="flex items-center justify-between text-xs">
            <span className="label-caps">Replay</span>
            <span className="font-mono text-ink-2">{replayHours === 0 ? 'acquisition' : `t − ${replayHours} h`} · {fmtUtc(new Date(t).toISOString())}</span>
          </div>
          <input type="range" min={0} max={24} step={0.25} value={replayHours} onChange={(e) => setReplayHours(+e.target.value)} className="mt-1 w-full accent-accent" aria-label="Replay hours before acquisition" />
          <div className="flex justify-between font-mono text-[10px] text-ink-3"><span>t−24h</span><span>t−12h</span><span>t−6h</span><span>t0</span></div>
        </div>
      )}

      <div className="absolute bottom-4 left-4 z-[500] rounded-md border border-line bg-surface/90 p-3 text-[11px] backdrop-blur">
        <div className="label-caps mb-1">Vessel type</div>
        {Object.entries({ tanker: '#ff6803', cargo: '#1e6b74', fishing: '#7c8a3d', passenger: '#8a5fa8', tug: '#928c83' }).map(([k, c]) => (
          <div key={k} className="flex items-center gap-2 text-ink-2"><span className="size-2 rounded-sm" style={{ background: c }} />{TYPE_LABEL[k]}</div>
        ))}
        <div className="mt-1 flex items-center gap-2 text-ink-2"><span className="size-2 rounded-sm border border-crit" />AIS dark</div>
      </div>
    </div>
  )
}
