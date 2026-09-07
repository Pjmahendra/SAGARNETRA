import {
  AUDIT, DETECT_RESULTS, HEALTH, INCIDENTS, INCIDENT_DETAIL, OVERVIEW, REPORTS, SAMPLES,
  SECTOR_DETECTIONS, SECTORS, USERS, VESSELS, publicUser,
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
  if (key === 'GET /api/detect/model') return { engine: 'unet', model_name: 'unet_sar (mock)', metrics: [
    { name: 'Custom U-Net', miou: 0.641, iou: { sea: 0.96, oil: 0.55, lookalike: 0.42, ship: 0.61, land: 0.92 }, params_m: 7.8, cpu_ms: 410 },
    { name: 'U-Net + ResNet-34', miou: 0.672, iou: { sea: 0.97, oil: 0.59, lookalike: 0.47, ship: 0.66, land: 0.93 }, params_m: 24.4, cpu_ms: 620 },
    { name: 'DeepLabV3+ R50', miou: 0.681, iou: { sea: 0.97, oil: 0.61, lookalike: 0.49, ship: 0.64, land: 0.94 }, params_m: 40.3, cpu_ms: 1150 },
  ] } as T
  if (key === 'GET /api/reports') return REPORTS as T

  const sm = path.match(/^\/api\/sectors\/([^/]+)$/)
  if (sm && method === 'GET') {
    const s = SECTORS.find((x) => x.id === sm[1])
    if (!s) throw new MockError(404, 'Sector not found')
    return {
      sector: { id: s.id, name: s.name, region: s.region, center: s.center, bbox: s.bbox },
      detections: SECTOR_DETECTIONS[s.id] ?? [],
      incidents: INCIDENTS.filter((i) => i.zone_id === s.id),
    } as T
  }
  let m = path.match(/^\/api\/incidents\/([^/]+)$/)
  if (m && method === 'GET') {
    if (m[1] === INCIDENT_DETAIL.id) return INCIDENT_DETAIL as T
    const inc = INCIDENTS.find((i) => i.id === m![1])
    if (!inc) throw new MockError(404, 'Incident not found')
    return { ...INCIDENT_DETAIL, ...inc, ranking: [], events: [], origin_zones: [], polygon: [] } as T
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
