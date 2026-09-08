import { useMemo, useState } from 'react'
import { Map as MapIcon, Radar } from 'lucide-react'
import { positionAt } from '../lib/geo'
import { fmtUtc, TYPE_LABEL } from '../lib/format'
import type { IncidentDetail } from '../lib/types'
import { useUi } from '../store/ui'
import { cn } from '../lib/cn'
import PlanView, { ShipGlyph, type PlanVessel } from './PlanView'
import RealMap from './RealMap'
import { TierChip } from './Primitives'

type Layer = 'slick' | 'zones' | 'vessels' | 'tracks'
const LAYERS: { id: Layer; label: string }[] = [
  { id: 'slick', label: 'Slick polygon' },
  { id: 'zones', label: 'Drift origin zones' },
  { id: 'vessels', label: 'AIS vessels' },
  { id: 'tracks', label: 'Vessel tracks' },
]

/**
 * The full map for one confirmed incident: its slick, backtracked drift ellipses, every ranked
 * vessel at the replay instant with its trajectory, the selected vessel's track highlighted.
 * Lives inside the Investigation page (opened by "Open the map") rather than on a page of its
 * own, because none of this data exists for an unconfirmed detection — an incident is the unit.
 *
 * Selection is shared with the case-file panels through useUi, so a ship clicked on the map is
 * the same ship highlighted in "Ranked vessels", and vice versa.
 */
