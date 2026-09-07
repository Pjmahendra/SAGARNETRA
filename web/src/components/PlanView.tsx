import { useMemo } from 'react'
import { bboxOf, ellipsePoints, kmPerDegLon } from '../lib/geo'
import type { LonLat, OriginZone, VesselType } from '../lib/types'

export interface PlanVessel {
  mmsi: string
  name: string
  type: VesselType
  position: LonLat
  cog: number
  selected?: boolean
  dark?: boolean
}
export interface PlanTrack {
  points: { p: LonLat; gap?: boolean }[]
}

const TYPE_COLOR: Record<VesselType, string> = {
  tanker: '#ff6803', cargo: '#1e6b74', fishing: '#7c8a3d', passenger: '#8a5fa8', tug: '#928c83', other: '#b3ada3',
}

/**
 * Hull silhouette seen from above: pointed bow, flared shoulders, flat stern. Rotated to the
 * course over ground, so a glance gives both position and heading — heading is evidence here,
 * and a dot cannot carry it. Shared with RealMap and the map legend so all three agree.
 */
export const HULL = 'M0,-12 C3,-8 5.2,-3.5 5.2,1.5 L5.2,8.5 C5.2,10.2 3.6,11 0,11 C-3.6,11 -5.2,10.2 -5.2,8.5 L-5.2,1.5 C-5.2,-3.5 -3,-8 0,-12 Z'

/** The same hull at legend size, so the key matches what is on the map. */
export function ShipGlyph({ color, dark = false }: { color: string; dark?: boolean }) {
  return (
    <svg width="11" height="11" viewBox="-13 -13 26 26" aria-hidden className="shrink-0">
      <path d={HULL} fill={dark ? 'none' : color} fillOpacity={0.95} stroke={color} strokeWidth={2}
        strokeLinejoin="round" strokeDasharray={dark ? '4 3' : undefined} />
    </svg>
  )
}

/**
 * 2D plan view of an incident: slick polygon, origin ellipses, vessels and one highlighted track.
 * Stands in for the Cesium globe until it lands (week 4) and stays as the mini-map in Investigation.
 */
