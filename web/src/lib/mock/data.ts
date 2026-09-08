import type {
  AdminUser, AuditEntry, DetectResult, DetectSample, FeatureContribution, Health, Incident,
  IncidentDetail, LonLat, Overview, RankingRow, Report, SectorDetection, SectorSummary, Tier, User, Vessel,
} from '../types'

// ---- ranking weights (mirror of backend config; kept here for the mock) ----
export const WEIGHTS = {
  spatial: 25, temporal: 15, gap: 20, heading: 10, manoeuvre: 10, draft: 8, type: 8, history: 4,
} as const
const LABELS: Record<keyof typeof WEIGHTS, string> = {
  spatial: 'Spatial fit', temporal: 'Temporal fit', gap: 'AIS gap', heading: 'Heading match',
  manoeuvre: 'Manoeuvre', draft: 'Draft change', type: 'Type prior', history: 'History',
}
type FeatIn = Record<keyof typeof WEIGHTS, [normalised: number, raw: string]>
function features(f: FeatIn): { features: FeatureContribution[]; score: number; tier: Tier } {
  const rows = (Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]).map((key) => {
    const [normalised, raw] = f[key]
    const weight = WEIGHTS[key]
    return { key, label: LABELS[key], raw, normalised, weight, contribution: +(normalised * weight).toFixed(1) }
  })
  const score = Math.round(rows.reduce((s, r) => s + r.contribution, 0))
  const tier: Tier = score >= 65 ? 'prime' : score >= 35 ? 'poi' : 'cleared'
  return { features: rows, score, tier }
}

// ---- users ----
export const USERS: (AdminUser & { password: string; region?: string | null; zone_ids?: string[] })[] = [
  { id: 'u-admin', email: 'admin@sagarnetra.in', password: 'Admin@123', name: 'Cmdt. R. Iyer', role: 'admin', org: 'ICG HQ, New Delhi', active: true, created_at: '2026-09-01T09:00:00Z', last_login: '2026-09-07T04:12:00Z', region: null, zone_ids: [] },
  { id: 'u-off1', email: 'officer@sagarnetra.in', password: 'Officer@123', name: 'Lt. A. Menon', role: 'officer', org: 'ICG Region West, Porbandar', active: true, created_at: '2026-09-01T09:05:00Z', last_login: '2026-09-07T05:40:00Z', region: 'North-West', zone_ids: ['z-guj', 'z-mum'] },
  { id: 'u-off2', email: 's.rao@sagarnetra.in', password: 'Officer@123', name: 'Lt. S. Rao', role: 'officer', org: 'ICG Region East, Chennai', active: false, created_at: '2026-09-02T11:30:00Z', last_login: null, region: 'East', zone_ids: ['z-che'] },
]
export const publicUser = (u: AdminUser & { password: string; region?: string | null; zone_ids?: string[] }): User =>
  ({ id: u.id, email: u.email, name: u.name, role: u.role, org: u.org, region: u.region ?? null, zone_ids: u.zone_ids ?? [] })

// ---- demo geography: Gujarat offshore lane, off Saurashtra ----
const ACQ = '2026-09-06T01:12:00Z'
const hoursBefore = (h: number) => new Date(new Date(ACQ).getTime() - h * 3600_000).toISOString()

export const SLICK_POLYGON: LonLat[] = [
  [69.395, 21.072], [69.412, 21.081], [69.431, 21.079], [69.448, 21.068], [69.456, 21.052],
  [69.449, 21.037], [69.432, 21.031], [69.415, 21.036], [69.402, 21.049], [69.395, 21.072],
]
export const SLICK_CENTROID: LonLat = [69.426, 21.056]

const ORIGIN_ZONES = [
  { hours_before: 6, center: [69.335, 20.985] as LonLat, semi_major_km: 3.0, semi_minor_km: 1.8, bearing_deg: 42 },
  { hours_before: 12, center: [69.245, 20.912] as LonLat, semi_major_km: 6.0, semi_minor_km: 3.6, bearing_deg: 42 },
  { hours_before: 24, center: [69.062, 20.775] as LonLat, semi_major_km: 12.0, semi_minor_km: 7.2, bearing_deg: 42 },
]

