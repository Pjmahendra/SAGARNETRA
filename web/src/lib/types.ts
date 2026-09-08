export type Role = 'admin' | 'officer'

export interface User {
  id: string
  email: string
  name: string
  role: Role
  org: string
  region?: string | null
  zone_ids?: string[]
}

export interface LoginResponse {
  access_token: string
  user: User
}

export type IncidentStatus = 'detected' | 'investigating' | 'inspection_requested' | 'closed'
export type Tier = 'prime' | 'poi' | 'cleared'
export type Engine = 'unet' | 'heuristic'
export type VesselType = 'tanker' | 'cargo' | 'fishing' | 'passenger' | 'tug' | 'other'
export type Behaviour = 'transiting' | 'loitering' | 'anchored' | 'dark'

/** [lon, lat] */
export type LonLat = [number, number]

export interface ZoneStatus {
  id: string
  name: string
  /** Present on the admin endpoint; the officer overview omits it. */
  region?: Region | null
  last_scene_at: string | null
  vessels_now: number
}

/** The five Indian Coast Guard regions, plus the European liaison sector. */
export type Region = 'West' | 'North-West' | 'East' | 'North-East' | 'A&N' | 'Europe'

export interface ActivityItem {
  id: string
  at: string
  who: string
  what: string
}

export interface Overview {
  open_incidents: number
  slicks_this_month: number
  area_km2_this_month: number
  vessels_tracked: number
  zones: ZoneStatus[]
  recent: ActivityItem[]
  trend: { day: string; slicks: number }[]
}

export interface Incident {
  id: string
  code: string
  status: IncidentStatus
  zone: string
  zone_id?: string | null
  detected_at: string
  area_km2: number
  confidence: number
  engine: Engine
  centroid: LonLat
  top_tier: Tier | null
  top_vessel: string | null
  assigned_to: string | null
  is_demo: boolean
  // present on sector-detail incidents so the command map can draw them
  polygon?: LonLat[]
  origin_zones?: OriginZone[]
}

export interface FeatureContribution {
  key: string
  label: string
  raw: string
  normalised: number
  weight: number
  contribution: number
}

export interface RankingRow {
  mmsi: string
  name: string
  type_group: VesselType
  flag: string
  behaviour: Behaviour
  score: number
  tier: Tier
  features: FeatureContribution[]
  track: { t: string; p: LonLat; gap?: boolean }[]
}

export interface OriginZone {
  hours_before: number
  center: LonLat
  semi_major_km: number
  semi_minor_km: number
  bearing_deg: number
}

export interface IncidentEvent {
  at: string
  who: string
  type: string
  text: string
  mmsi?: string | null
}

export interface IncidentDetail extends Incident {
  scene: string
  polygon: LonLat[]
  heading_deg: number
  origin_zones: OriginZone[]
  drift_inputs: {
    wind_kn: number
    wind_dir_deg: number
    current_kn: number
    current_dir_deg: number
    source: string
    weather_source?: 'open-meteo' | 'fallback'
    leeway?: number
  }
  candidates_considered?: number
  ranking: RankingRow[]
  events: IncidentEvent[]
  hashes: { tile_sha256: string; mask_sha256: string }
}

export interface SectorSummary {
  id: string
  name: string
  region: string | null
  center: LonLat | null
  bbox: [number, number, number, number] | null
  pending: number
  open_incidents: number
  last_scene_at: string | null
  vessels_now: number
}

export interface SectorDetection {
  id: string
  created_at: string
  engine: Engine
  confidence: number
  area_km2: number
  centroid: LonLat | null
  bbox: [number, number, number, number] | null
  has_spill: boolean
  verified: boolean
  verification: { decision: string; reason?: string | null; note?: string } | null
  incident_id?: string | null
  scene?: string | null
  sample_id?: string | null
}

export interface SectorDetail {
  sector: { id: string; name: string; region: string | null; center: LonLat | null; bbox: [number, number, number, number] | null }
  detections: SectorDetection[]
  incidents: Incident[]
}

export interface Vessel {
  mmsi: string
  imo: string | null
  name: string
  type_group: VesselType
  flag: string
  length_m: number | null
  destination: string | null
  sog_kn: number
  cog_deg: number
  position: LonLat
  last_seen: string
  /** "live" is a real AIS report recorded from AISStream. Absent means seeded scenario data. */
  source?: 'live' | 'scenario' | null
}

export interface DetectSample {
  id: string
  /** Sector the tile's footprint falls in. Absent means it sits outside every watch zone. */
  zone_id?: string | null
  label: string
  scene: string
  acquired_at: string
  /** [west, south, east, north] */
  bbox: [number, number, number, number]
  image_url: string
  synthetic?: boolean
  available?: boolean
}

export interface DetectResult {
  detection_id: string
  engine: Engine
  confidence: number
  area_km2: number
  centroid: LonLat
  polygon: LonLat[]
  heading_deg: number
  mask_png: string | null
  class_pixels: Record<string, number>
  inference_ms: number
  elongation?: number
  model_name?: string | null
  has_spill?: boolean
}

export type VerifyDecision = 'confirmed' | 'lookalike' | 'uncertain'
export type LookalikeReason = 'wind_shadow' | 'algal_bloom' | 'rain_cell' | 'low_wind' | 'other'

export interface ModelInfo {
  engine: Engine
  model_name: string | null
  metrics: { name: string; display?: string; miou?: number; iou?: Record<string, number>; params_m?: number; cpu_ms?: number; status?: string }[]
}

/** The incident's numbers frozen at the moment of export. Never re-read from the live incident. */
export interface ReportSnapshot {
  zone: string
  detected_at: string
  area_km2: number
  confidence: number
  engine: Engine
  scene: string
  centroid: LonLat
  status: IncidentStatus
  is_demo: boolean
  ranked_count: number
  candidates_considered: number | null
  top_vessel: string | null
  top_mmsi: string | null
  top_score: number | null
  top_tier: Tier | null
  weather_source?: string | null
  hashes: { tile_sha256?: string; mask_sha256?: string }
}

export interface Report {
  id: string
  incident_id: string
  incident_code: string
  revision: number
  generated_by: string
  generated_at: string
  snapshot: ReportSnapshot
}

export interface AdminUser extends User {
  active: boolean
  created_at: string
  last_login: string | null
}

export interface AuditEntry {
  id: string
  at: string
  who: string
  action: string
  target: string
}

export interface Health {
  status: 'ok' | 'degraded'
  database: 'connected' | 'disconnected' | 'mock'
  model: Engine | 'missing'
  ais_collector: 'running' | 'stopped' | 'mock'
  version: string
}
