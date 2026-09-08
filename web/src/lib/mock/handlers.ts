import {
  AUDIT, DETECT_RESULTS, HEALTH, INCIDENTS, INCIDENT_DETAIL, OVERVIEW, REPORTS, SAMPLES,
  SECTOR_DETECTIONS, SECTORS, USERS, VESSELS, publicUser, slickPolygon,
} from './data'

export class MockError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const TOKEN_KEY = 'sagarnetra.token'

function currentUser() {
  let token: string | null = null
  try { token = localStorage.getItem(TOKEN_KEY) } catch { /* storage unavailable */ }
  if (!token?.startsWith('mock.')) throw new MockError(401, 'Not authenticated')
  const u = USERS.find((x) => x.id === token.slice(5))
  if (!u) throw new MockError(401, 'Not authenticated')
  return u
}
const requireRole = (role: 'admin' | 'officer') => {
  const u = currentUser()
  if (role === 'admin' && u.role !== 'admin') throw new MockError(403, 'Admin role required')
  return u
}

export async function mockHandle<T>(method: string, path: string, body?: unknown): Promise<T> {
  await sleep(250 + Math.random() * 200)
  const b = (body ?? {}) as Record<string, unknown>
  const key = `${method} ${path.split('?')[0]}`

  if (key === 'POST /api/auth/login') {
    const u = USERS.find((x) => x.email === String(b.email).trim().toLowerCase())
    if (!u || u.password !== b.password) throw new MockError(401, 'Email or password is incorrect')
    if (!u.active) throw new MockError(403, 'This account is disabled. Contact your administrator.')
    return { access_token: `mock.${u.id}`, user: publicUser(u) } as T
  }
  if (key === 'GET /api/health') return HEALTH as T
  if (key === 'GET /api/auth/me') return publicUser(currentUser()) as T
  if (key === 'POST /api/auth/logout') return undefined as T

  requireRole('officer')
  if (key === 'GET /api/overview') return OVERVIEW as T
  if (key === 'GET /api/sectors') return SECTORS as T
  if (key === 'GET /api/incidents') return INCIDENTS as T
  if (key === 'GET /api/vessels/live') return VESSELS as T
  if (key === 'GET /api/detect/samples') return SAMPLES as T
  if (key === 'GET /api/detect/model') return { engine: 'unet', model_name: 'fpn_effb3', metrics: [
    { name: 'unet_scratch', display: 'U-Net (from scratch)', miou: 0.641, iou: { sea: 0.96, oil: 0.55, lookalike: 0.42, ship: 0.61, land: 0.92 }, params_m: 7.8, cpu_ms: 410 },
    { name: 'unet_resnet34', display: 'U-Net + ResNet-34', miou: 0.672, iou: { sea: 0.97, oil: 0.59, lookalike: 0.47, ship: 0.66, land: 0.93 }, params_m: 24.4, cpu_ms: 620 },
    { name: 'unetpp_resnet34', display: 'U-Net++ + ResNet-34', miou: 0.679, iou: { sea: 0.97, oil: 0.60, lookalike: 0.48, ship: 0.65, land: 0.94 }, params_m: 26.1, cpu_ms: 720 },
    { name: 'deeplabv3p_resnet50', display: 'DeepLabV3+ + ResNet-50', miou: 0.681, iou: { sea: 0.97, oil: 0.61, lookalike: 0.49, ship: 0.64, land: 0.94 }, params_m: 40.3, cpu_ms: 1150 },
    { name: 'fpn_effb3', display: 'FPN + EfficientNet-B3', miou: 0.686, iou: { sea: 0.97, oil: 0.62, lookalike: 0.50, ship: 0.67, land: 0.95 }, params_m: 17.6, cpu_ms: 540 },
  ], benchmarks: [
    { name: 'DeepLabV3+', miou: 0.65, source: 'Krestenitis et al. 2019, Remote Sensing — 5-class SAR benchmark', published: true },
    { name: 'U-Net', miou: null, source: 'Krestenitis et al. 2019, Remote Sensing', published: true },
    { name: 'LinkNet', miou: null, source: 'Krestenitis et al. 2019, Remote Sensing', published: true },
    { name: 'PSPNet', miou: null, source: 'Krestenitis et al. 2019, Remote Sensing', published: true },
    { name: 'ResNet-34 U-Net', miou: null, source: 'SkyTruth Cerulean (production; IoU not published)', published: true },
    { name: 'U-Net ResNet-34 (pretrained)', miou: 0.79, source: 'Pretrained checkpoint (Kaggle); expects 2-ch VV+VH SAR', published: true },
  ] } as T
  if (key === 'GET /api/reports') return REPORTS as T
  const rp = /^\/api\/reports\/([^/]+)$/.exec(path)
  if (rp && method === 'GET') {
    const r = REPORTS.find((x) => x.id === rp[1])
    if (!r) throw new MockError(404, 'Report not found')
    return r as T
  }
  if (key === 'POST /api/reports') {
    const incidentId = (body as { incident_id?: string } | undefined)?.incident_id
    if (incidentId !== INCIDENT_DETAIL.id) throw new MockError(404, 'Incident not found')
    const d = INCIDENT_DETAIL
    const created = {
      id: `rep-${REPORTS.length + 1}`, incident_id: d.id, incident_code: d.code,
      revision: REPORTS.filter((x) => x.incident_id === d.id).length + 1,
      generated_by: 'Lt. A. Menon', generated_at: new Date().toISOString(),
      snapshot: {
        zone: d.zone, detected_at: d.detected_at, area_km2: d.area_km2, confidence: d.confidence,
        engine: d.engine, scene: d.scene, centroid: d.centroid, status: d.status, is_demo: true,
        ranked_count: d.ranking.length, candidates_considered: d.candidates_considered ?? null,
        top_vessel: d.ranking[0]?.name ?? null, top_mmsi: d.ranking[0]?.mmsi ?? null,
        top_score: d.ranking[0]?.score ?? null, top_tier: d.ranking[0]?.tier ?? null,
        weather_source: d.drift_inputs.weather_source ?? null, hashes: d.hashes,
      },
    }
    REPORTS.unshift(created)
    return created as T
  }

  const sm = path.match(/^\/api\/sectors\/([^/]+)$/)
  if (sm && method === 'GET') {
    const s = SECTORS.find((x) => x.id === sm[1])
    if (!s) throw new MockError(404, 'Sector not found')
    return {
      sector: { id: s.id, name: s.name, region: s.region, center: s.center, bbox: s.bbox },
      detections: SECTOR_DETECTIONS[s.id] ?? [],
      incidents: INCIDENTS.filter((i) => i.zone_id === s.id).map((i) =>
        i.id === INCIDENT_DETAIL.id ? { ...i, polygon: INCIDENT_DETAIL.polygon, origin_zones: INCIDENT_DETAIL.origin_zones } : i),
    } as T
  }
  let m = path.match(/^\/api\/incidents\/([^/]+)$/)
  if (m && method === 'GET') {
    if (m[1] === INCIDENT_DETAIL.id) return INCIDENT_DETAIL as T
    const inc = INCIDENTS.find((i) => i.id === m![1])
    if (!inc) throw new MockError(404, 'Incident not found')
    // Same treatment as the API: a catalogue spill still gets an outline matching its area,
    // so it draws as a slick rather than a bare dot.
    const n = Number(inc.id.slice(-2)) || 0
    return {
      ...INCIDENT_DETAIL, ...inc, ranking: [], events: [], origin_zones: [],
      polygon: slickPolygon(inc.centroid, inc.area_km2, (n * 37) % 180, n % 7),
    } as T
  }
  m = path.match(/^\/api\/vessels\/(\d+)$/)
  if (m && method === 'GET') {
    const v = VESSELS.find((x) => x.mmsi === m![1])
    if (!v) throw new MockError(404, 'Vessel not found')
    return v as T
  }

  if (key === 'POST /api/detect') {
    await sleep(700)
    const id = typeof b.sample_id === 'string' ? b.sample_id : 'guj-01'
    const r = DETECT_RESULTS[id]
    if (!r) throw new MockError(404, 'Sample not found')
    return { ...r, has_spill: r.polygon.length > 2 } as T
  }
  if (/^POST \/api\/detect\/[^/]+\/verify$/.test(key)) return { ok: true, ...(b as object) } as T
  let em = path.match(/^\/api\/incidents\/([^/]+)\/events$/)
  if (em && method === 'POST') {
    const ev = b as { type: string; text?: string; status?: string; mmsi?: string }
    const status = ev.type === 'status' ? ev.status : ev.type === 'inspection' || ev.type === 'psc_request' ? 'inspection_requested' : INCIDENT_DETAIL.status
    INCIDENT_DETAIL.events = [...INCIDENT_DETAIL.events, { at: new Date().toISOString(), who: currentUser().name, type: ev.type, mmsi: ev.mmsi ?? null, text: ev.text || (ev.type === 'inspection' ? `Vessel ${ev.mmsi ?? ''} marked for inspection` : `Status changed to ${status}`) }]
    INCIDENT_DETAIL.status = status as typeof INCIDENT_DETAIL.status
    return INCIDENT_DETAIL as T
  }
  em = path.match(/^\/api\/incidents\/([^/]+)\/rerank$/)
  if (em && method === 'POST') return INCIDENT_DETAIL as T
  if (key === 'POST /api/incidents') {
    return INCIDENTS[0] as T
  }

  requireRole('admin')
  if (key === 'GET /api/admin/users') return USERS.map(({ password: _pw, ...u }) => u) as T
  if (key === 'GET /api/admin/audit') return AUDIT as T
  if (key === 'GET /api/admin/zones') return OVERVIEW.zones as T

  throw new MockError(404, `No mock for ${key}`)
}