// tracks: points every 4 h from t-24h to t0; guilty tanker has a gap around t-12h
const line = (from: LonLat, to: LonLat, n: number, t0 = 24, t1 = 0): { t: string; p: LonLat }[] =>
  Array.from({ length: n }, (_, i) => {
    const k = i / (n - 1)
    return { t: hoursBefore(t0 - (t0 - t1) * k), p: [from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k] as LonLat }
  })

const rank = (v: Omit<RankingRow, 'features' | 'score' | 'tier'>, f: FeatIn): RankingRow => ({ ...v, ...features(f) })

export const RANKING: RankingRow[] = [
  rank(
    {
      mmsi: '419001234', name: 'MT SAURASHTRA PRIDE', type_group: 'tanker', flag: 'IN', behaviour: 'dark',
      track: [
        ...line([68.82, 20.58], [69.18, 20.86], 4, 24, 13),
        { t: hoursBefore(12.6), p: [69.205, 20.882], gap: true },
        { t: hoursBefore(11.9), p: [69.29, 20.945], gap: true },
        ...line([69.31, 20.96], [69.86, 21.38], 4, 11.5, 0),
      ],
    },
    { spatial: [0.94, '0.4 km from t-12h zone centre'], temporal: [0.85, '51 min inside zone'], gap: [0.78, '42 min transponder gap at 12:36Z'], heading: [0.91, 'course 041° vs slick axis 042°'], manoeuvre: [0.70, 'speed 11.8 → 6.1 kn'], draft: [0.75, 'draft 12.4 → 11.6 m'], type: [1.0, 'tanker'], history: [0.0, 'no prior incidents'] },
  ),
  rank(
    { mmsi: '419002345', name: 'MV KONKAN TRADER', type_group: 'cargo', flag: 'IN', behaviour: 'transiting', track: line([68.95, 20.72], [69.75, 21.30], 7) },
    { spatial: [0.62, '2.1 km from t-12h zone edge'], temporal: [0.55, '33 min inside zone'], gap: [0.0, 'no gap'], heading: [0.88, 'course 044° vs 042°'], manoeuvre: [0.1, 'steady 13.2 kn'], draft: [0.0, 'not reported'], type: [0.7, 'cargo'], history: [0.0, 'none'] },
  ),
  rank(
    { mmsi: '470003456', name: 'MT GULF ASTER', type_group: 'tanker', flag: 'AE', behaviour: 'transiting', track: line([69.60, 20.60], [69.05, 21.10], 7) },
    { spatial: [0.48, '4.8 km from t-24h zone edge'], temporal: [0.30, '18 min inside zone'], gap: [0.0, 'no gap'], heading: [0.12, 'course 318° vs 042°'], manoeuvre: [0.0, 'steady 12.4 kn'], draft: [0.0, 'draft constant 9.8 m'], type: [1.0, 'tanker'], history: [0.0, 'none'] },
  ),
  rank(
    { mmsi: '563004567', name: 'MV OCEAN HARMONY', type_group: 'cargo', flag: 'SG', behaviour: 'transiting', track: line([68.70, 21.05], [69.70, 21.55], 7) },
    { spatial: [0.30, '9.5 km from nearest zone'], temporal: [0.0, 'never inside'], gap: [0.0, 'no gap'], heading: [0.55, 'course 062°'], manoeuvre: [0.0, 'steady'], draft: [0.0, 'not reported'], type: [0.7, 'cargo'], history: [0.0, 'none'] },
  ),
  rank(
    { mmsi: '636006789', name: 'MV MERIDIAN STAR', type_group: 'cargo', flag: 'LR', behaviour: 'transiting', track: line([69.90, 20.70], [69.10, 20.55], 7) },
    { spatial: [0.22, '12 km from t-24h zone'], temporal: [0.0, 'never inside'], gap: [0.0, 'no gap'], heading: [0.05, 'course 262°'], manoeuvre: [0.0, 'steady'], draft: [0.0, 'not reported'], type: [0.7, 'cargo'], history: [0.0, 'none'] },
  ),
  rank(
    { mmsi: '419005678', name: 'FV JAL SHAKTI', type_group: 'fishing', flag: 'IN', behaviour: 'loitering', track: line([69.30, 21.15], [69.36, 21.19], 7) },
    { spatial: [0.35, '7.2 km from t-6h zone'], temporal: [0.0, 'never inside'], gap: [0.15, '24 min gap (typical for class B)'], heading: [0.2, 'variable'], manoeuvre: [0.4, 'loitering 1.3 kn'], draft: [0.0, 'n/a'], type: [0.2, 'fishing'], history: [0.0, 'none'] },
  ),
  rank(
    { mmsi: '419008901', name: 'MV SAGAR RANI', type_group: 'passenger', flag: 'IN', behaviour: 'transiting', track: line([69.05, 21.30], [69.95, 21.60], 7) },
    { spatial: [0.12, '18 km from nearest zone'], temporal: [0.0, 'never inside'], gap: [0.0, 'no gap'], heading: [0.3, 'course 070°'], manoeuvre: [0.0, 'steady 17 kn'], draft: [0.0, 'n/a'], type: [0.4, 'passenger'], history: [0.0, 'none'] },
  ),
  rank(
    { mmsi: '419007890', name: 'TUG VISHWAS', type_group: 'tug', flag: 'IN', behaviour: 'anchored', track: line([69.62, 21.22], [69.62, 21.22], 7) },
    { spatial: [0.05, '26 km from nearest zone'], temporal: [0.0, 'never inside'], gap: [0.0, 'no gap'], heading: [0.0, 'anchored'], manoeuvre: [0.0, 'anchored'], draft: [0.0, 'n/a'], type: [0.3, 'tug'], history: [0.0, 'none'] },
  ),
].sort((a, b) => b.score - a.score)

