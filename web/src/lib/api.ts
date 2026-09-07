import type {
  AdminUser, AuditEntry, DetectResult, DetectSample, Health, Incident, IncidentDetail, IncidentStatus, LoginResponse, LookalikeReason,
  ModelInfo, Overview, Report, SectorDetail, SectorSummary, User, VerifyDecision, Vessel, ZoneStatus,
} from './types'
import { MockError, mockHandle } from './mock/handlers'

const raw = (import.meta.env.VITE_API_BASE as string | undefined) ?? ''
export const API_BASE = raw.replace(/\/$/, '')
export const MOCK_MODE = API_BASE === ''

const TOKEN_KEY = 'sagarnetra.token'
export const tokenStore = {
  get(): string | null {
    try { return localStorage.getItem(TOKEN_KEY) } catch { return null }
  },
  set(t: string) {
    try { localStorage.setItem(TOKEN_KEY, t) } catch { /* ignore */ }
  },
  clear() {
    try { localStorage.removeItem(TOKEN_KEY) } catch { /* ignore */ }
  },
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export const UNAUTHORIZED_EVENT = 'sagarnetra:unauthorized'

/** Turn an API-relative asset path ("/api/...") into an absolute URL; leave other paths alone. */
export const assetUrl = (path: string) => (path.startsWith('/api/') ? `${API_BASE}${path}` : path)

async function request<T>(method: string, path: string, body?: unknown, form?: FormData): Promise<T> {
  if (MOCK_MODE) {
    try {
      return await mockHandle<T>(method, path, body)
    } catch (e) {
      if (e instanceof MockError) {
        if (e.status === 401) { tokenStore.clear(); window.dispatchEvent(new Event(UNAUTHORIZED_EVENT)) }
        throw new ApiError(e.status, e.message)
      }
      throw e
    }
  }
  const headers: Record<string, string> = {}
  const token = tokenStore.get()
  if (token) headers.Authorization = `Bearer ${token}`
  let payload: BodyInit | undefined
  if (form) payload = form
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body) }

  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, { method, headers, body: payload })
  } catch {
    throw new ApiError(0, 'Cannot reach the API. Check your connection.')
  }
  if (res.status === 401) { tokenStore.clear(); window.dispatchEvent(new Event(UNAUTHORIZED_EVENT)) }
  if (!res.ok) {
    let msg = res.statusText || `Request failed (${res.status})`
    try { const j = (await res.json()) as { detail?: unknown }; if (typeof j.detail === 'string') msg = j.detail } catch { /* no body */ }
    throw new ApiError(res.status, msg)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export const api = {
  login: (email: string, password: string) => request<LoginResponse>('POST', '/api/auth/login', { email, password }),
  logout: () => request<void>('POST', '/api/auth/logout'),
  me: () => request<User>('GET', '/api/auth/me'),
  health: () => request<Health>('GET', '/api/health'),
  overview: () => request<Overview>('GET', '/api/overview'),
  sectors: () => request<SectorSummary[]>('GET', '/api/sectors'),
  sector: (id: string) => request<SectorDetail>('GET', `/api/sectors/${id}`),
  incidents: () => request<Incident[]>('GET', '/api/incidents'),
  incident: (id: string) => request<IncidentDetail>('GET', `/api/incidents/${id}`),
  createIncident: (detectionId: string) => request<Incident>('POST', '/api/incidents', { detection_id: detectionId }),
  addIncidentEvent: (id: string, body: { type: 'note' | 'status' | 'inspection' | 'psc_request'; text?: string; status?: IncidentStatus; mmsi?: string }) =>
    request<IncidentDetail>('POST', `/api/incidents/${id}/events`, body),
  rerankIncident: (id: string) => request<IncidentDetail>('POST', `/api/incidents/${id}/rerank`),
  vesselsLive: () => request<Vessel[]>('GET', '/api/vessels/live'),
  vessel: (mmsi: string) => request<Vessel>('GET', `/api/vessels/${mmsi}`),
  detectSamples: () => request<DetectSample[]>('GET', '/api/detect/samples'),
  detectSample: (sampleId: string) => request<DetectResult>('POST', '/api/detect', { sample_id: sampleId }),
  detectUpload: (file: File, bbox?: [number, number, number, number]) => {
    const f = new FormData(); f.append('file', file); if (bbox) f.append('bbox', JSON.stringify(bbox))
    return request<DetectResult>('POST', '/api/detect', undefined, f)
  },
  verifyDetection: (id: string, decision: VerifyDecision, reason?: LookalikeReason, note?: string) =>
    request<unknown>('POST', `/api/detect/${id}/verify`, { decision, reason, note }),
  modelInfo: () => request<ModelInfo>('GET', '/api/detect/model'),
  reports: () => request<Report[]>('GET', '/api/reports'),
  adminUsers: () => request<AdminUser[]>('GET', '/api/admin/users'),
  adminAudit: () => request<AuditEntry[]>('GET', '/api/admin/audit'),
  adminZones: () => request<ZoneStatus[]>('GET', '/api/admin/zones'),
}
