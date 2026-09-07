export const fmtKm2 = (v: number) => `${v.toFixed(2)} km²`
export const fmtPct = (v: number) => `${Math.round(v * 100)}%`
export const fmtCoord = ([lon, lat]: [number, number]) =>
  `${Math.abs(lat).toFixed(4)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(4)}°${lon >= 0 ? 'E' : 'W'}`
export const fmtUtc = (iso: string) => {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}Z`
}
export const fmtIst = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false }) + ' IST'
export const fmtAgo = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 48) return `${h} h ago`
  return `${Math.round(h / 24)} d ago`
}

export const TIER_LABEL: Record<'prime' | 'poi' | 'cleared', string> = {
  prime: 'Prime suspect',
  poi: 'Person of interest',
  cleared: 'Cleared',
}
export const STATUS_LABEL: Record<string, string> = {
  detected: 'Detected',
  investigating: 'Investigating',
  inspection_requested: 'Inspection requested',
  closed: 'Closed',
}
export const TYPE_LABEL: Record<string, string> = {
  tanker: 'Tanker',
  cargo: 'Cargo',
  fishing: 'Fishing',
  passenger: 'Passenger',
  tug: 'Tug',
  other: 'Other',
}
