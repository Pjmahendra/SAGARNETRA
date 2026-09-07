import { useMemo } from 'react'
import { CircleMarker, MapContainer, Polygon, Polyline, TileLayer, Tooltip } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { ellipsePoints } from '../lib/geo'
import type { LonLat, OriginZone, VesselType } from '../lib/types'
import type { PlanTrack, PlanVessel } from './PlanView'

const TYPE_COLOR: Record<VesselType, string> = {
  tanker: '#ff6803', cargo: '#1e6b74', fishing: '#7c8a3d', passenger: '#8a5fa8', tug: '#928c83', other: '#b3ada3',
}
/** Leaflet takes [lat, lon]; our data is [lon, lat] throughout. */
const ll = ([lon, lat]: LonLat): [number, number] => [lat, lon]

/**
 * Real, coordinate-accurate map: actual OpenStreetMap tiles under our incident layers, via Leaflet —
 * a mature slippy map with correct scroll/pinch/double-click zoom and pan, which the hand-drawn
 * PlanView (SVG + custom viewBox math) was never built to support. Needs network access to fetch
 * tiles; PlanView stays the default, offline-safe view for that reason.
 */
export default function RealMap({
  polygon = [], zones = [], vessels = [], track, onSelect, className, focus,
}: {
  polygon?: LonLat[]
  zones?: OriginZone[]
  vessels?: PlanVessel[]
  track?: PlanTrack
  onSelect?: (mmsi: string) => void
  className?: string
  focus?: [number, number, number, number]
}) {
  const { center, bounds } = useMemo(() => {
    const pts: LonLat[] = focus
      ? [[focus[0], focus[1]], [focus[2], focus[3]]]
      : [...polygon, ...zones.flatMap((z) => ellipsePoints(z)), ...vessels.map((v) => v.position), ...(track?.points.map((k) => k.p) ?? [])]
    if (pts.length === 0) return { center: [21.05, 69.42] as [number, number], bounds: undefined }
    let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity
    for (const [lon, lat] of pts) { w = Math.min(w, lon); e = Math.max(e, lon); s = Math.min(s, lat); n = Math.max(n, lat) }
    const pad = Math.max((e - w) * 0.2, (n - s) * 0.2, 0.02)
    return {
      center: [(s + n) / 2, (w + e) / 2] as [number, number],
      bounds: [[s - pad, w - pad], [n + pad, e + pad]] as [[number, number], [number, number]],
    }
  }, [polygon, zones, vessels, track, focus])

  return (
    <MapContainer center={center} zoom={11} bounds={bounds} className={className} scrollWheelZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />

      {/* origin ellipses, oldest first so the newest sits on top */}
      {[...zones]
        .sort((a, b) => b.hours_before - a.hours_before)
        .map((z) => (
          <Polygon
            key={z.hours_before}
            positions={ellipsePoints(z).map(ll)}
            pathOptions={{
              color: '#ae3a02',
              weight: 1.5,
              dashArray: '6 4',
              fillColor: '#ff6803',
              fillOpacity: z.hours_before <= 6 ? 0.16 : z.hours_before <= 12 ? 0.11 : 0.07,
            }}
          >
            <Tooltip permanent direction="center" className="!border-0 !bg-transparent !font-mono !text-[11px] !text-accent-deep !shadow-none">
              t−{z.hours_before}h
            </Tooltip>
          </Polygon>
        ))}

      {/* slick polygon */}
      {polygon.length > 2 && (
        <Polygon positions={polygon.map(ll)} pathOptions={{ color: '#14100c', weight: 1.5, fillColor: '#14100c', fillOpacity: 0.75 }} />
      )}

      {/* selected track, gap segments dashed and red */}
      {track && track.points.length > 1 && (
        <>
          {track.points.slice(1).map((k, i) => (
            <Polyline
              key={i}
              positions={[track.points[i].p, k.p].map(ll)}
              pathOptions={{
                color: k.gap ? '#c7301f' : '#14100c',
                weight: k.gap ? 3 : 2,
                opacity: k.gap ? 0.95 : 0.75,
                dashArray: k.gap ? '8 6' : undefined,
              }}
            />
          ))}
        </>
      )}

      {/* vessels */}
      {vessels.map((v) => (
        <CircleMarker
          key={v.mmsi}
          center={ll(v.position)}
          radius={v.selected ? 8 : 6}
          pathOptions={{
            color: TYPE_COLOR[v.type],
            weight: v.selected ? 3 : v.dark ? 2 : 1.5,
            fillColor: v.dark ? '#f4f2ef' : TYPE_COLOR[v.type],
            fillOpacity: v.dark ? 0.4 : 0.9,
          }}
          eventHandlers={onSelect ? { click: () => onSelect(v.mmsi) } : undefined}
        >
          <Tooltip direction="top" offset={[0, -6]} className="!font-mono !text-[11px]">{v.name}</Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  )
}