export const INCIDENTS: Incident[] = [
  { id: 'inc-041', code: 'INC-2026-041', status: 'investigating', zone: 'Gujarat Offshore Lane', zone_id: 'z-guj', detected_at: ACQ, area_km2: 4.21, confidence: 0.91, engine: 'unet', centroid: SLICK_CENTROID, top_tier: 'prime', top_vessel: 'MT SAURASHTRA PRIDE', assigned_to: 'Lt. A. Menon', is_demo: true },
  { id: 'inc-040', code: 'INC-2026-040', status: 'closed', zone: 'Mumbai Approaches', zone_id: 'z-mum', detected_at: '2026-08-29T01:05:00Z', area_km2: 1.37, confidence: 0.64, engine: 'heuristic', centroid: [72.61, 18.84], top_tier: 'poi', top_vessel: 'MV WESTERN GLORY', assigned_to: 'Lt. A. Menon', is_demo: true },
  { id: 'inc-039', code: 'INC-2026-039', status: 'detected', zone: 'Chennai–Ennore', zone_id: 'z-che', detected_at: '2026-08-24T00:31:00Z', area_km2: 0.58, confidence: 0.77, engine: 'unet', centroid: [80.42, 13.21], top_tier: null, top_vessel: null, assigned_to: null, is_demo: true },
  { id: 'inc-036', code: 'INC-2026-036', status: 'detected', zone: 'Gujarat Offshore Lane', zone_id: 'z-guj', detected_at: '2026-09-03T01:20:00Z', area_km2: 1.8, confidence: 0.71, engine: 'unet', centroid: [69.42, 21.06], top_tier: null, top_vessel: null, assigned_to: null, is_demo: true },
  { id: 'inc-035', code: 'INC-2026-035', status: 'investigating', zone: 'Gujarat Offshore Lane', zone_id: 'z-guj', detected_at: '2026-09-01T01:15:00Z', area_km2: 3.1, confidence: 0.79, engine: 'unet', centroid: [69.5, 21.1], top_tier: 'poi', top_vessel: 'MV KATHIAWAR', assigned_to: 'Lt. A. Menon', is_demo: true },
  { id: 'inc-034', code: 'INC-2026-034', status: 'closed', zone: 'Gujarat Offshore Lane', zone_id: 'z-guj', detected_at: '2026-08-20T01:10:00Z', area_km2: 0.9, confidence: 0.63, engine: 'heuristic', centroid: [69.35, 20.98], top_tier: null, top_vessel: null, assigned_to: 'Lt. A. Menon', is_demo: true },
  { id: 'inc-033', code: 'INC-2026-033', status: 'detected', zone: 'Mumbai Approaches', zone_id: 'z-mum', detected_at: '2026-09-02T01:05:00Z', area_km2: 0.9, confidence: 0.66, engine: 'unet', centroid: [72.6, 18.85], top_tier: null, top_vessel: null, assigned_to: null, is_demo: true },
  { id: 'inc-032', code: 'INC-2026-032', status: 'investigating', zone: 'Mumbai Approaches', zone_id: 'z-mum', detected_at: '2026-08-27T01:00:00Z', area_km2: 2.2, confidence: 0.74, engine: 'unet', centroid: [72.65, 18.9], top_tier: 'poi', top_vessel: 'MT ARABIAN DAWN', assigned_to: 'Lt. A. Menon', is_demo: true },
  { id: 'inc-031', code: 'INC-2026-031', status: 'detected', zone: 'Chennai–Ennore', zone_id: 'z-che', detected_at: '2026-09-04T00:40:00Z', area_km2: 0.7, confidence: 0.77, engine: 'unet', centroid: [80.42, 13.2], top_tier: null, top_vessel: null, assigned_to: null, is_demo: true },
  { id: 'inc-030', code: 'INC-2026-030', status: 'closed', zone: 'Chennai–Ennore', zone_id: 'z-che', detected_at: '2026-08-18T00:35:00Z', area_km2: 1.1, confidence: 0.6, engine: 'heuristic', centroid: [80.45, 13.25], top_tier: 'poi', top_vessel: 'MV CORO STAR', assigned_to: 'Lt. A. Menon', is_demo: true },
]

