import { useMemo, useState, type ReactNode } from 'react'
import { CircleMarker, MapContainer, Polygon, Polyline, ScaleControl, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { ellipsePoints } from '../lib/geo'
import type { LonLat, OriginZone, VesselType } from '../lib/types'
import type { PlanTrack, PlanVessel } from './PlanView'

type Basemap = 'satellite' | 'streets'

const SLICK_PANE = 'slick'

/** True-colour Esri World Imagery — real coastlines, water, terrain, no styling layer between us and the ground. */
const BASEMAPS: Record<Basemap, { url: string; attribution: string; maxZoom: number }> = {
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
    maxZoom: 19,
  },
  streets: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  },
}

const TYPE_COLOR: Record<VesselType, string> = {
  tanker: '#ff6803', cargo: '#1e6b74', fishing: '#7c8a3d', passenger: '#8a5fa8', tug: '#928c83', other: '#b3ada3',
}
/** Leaflet takes [lat, lon]; our data is [lon, lat] throughout. */
const ll = ([lon, lat]: LonLat): [number, number] => [lat, lon]

interface Cursor { lat: number; lon: number; zoom: number }

/**
 * Live cursor position readout. PlanView labels its graticule, so the real map needs the
 * equivalent — decimal degrees to 4 places, per the project convention.
 */
function CursorReadout({ onChange }: { onChange: (c: Cursor | null) => void }) {
  const map = useMapEvents({
    mousemove: (e) => onChange({ lat: e.latlng.lat, lon: e.latlng.lng, zoom: map.getZoom() }),
    mouseout: () => onChange(null),
  })
  return null
}

/**
 * Leaflet paints every pane in its own stacking context, so `mix-blend-mode` set on a path
 * blends against the (transparent) overlay pane and never reaches the tiles. Set on a pane
 * of its own, between the tile pane (z 200) and the overlay pane (z 400), it does: the slick
 * multiplies into the imagery like a real sheen darkening the water rather than replacing it,
 * and vessels, tracks and ellipses still draw above it.
 */
function SlickPane({ children }: { children: ReactNode }) {
  const map = useMap()
  // Created during render, not in an effect: Leaflet throws on an unknown pane name, so the
  // pane must exist before the child paths mount. getPane() first keeps it idempotent.
  const pane = useMemo(() => {
    const p = map.getPane(SLICK_PANE) ?? map.createPane(SLICK_PANE)
    p.style.zIndex = '350'
    p.style.mixBlendMode = 'multiply'
    return p
  }, [map])
  return pane ? <>{children}</> : null
}

/**
 * Real, coordinate-accurate map: genuine satellite/street basemap tiles under our incident layers, via
 * Leaflet — real coastlines, water bodies and terrain colour, with correct scroll/pinch/double-click zoom
 * and pan, which the hand-drawn PlanView (SVG + custom viewBox math) was never built to support. Needs
 * network access to fetch tiles; PlanView stays the default, offline-safe view for that reason.
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
  const [basemap, setBasemap] = useState<Basemap>('satellite')
  const [cursor, setCursor] = useState<Cursor | null>(null)
  const bm = BASEMAPS[basemap]
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
    <div className={className} style={{ position: 'relative' }}>
      <MapContainer center={center} zoom={11} bounds={bounds} className="size-full" scrollWheelZoom>
        <TileLayer key={basemap} attribution={bm.attribution} url={bm.url} maxZoom={bm.maxZoom} />
        <ScaleControl position="bottomright" imperial={false} />
        <CursorReadout onChange={setCursor} />
        {basemap === 'satellite' && (
          <TileLayer
            attribution=""
            url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
            maxZoom={19}
            opacity={0.85}
          />
        )}

      {/* origin ellipses, oldest first so the newest sits on top */}
      {[...zones]
        .sort((a, b) => b.hours_before - a.hours_before)
        .map((z) => (
          <Polygon
            key={z.hours_before}
            positions={ellipsePoints(z).map(ll)}
            pathOptions={{
              // brighter over satellite imagery, where deep orange on dark water disappears
              color: basemap === 'satellite' ? '#ff8a33' : '#ae3a02',
              weight: 1.5,
              dashArray: '6 4',
              fillColor: '#ff6803',
              fillOpacity: z.hours_before <= 6 ? 0.2 : z.hours_before <= 12 ? 0.14 : 0.09,
            }}
          >
            <Tooltip permanent direction="center" className="!rounded !border-0 !bg-ink/70 !px-1.5 !py-0.5 !font-mono !text-[11px] !text-white !shadow-none">
              t−{z.hours_before}h
            </Tooltip>
          </Polygon>
        ))}

      {/* The slick, blended into the imagery rather than pasted on top: a soft feathered
          halo (wide, faint strokes) fading into the water, then a multiply-blended body so
          the sea texture still reads through it — the way a real sheen looks on the water. */}
      {polygon.length > 2 && (
        <SlickPane>
          <Polygon positions={polygon.map(ll)} interactive={false} pane={SLICK_PANE}
            pathOptions={{ color: '#14100c', weight: 22, opacity: 0.07, fill: false, lineJoin: 'round' }} />
          <Polygon positions={polygon.map(ll)} interactive={false} pane={SLICK_PANE}
            pathOptions={{ color: '#14100c', weight: 11, opacity: 0.13, fill: false, lineJoin: 'round' }} />
          <Polygon positions={polygon.map(ll)} interactive={false} pane={SLICK_PANE}
            pathOptions={{ color: '#0b0501', weight: 1, opacity: 0.55, fillColor: '#14100c', fillOpacity: 0.72 }} />
        </SlickPane>
      )}

      {/* selected track, gap segments dashed and red */}
      {track && track.points.length > 1 && (
        <>
          {track.points.slice(1).map((k, i) => (
            <Polyline
              key={i}
              positions={[track.points[i].p, k.p].map(ll)}
              pathOptions={{
                // light track over dark imagery, dark track over the pale street map
                color: k.gap ? (basemap === 'satellite' ? '#ff5a45' : '#c7301f') : basemap === 'satellite' ? '#f4f2ef' : '#14100c',
                weight: k.gap ? 3 : 2,
                opacity: k.gap ? 0.95 : 0.85,
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

      {/* Top-centre: the two flanks are taken by the view toggle and the incident card. */}
      <div className="absolute left-1/2 top-3 z-[500] flex -translate-x-1/2 overflow-hidden rounded-md border border-line bg-surface/90 text-[11px] font-medium shadow-sm backdrop-blur">
        {(['satellite', 'streets'] as const).map((b) => (
          <button
            key={b}
            type="button"
            onClick={() => setBasemap(b)}
            className={basemap === b ? 'bg-ink px-2.5 py-1.5 capitalize text-bg' : 'px-2.5 py-1.5 capitalize text-ink-2 hover:text-ink'}
          >
            {b}
          </button>
        ))}
      </div>

      <div className="absolute bottom-14 right-3 z-[500] rounded border border-line bg-surface/90 px-2 py-1 font-mono text-[11px] text-ink-2 shadow-sm backdrop-blur">
        {cursor
          ? `${Math.abs(cursor.lat).toFixed(4)}°${cursor.lat >= 0 ? 'N' : 'S'} ${Math.abs(cursor.lon).toFixed(4)}°${cursor.lon >= 0 ? 'E' : 'W'} · z${cursor.zoom}`
          : 'move over the map for coordinates'}
      </div>
    </div>
  )
}
