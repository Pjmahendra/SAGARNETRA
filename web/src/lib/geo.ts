import type { LonLat, OriginZone, RankingRow } from './types'

export const KM_PER_DEG_LAT = 111.32
export const kmPerDegLon = (lat: number) => KM_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180)

/** Bounding box [w, s, e, n] around a set of points, padded by a fraction of the larger span. */
export function bboxOf(points: LonLat[], pad = 0.15): [number, number, number, number] {
  if (points.length === 0) return [68.5, 20.5, 70.5, 21.8]
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity
  for (const [lon, lat] of points) { w = Math.min(w, lon); e = Math.max(e, lon); s = Math.min(s, lat); n = Math.max(n, lat) }
  const span = Math.max(e - w, n - s, 0.05)
  return [w - span * pad, s - span * pad, e + span * pad, n + span * pad]
}

/** Points on the outline of an origin-zone ellipse, in lon/lat. */
export function ellipsePoints(z: OriginZone, steps = 48): LonLat[] {
  const [cx, cy] = z.center
  const b = ((z.bearing_deg - 90) * Math.PI) / 180 // major axis angle from east, clockwise on screen
  const out: LonLat[] = []
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * 2 * Math.PI
    const xk = z.semi_major_km * Math.cos(t)
    const yk = z.semi_minor_km * Math.sin(t)
    // rotate in km space (east, north)
    const ek = xk * Math.cos(b) - yk * Math.sin(b)
    const nk = -(xk * Math.sin(b) + yk * Math.cos(b))
    out.push([cx + ek / kmPerDegLon(cy), cy + nk / KM_PER_DEG_LAT])
  }
  return out
}

/** Interpolated position along a track at time t (ms). Returns null outside the track window. */
export function positionAt(track: RankingRow['track'], t: number): { p: LonLat; gap: boolean } | null {
  if (track.length === 0) return null
  const times = track.map((k) => new Date(k.t).getTime())
  if (t <= times[0]) return { p: track[0].p, gap: false }
  if (t >= times[times.length - 1]) return { p: track[track.length - 1].p, gap: false }
  for (let i = 1; i < track.length; i++) {
    if (t <= times[i]) {
      const k = (t - times[i - 1]) / (times[i] - times[i - 1])
      const a = track[i - 1].p, b = track[i].p
      return { p: [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k], gap: !!track[i].gap }
    }
  }
  return null
}

export const bearingBetween = (a: LonLat, b: LonLat) => {
  const dx = (b[0] - a[0]) * kmPerDegLon((a[1] + b[1]) / 2)
  const dy = (b[1] - a[1]) * KM_PER_DEG_LAT
  return ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360
}