export const SECTORS: SectorSummary[] = [
  { id: 'z-guj', name: 'Gujarat Offshore Lane', region: 'North-West', center: [69.4, 21.15], bbox: [68.6, 20.4, 70.2, 21.9], pending: 1, open_incidents: 1, last_scene_at: ACQ, vessels_now: 61 },
  { id: 'z-mum', name: 'Mumbai Approaches', region: 'West', center: [72.65, 18.85], bbox: [72.2, 18.4, 73.1, 19.3], pending: 1, open_incidents: 0, last_scene_at: '2026-09-04T01:05:00Z', vessels_now: 58 },
  { id: 'z-che', name: 'Chennai–Ennore', region: 'East', center: [80.55, 13.2], bbox: [80.2, 12.8, 80.9, 13.6], pending: 1, open_incidents: 1, last_scene_at: '2026-09-05T00:31:00Z', vessels_now: 24 },
]

export const SECTOR_DETECTIONS: Record<string, SectorDetection[]> = {
  'z-guj': [{ id: 'det-pending-kut-04', created_at: '2026-09-05T03:00:00Z', engine: 'unet', confidence: 0, area_km2: 0, centroid: null, bbox: [68.90, 22.40, 69.15, 22.60], has_spill: false, verified: false, verification: null, sample_id: 'kut-04', scene: 'S1A_IW_GRDH 5C11 · tile 1' }],
  'z-mum': [{ id: 'det-pending-mum-02', created_at: '2026-08-29T03:05:00Z', engine: 'unet', confidence: 0.835, area_km2: 2.10, centroid: [72.61, 18.84], bbox: [72.50, 18.75, 72.75, 18.95], has_spill: true, verified: false, verification: null, sample_id: 'mum-02', scene: 'S1A_IW_GRDH 4F91 · tile 7' }],
  'z-che': [{ id: 'det-pending-che-03', created_at: '2026-08-24T02:31:00Z', engine: 'unet', confidence: 0.826, area_km2: 0.58, centroid: [80.42, 13.21], bbox: [80.30, 13.10, 80.55, 13.30], has_spill: true, verified: false, verification: null, sample_id: 'che-03', scene: 'S1A_IW_GRDH 3B27 · tile 2' }],
}