export default function IncidentMap({ d }: { d: IncidentDetail }) {
  const { selectedMmsi, selectMmsi, replayHours, setReplayHours } = useUi()
  // Real satellite by default — the true ground picture. Plan view stays one click away as the
  // offline-safe fallback (hand-drawn, no tiles) for when venue WiFi dies mid-demo.
  const [mode, setMode] = useState<'plan' | 'map'>('map')
  const [layers, setLayers] = useState<Record<Layer, boolean>>({ slick: true, zones: true, vessels: true, tracks: true })
  const toggle = (l: Layer) => setLayers((s) => ({ ...s, [l]: !s[l] }))

  const t = new Date(d.detected_at).getTime() - replayHours * 3600_000
  const vessels: PlanVessel[] = useMemo(() => d.ranking.map((r) => {
    const at = positionAt(r.track, t)
    const prev = positionAt(r.track, t - 600_000)
    const cog = at && prev ? (Math.atan2((at.p[0] - prev.p[0]) * Math.cos((at.p[1] * Math.PI) / 180), at.p[1] - prev.p[1]) * 180) / Math.PI : 0
    return { mmsi: r.mmsi, name: r.name, type: r.type_group, position: at?.p ?? r.track[r.track.length - 1].p, cog: (cog + 360) % 360, selected: r.mmsi === selectedMmsi, dark: !!at?.gap }
  }), [d, t, selectedMmsi])
  const sel = d.ranking.find((r) => r.mmsi === selectedMmsi)

  const common = {
    polygon: layers.slick ? d.polygon : [],
    zones: layers.zones ? d.origin_zones : [],
    vessels: layers.vessels ? vessels : [],
    track: layers.tracks && sel ? { points: sel.track } : undefined,
    onSelect: (m: string) => selectMmsi(m === selectedMmsi ? null : m),
  }
  // Every other candidate's trajectory, faint, so the selected one reads against the traffic it sat in.
  const otherTracks = layers.tracks ? d.ranking.filter((r) => r.mmsi !== selectedMmsi).map((r) => ({ points: r.track })) : []

  return (
    // An explicit height, not a min-height: Leaflet sizes itself as 100% of its parent, and a
    // percentage against a parent that only has min-height resolves to zero — an invisible map.
    <div className="relative h-[calc(100dvh-236px)] min-h-[520px] overflow-hidden rounded-lg border border-line bg-bg">
      {mode === 'plan' ? (
        <PlanView className="size-full" {...common} />
      ) : (
        <RealMap className="size-full" {...common} tracks={otherTracks} />
      )}

      {/* left-16 clears Leaflet's own zoom buttons in the corner */}
      <div className="absolute left-16 top-4 z-[500] flex rounded-md border border-line bg-surface/90 p-1 text-xs backdrop-blur">
        <button type="button" onClick={() => setMode('map')}
          className={cn('flex items-center gap-1.5 rounded px-2.5 py-1.5 font-medium', mode === 'map' ? 'bg-ink text-bg' : 'text-ink-2 hover:text-ink')}
          title="Real satellite imagery on true coordinates. Needs network access.">
          <MapIcon className="size-3.5" /> Satellite
        </button>
        <button type="button" onClick={() => setMode('plan')}
          className={cn('flex items-center gap-1.5 rounded px-2.5 py-1.5 font-medium', mode === 'plan' ? 'bg-ink text-bg' : 'text-ink-2 hover:text-ink')}
          title="Offline-safe plan view: real geometry, no basemap, no network needed.">
          <Radar className="size-3.5" /> Plan view
        </button>
      </div>

      <div className="absolute left-16 top-16 z-[500] w-56 rounded-md border border-line bg-surface/90 p-3 text-sm backdrop-blur">
        <div className="label-caps mb-1">Layers</div>
        {LAYERS.map((l) => (
          <label key={l.id} className="flex items-center gap-2 py-0.5 text-ink-2">
            <input type="checkbox" checked={layers[l.id]} onChange={() => toggle(l.id)} className="accent-accent" />{l.label}
          </label>
        ))}
      </div>

      <div className="absolute right-4 top-4 z-[500] w-72 rounded-md border border-line bg-surface/90 p-3 text-sm backdrop-blur">
        {sel ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-semibold">{sel.name}</span>
              <TierChip tier={sel.tier} compact />
            </div>
            <div className="mt-0.5 text-xs text-ink-2">{TYPE_LABEL[sel.type_group]} · {sel.flag} · MMSI {sel.mmsi} · {sel.behaviour}{sel.behaviour === 'dark' ? ' (AIS gap)' : ''}</div>
            <div className="mt-1 font-mono text-sm tnum">{sel.score}<span className="text-ink-3">/100</span></div>
          </>
        ) : <div className="text-xs text-ink-3">Click a vessel to highlight its track.</div>}
      </div>

      <div className="absolute bottom-4 left-1/2 z-[500] w-[min(640px,90%)] -translate-x-1/2 rounded-md border border-line bg-surface/90 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between text-xs">
          <span className="label-caps">Replay</span>
          <span className="font-mono text-ink-2">{replayHours === 0 ? 'acquisition' : `t − ${replayHours} h`} · {fmtUtc(new Date(t).toISOString())}</span>
        </div>
        <input type="range" min={0} max={24} step={0.25} value={replayHours} onChange={(e) => setReplayHours(+e.target.value)} className="mt-1 w-full accent-accent" aria-label="Replay hours before acquisition" />
        <div className="flex justify-between font-mono text-[10px] text-ink-3"><span>t−24h</span><span>t−12h</span><span>t−6h</span><span>t0</span></div>
      </div>

      <div className="absolute bottom-4 left-4 z-[500] rounded-md border border-line bg-surface/90 p-3 text-[11px] backdrop-blur">
        <div className="label-caps mb-1">Vessel type</div>
        {Object.entries({ tanker: '#ff6803', cargo: '#1e6b74', fishing: '#7c8a3d', passenger: '#8a5fa8', tug: '#928c83' }).map(([k, c]) => (
          <div key={k} className="flex items-center gap-2 text-ink-2"><ShipGlyph color={c} />{TYPE_LABEL[k]}</div>
        ))}
        <div className="mt-1 flex items-center gap-2 text-ink-2"><ShipGlyph color="#c7301f" dark />AIS dark</div>
      </div>
    </div>
  )
}