export default function PlanView({
  polygon = [], zones = [], vessels = [], track, onSelect, className, showGrid = true, focus,
}: {
  polygon?: LonLat[]
  zones?: OriginZone[]
  vessels?: PlanVessel[]
  track?: PlanTrack
  onSelect?: (mmsi: string) => void
  className?: string
  showGrid?: boolean
  /** optional explicit bbox [w,s,e,n] */
  focus?: [number, number, number, number]
}) {
  const W = 1000, H = 700
  const { bbox, toXY, ellipses, gridLons, gridLats, scaleKmPx } = useMemo(() => {
    const ells = zones.map((z) => ellipsePoints(z))
    const pts: LonLat[] = focus ? [[focus[0], focus[1]], [focus[2], focus[3]]] : [...polygon, ...ells.flat(), ...vessels.map((v) => v.position), ...(track?.points.map((k) => k.p) ?? [])]
    let [w, s, e, n] = bboxOf(pts, focus ? 0 : 0.12)
    const midLat = (s + n) / 2
    // keep aspect ratio true to ground distance
    const kmW = (e - w) * kmPerDegLon(midLat), kmH = (n - s) * 111.32
    const target = W / H
    if (kmW / kmH < target) { const need = kmH * target; const extra = (need - kmW) / kmPerDegLon(midLat) / 2; w -= extra; e += extra }
    else { const need = kmW / target; const extra = (need - kmH) / 111.32 / 2; s -= extra; n += extra }
    const toXY = ([lon, lat]: LonLat): [number, number] => [((lon - w) / (e - w)) * W, ((n - lat) / (n - s)) * H]
    const step = (e - w) > 1.5 ? 0.5 : (e - w) > 0.6 ? 0.2 : (e - w) > 0.25 ? 0.1 : 0.05
    const gridLons: number[] = [], gridLats: number[] = []
    for (let x = Math.ceil(w / step) * step; x < e; x += step) gridLons.push(+x.toFixed(4))
    for (let y = Math.ceil(s / step) * step; y < n; y += step) gridLats.push(+y.toFixed(4))
    const scaleKmPx = W / ((e - w) * kmPerDegLon(midLat))
    return { bbox: [w, s, e, n] as const, toXY, ellipses: ells, gridLons, gridLats, scaleKmPx }
  }, [polygon, zones, vessels, track, focus])

  const path = (pts: LonLat[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${toXY(p).map((v) => v.toFixed(1)).join(',')}`).join(' ')
  const scaleKm = scaleKmPx * 5 > 60 ? 5 : scaleKmPx * 10 > 60 ? 10 : 25

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} role="img" aria-label="Incident plan view">
      <rect width={W} height={H} fill="#f4f2ef" />
      {showGrid && (
        <g stroke="#dad5cd" strokeWidth={1}>
          {gridLons.map((x) => { const [px] = toXY([x, bbox[1]]); return <line key={`lon${x}`} x1={px} x2={px} y1={0} y2={H} /> })}
          {gridLats.map((y) => { const [, py] = toXY([bbox[0], y]); return <line key={`lat${y}`} x1={0} x2={W} y1={py} y2={py} /> })}
        </g>
      )}
      {showGrid && (
        <g fill="#928c83" fontFamily="IBM Plex Mono, monospace" fontSize={16}>
          {gridLons.map((x) => { const [px] = toXY([x, bbox[1]]); return <text key={`tl${x}`} x={px + 4} y={H - 8}>{x.toFixed(2)}°E</text> })}
          {gridLats.map((y) => { const [, py] = toXY([bbox[0], y]); return <text key={`tt${y}`} x={6} y={py - 4}>{y.toFixed(2)}°N</text> })}
        </g>
      )}

      {/* origin ellipses, oldest first so the newest sits on top */}
      {[...ellipses].map((pts, i) => ({ pts, z: zones[i] })).sort((a, b) => b.z.hours_before - a.z.hours_before).map(({ pts, z }) => {
        const op = z.hours_before <= 6 ? 0.55 : z.hours_before <= 12 ? 0.4 : 0.26
        const [cx, cy] = toXY(z.center)
        return (
          <g key={z.hours_before}>
            <path d={path(pts) + ' Z'} fill="#ff6803" fillOpacity={op * 0.28} stroke="#ae3a02" strokeOpacity={op + 0.25} strokeWidth={1.5} strokeDasharray="6 4" />
            <text x={cx} y={cy + 5} textAnchor="middle" fill="#ae3a02" fillOpacity={0.95} fontFamily="IBM Plex Mono, monospace" fontSize={15}>t−{z.hours_before}h</text>
          </g>
        )
      })}

      {/* drift direction hint from oldest zone to slick */}
      {zones.length > 0 && polygon.length > 0 && (() => {
        const oldest = [...zones].sort((a, b) => b.hours_before - a.hours_before)[0]
        const a = toXY(oldest.center), c = polygon.reduce<[number, number]>((acc, p) => [acc[0] + p[0] / polygon.length, acc[1] + p[1] / polygon.length], [0, 0])
        const b = toXY(c)
        return <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#ae3a02" strokeOpacity={0.4} strokeWidth={1} strokeDasharray="2 6" />
      })()}

      {/* selected track */}
      {track && track.points.length > 1 && track.points.slice(1).map((k, i) => {
        const a = toXY(track.points[i].p), b = toXY(k.p)
        return <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={k.gap ? '#c7301f' : '#14100c'} strokeOpacity={k.gap ? 0.95 : 0.75} strokeWidth={k.gap ? 3 : 2} strokeDasharray={k.gap ? '8 6' : undefined} />
      })}

      {/* slick */}
      {polygon.length > 2 && (
        <path d={path(polygon) + ' Z'} fill="#14100c" fillOpacity={0.82} stroke="#14100c" strokeWidth={1.5} />
      )}

      {/* vessels */}
      {vessels.map((v) => {
        const [x, y] = toXY(v.position)
        const c = TYPE_COLOR[v.type]
        return (
          <g key={v.mmsi} transform={`translate(${x},${y})`} onClick={onSelect ? () => onSelect(v.mmsi) : undefined} style={{ cursor: onSelect ? 'pointer' : 'default' }}>
            {v.selected && <circle r={16} fill="none" stroke="#14100c" strokeWidth={2} />}
            <g transform={`rotate(${v.cog})`}>
              <path d={HULL} fill={v.dark ? '#f4f2ef' : c} stroke={c} strokeWidth={v.dark ? 2 : 1}
                strokeLinejoin="round" strokeDasharray={v.dark ? '4 3' : undefined} />
            </g>
            <text x={12} y={-8} fill="#5b564f" fontFamily="IBM Plex Mono, monospace" fontSize={14}>{v.name}</text>
          </g>
        )
      })}

      {/* scale bar */}
      <g transform={`translate(${W - 40 - scaleKm * scaleKmPx}, ${H - 28})`} stroke="#5b564f" strokeWidth={2}>
        <line x1={0} x2={scaleKm * scaleKmPx} y1={0} y2={0} />
        <line x1={0} x2={0} y1={-5} y2={5} />
        <line x1={scaleKm * scaleKmPx} x2={scaleKm * scaleKmPx} y1={-5} y2={5} />
        <text x={(scaleKm * scaleKmPx) / 2} y={-9} textAnchor="middle" fill="#5b564f" stroke="none" fontFamily="IBM Plex Mono, monospace" fontSize={14}>{scaleKm} km</text>
      </g>
    </svg>
  )
}