export const INCIDENT_DETAIL: IncidentDetail = {
  ...INCIDENTS[0],
  scene: 'S1A_IW_GRDH_1SDV_20260906T011203_20260906T011228_060412_078A1C_5D2E',
  polygon: SLICK_POLYGON,
  heading_deg: 42,
  origin_zones: ORIGIN_ZONES,
  drift_inputs: { wind_kn: 14.2, wind_dir_deg: 225, current_kn: 0.6, current_dir_deg: 40, source: 'Open-Meteo Marine + Forecast, hourly, 2026-09-05T00Z to 2026-09-06T02Z' },
  ranking: RANKING,
  events: [
    { at: '2026-09-06T04:02:00Z', who: 'system', type: 'detected', text: 'Slick detected by U-Net on tile 3 of scene 5D2E. Confidence 0.91.' },
    { at: '2026-09-06T05:41:00Z', who: 'Lt. A. Menon', type: 'status', text: 'Opened investigation. Drift and ranking computed.' },
    { at: '2026-09-06T06:10:00Z', who: 'Lt. A. Menon', type: 'note', text: 'Tanker gap coincides with t-12h zone. Requesting AIS static data from Kandla VTS.' },
  ],
  hashes: { tile_sha256: '9f2c1e7a44b0d3e1c5a8f6b2d9e0c7a1b3f4d5e6a7b8c9d0e1f2a3b4c5d6e7f8', mask_sha256: '4b1d9e0c7a1b3f4d5e6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e' },
}

export const OVERVIEW: Overview = {
  open_incidents: 2,
  slicks_this_month: 5,
  area_km2_this_month: 11.74,
  vessels_tracked: 143,
  zones: [
    { id: 'z-guj', name: 'Gujarat Offshore Lane', last_scene_at: ACQ, vessels_now: 61 },
    { id: 'z-mum', name: 'Mumbai Approaches', last_scene_at: '2026-09-04T01:05:00Z', vessels_now: 58 },
    { id: 'z-che', name: 'Chennai–Ennore', last_scene_at: '2026-09-05T00:31:00Z', vessels_now: 24 },
  ],
  recent: [
    { id: 'a1', at: '2026-09-07T05:40:00Z', who: 'Lt. A. Menon', what: 'signed in' },
    { id: 'a2', at: '2026-09-06T06:10:00Z', who: 'Lt. A. Menon', what: 'added a note on INC-2026-041' },
    { id: 'a3', at: '2026-09-06T05:41:00Z', who: 'Lt. A. Menon', what: 'opened investigation INC-2026-041' },
    { id: 'a4', at: '2026-09-06T04:02:00Z', who: 'system', what: 'detected 4.21 km² slick in Gujarat Offshore Lane' },
    { id: 'a5', at: '2026-09-05T02:15:00Z', who: 'system', what: 'processed scene 5C11 over Chennai–Ennore, no slick' },
  ],
  trend: Array.from({ length: 14 }, (_, i) => {
    const d = new Date('2026-08-25T00:00:00Z'); d.setUTCDate(d.getUTCDate() + i)
    return { day: d.toISOString().slice(5, 10), slicks: [0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1][i] }
  }),
}

export const VESSELS: Vessel[] = RANKING.map((r, i) => ({
  mmsi: r.mmsi,
  imo: r.type_group === 'fishing' ? null : String(9_300_000 + i * 1571),
  name: r.name,
  type_group: r.type_group,
  flag: r.flag,
  length_m: r.type_group === 'fishing' ? 18 : r.type_group === 'tug' ? 32 : 180 + i * 11,
  destination: ['INMUN', 'INKDL', 'AEJEA', 'SGSIN', null, 'INPBD', 'INOKH', null][i] ?? null,
  sog_kn: r.behaviour === 'anchored' ? 0 : r.behaviour === 'loitering' ? 1.3 : 11 + i,
  cog_deg: [41, 44, 318, 62, 262, 95, 70, 0][i] ?? 0,
  position: r.track[r.track.length - 1].p,
  last_seen: '2026-09-07T05:58:00Z',
}))

export const SAMPLES: DetectSample[] = [
  { id: 'guj-01', label: 'Gujarat lane, 6 Sep 01:12Z', scene: 'S1A_IW_GRDH 5D2E · tile 3', acquired_at: ACQ, bbox: [69.30, 20.95, 69.55, 21.15], image_url: '/sar/guj-01.png' },
  { id: 'mum-02', label: 'Mumbai approaches, 29 Aug', scene: 'S1A_IW_GRDH 4F91 · tile 7', acquired_at: '2026-08-29T01:05:00Z', bbox: [72.50, 18.75, 72.75, 18.95], image_url: '/sar/mum-02.png' },
  { id: 'che-03', label: 'Chennai–Ennore, 24 Aug', scene: 'S1A_IW_GRDH 3B27 · tile 2', acquired_at: '2026-08-24T00:31:00Z', bbox: [80.30, 13.10, 80.55, 13.30], image_url: '/sar/che-03.png' },
  { id: 'kut-04', label: 'Gulf of Kutch, clean sea', scene: 'S1A_IW_GRDH 5C11 · tile 1', acquired_at: '2026-09-05T01:00:00Z', bbox: [68.90, 22.40, 69.15, 22.60], image_url: '/sar/kut-04.png' },
]

export const DETECT_RESULTS: Record<string, DetectResult> = {
  'guj-01': { detection_id: 'det-guj-01', engine: 'unet', confidence: 0.91, area_km2: 4.21, centroid: SLICK_CENTROID, polygon: SLICK_POLYGON, heading_deg: 42, mask_png: null, class_pixels: { sea: 58120, oil: 4870, lookalike: 1210, ship: 96, land: 1240 }, inference_ms: 412 },
  'mum-02': { detection_id: 'det-mum-02', engine: 'heuristic', confidence: 0.64, area_km2: 1.37, centroid: [72.61, 18.84], polygon: [[72.60, 18.85], [72.625, 18.852], [72.63, 18.838], [72.615, 18.83], [72.60, 18.85]], heading_deg: 110, mask_png: null, class_pixels: { sea: 63900, oil: 1580, lookalike: 0, ship: 0, land: 56 }, inference_ms: 88 },
  'che-03': { detection_id: 'det-che-03', engine: 'unet', confidence: 0.77, area_km2: 0.58, centroid: [80.42, 13.21], polygon: [[80.415, 13.215], [80.428, 13.217], [80.43, 13.206], [80.418, 13.203], [80.415, 13.215]], heading_deg: 75, mask_png: null, class_pixels: { sea: 61200, oil: 670, lookalike: 2900, ship: 40, land: 726 }, inference_ms: 397 },
  'kut-04': { detection_id: 'det-kut-04', engine: 'unet', confidence: 0, area_km2: 0, centroid: [69.025, 22.5], polygon: [], heading_deg: 0, mask_png: null, class_pixels: { sea: 64890, oil: 0, lookalike: 310, ship: 22, land: 314 }, inference_ms: 405 },
}

export const REPORTS: Report[] = [
  { id: 'rep-2', incident_code: 'INC-2026-041', generated_by: 'Lt. A. Menon', generated_at: '2026-09-06T06:32:00Z', pages: 6 },
  { id: 'rep-1', incident_code: 'INC-2026-040', generated_by: 'Lt. A. Menon', generated_at: '2026-08-30T10:04:00Z', pages: 5 },
]

export const AUDIT: AuditEntry[] = [
  { id: 'l1', at: '2026-09-07T05:40:00Z', who: 'officer@sagarnetra.in', action: 'login', target: '-' },
  { id: 'l2', at: '2026-09-06T06:32:00Z', who: 'officer@sagarnetra.in', action: 'report.export', target: 'INC-2026-041' },
  { id: 'l3', at: '2026-09-06T06:10:00Z', who: 'officer@sagarnetra.in', action: 'incident.note', target: 'INC-2026-041' },
  { id: 'l4', at: '2026-09-06T05:41:00Z', who: 'officer@sagarnetra.in', action: 'incident.create', target: 'det-guj-01' },
  { id: 'l5', at: '2026-09-06T05:39:00Z', who: 'officer@sagarnetra.in', action: 'detect.run', target: 'guj-01' },
  { id: 'l6', at: '2026-09-02T11:30:00Z', who: 'admin@sagarnetra.in', action: 'user.create', target: 's.rao@sagarnetra.in' },
]

export const HEALTH: Health = { status: 'ok', database: 'mock', model: 'unet', ais_collector: 'mock', version: '0.1.0-mock' }
