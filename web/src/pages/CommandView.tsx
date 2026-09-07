import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router'
import createGlobe from 'cobe'
import { AnimatePresence, motion } from 'motion/react'
import { AlertTriangle, ArrowLeft, ArrowUpRight, ScanSearch, Waves } from 'lucide-react'
import { api } from '../lib/api'
import { cn } from '../lib/cn'
import { fmtKm2 } from '../lib/format'
import { Empty, PageHeader, Panel, Spinner, StatusChip, TierChip } from '../components/Primitives'
import RealMap, { type MapPoint } from '../components/RealMap'
import type { LonLat, SectorSummary } from '../lib/types'

// Same dotted-globe language as the Dashboard's SpillGlobe, tuned for sectors: click one and the sphere flies to it
// and magnifies (cobe's own `scale`), while the review queue slides in beside it. cobe has no close-up imagery — the
// "satellite cases" are the detection cards on the right, and the console/incident links are the coordinate-accurate view.

const HOT: [number, number, number] = [1, 0.408, 0.012]
const CALM: [number, number, number] = [0.12, 0.42, 0.46]
const SPIN = 0.0022
const TAU = Math.PI * 2
const SELECT_ZOOM = 2.1

function unitVec(lat: number, lon: number) {
  const latR = (lat * Math.PI) / 180
  const lonR = (lon * Math.PI) / 180 - Math.PI
  const c = Math.cos(latR)
  return { x: -c * Math.cos(lonR), y: Math.sin(latR), z: c * Math.sin(lonR) }
}
function depthOf(lat: number, lon: number, phi: number, theta: number) {
  const { x, y, z } = unitVec(lat, lon)
  const sp = Math.sin(phi), cp = Math.cos(phi), st = Math.sin(theta), ct = Math.cos(theta)
  return -sp * ct * x + st * y + cp * ct * z
}
function orientationFor(lat: number, lon: number) {
  const { x, y, z } = unitVec(lat, lon)
  const phi = Math.atan2(-x, z)
  const r = -Math.sin(phi) * x + Math.cos(phi) * z
  return { phi, theta: Math.atan2(y, r) }
}
function shortestDelta(from: number, to: number) {
  let d = (to - from) % TAU
  if (d > Math.PI) d -= TAU
  if (d < -Math.PI) d += TAU
  return d
}
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

function SectorGlobe({ sectors, selectedId, onSelect }: {
  sectors: SectorSummary[]; selectedId: string | null; onSelect: (id: string | null) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const anchors = useRef(new Map<string, HTMLElement>())
  const dots = useRef(new Map<string, HTMLButtonElement>())
  const phiRef = useRef(3.9)
  const thetaRef = useRef(0.32)
  const spinRef = useRef(true)
  const dragRef = useRef<{ x: number; y: number; phi: number; theta: number } | null>(null)
  const flightRef = useRef<{ p0: number; t0: number; dp: number; dt: number; start: number } | null>(null)
  const zoomRef = useRef(1)
  const zoomTargetRef = useRef(1)
  const [ready, setReady] = useState(false)

  const placed = useMemo(() => sectors.filter((s) => Array.isArray(s.center) && s.center.length === 2), [sectors])

  // Fly + zoom to the selected sector; reset when cleared.
  useEffect(() => {
    const s = placed.find((x) => x.id === selectedId)
    if (!s || !s.center) { spinRef.current = true; zoomTargetRef.current = 1; return }
    const [lon, lat] = s.center
    const target = orientationFor(lat, lon)
    spinRef.current = false
    zoomTargetRef.current = SELECT_ZOOM
    flightRef.current = {
      p0: phiRef.current, t0: thetaRef.current,
      dp: shortestDelta(phiRef.current, target.phi), dt: target.theta - thetaRef.current,
      start: performance.now(),
    }
  }, [selectedId, placed])

  const markers = useMemo(
    () => placed.map((s) => ({ id: s.id, location: [s.center![1], s.center![0]] as [number, number], size: 0.06, color: s.pending > 0 ? HOT : CALM })),
    [placed],
  )
  const dataRef = useRef({ placed, markers })
  useEffect(() => { dataRef.current = { placed, markers } }, [placed, markers])
  const sig = useMemo(() => markers.map((m) => `${m.id},${m.location.join(',')},${m.color.join('/')}`).join('|'), [markers])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let raf = 0
    let disposed = false
    const globe = createGlobe(canvas, {
      devicePixelRatio: Math.min(window.devicePixelRatio || 1, 2),
      width: 1000, height: 1000, phi: phiRef.current, theta: thetaRef.current, scale: zoomRef.current,
      dark: 1, diffuse: 1.15, mapSamples: 22000, mapBrightness: 5.2,
      baseColor: [0.16, 0.13, 0.11], markerColor: [1, 0.408, 0.012], glowColor: [0.09, 0.06, 0.04],
      markerElevation: 0, markers: dataRef.current.markers,
    })
    const findAnchors = () => {
      const wrap = canvas.parentElement
      if (!wrap) return
      const next = new Map<string, HTMLElement>()
      wrap.querySelectorAll<HTMLElement>('div[style*="anchor-name"]').forEach((el) => {
        const m = /--cobe-((?!arc-)[A-Za-z0-9_-]+)/.exec(el.getAttribute('style') ?? '')
        if (m) next.set(m[1], el)
      })
      anchors.current = next
    }
    const frame = (now: number) => {
      if (disposed) return
      const flight = flightRef.current
      if (flight) {
        const k = Math.min(1, (now - flight.start) / 900)
        const e = easeInOut(k)
        phiRef.current = flight.p0 + flight.dp * e
        thetaRef.current = flight.t0 + flight.dt * e
        if (k >= 1) flightRef.current = null
      } else if (!dragRef.current && spinRef.current) {
        phiRef.current += SPIN
      }
      zoomRef.current += (zoomTargetRef.current - zoomRef.current) * 0.14
      globe.update({ phi: phiRef.current, theta: thetaRef.current, scale: zoomRef.current })
      if (anchors.current.size === 0) findAnchors()
      for (const s of dataRef.current.placed) {
        const dot = dots.current.get(s.id)
        const a = anchors.current.get(s.id)
        if (!dot || !a || !s.center) continue
        const [lon, lat] = s.center
        const z = depthOf(lat, lon, phiRef.current, thetaRef.current)
        const front = z > 0
        dot.style.left = a.style.left
        dot.style.top = a.style.top
        dot.style.opacity = String(front ? clamp(0.3 + z * 1.15, 0, 1) : 0)
        dot.style.transform = `translate(-50%, -50%) scale(${front ? 0.72 + z * 0.42 : 0.55})`
        dot.style.pointerEvents = front && z > 0.1 ? 'auto' : 'none'
        dot.style.zIndex = String(10 + Math.round(z * 40))
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    const t = window.setTimeout(() => setReady(true), 90)
    return () => {
      disposed = true
      window.clearTimeout(t)
      cancelAnimationFrame(raf)
      globe.destroy()
      anchors.current = new Map()
      const wrap = canvas.parentElement
      if (wrap && wrap.contains(canvas) && wrap.style.position === 'relative') {
        wrap.parentElement?.insertBefore(canvas, wrap)
        wrap.remove()
      }
    }
  }, [sig])

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    dragRef.current = { x: e.clientX, y: e.clientY, phi: phiRef.current, theta: thetaRef.current }
    flightRef.current = null
    e.currentTarget.style.cursor = 'grabbing'
  }, [])
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = dragRef.current
      if (!d) return
      const dx = (e.clientX - d.x) / 220
      phiRef.current = d.phi - dx
      thetaRef.current = clamp(d.theta + (e.clientY - d.y) / 380, -1.05, 1.05)
    }
    const up = () => { if (dragRef.current) { dragRef.current = null; const c = canvasRef.current; if (c) c.style.cursor = 'grab' } }
    window.addEventListener('pointermove', move, { passive: true })
    window.addEventListener('pointerup', up, { passive: true })
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
  }, [])

  return (
    <div className="relative aspect-square w-full select-none">
      <canvas ref={canvasRef} onPointerDown={onPointerDown} onDoubleClick={() => onSelect(null)} className="size-full"
        style={{ contain: 'layout paint size', cursor: 'grab', touchAction: 'none', opacity: ready ? 1 : 0, transition: 'opacity 900ms ease' }}
        aria-label={`Globe of ${placed.length} coastal sectors`} />
      <div className="pointer-events-none absolute inset-0">
        {placed.map((s) => {
          const hot = s.pending > 0
          const isSel = s.id === selectedId
          const hex = hot ? '#ff6803' : '#1e6b74'
          return (
            <button key={s.id} ref={(el) => { if (el) dots.current.set(s.id, el); else dots.current.delete(s.id) }}
              type="button" onClick={() => onSelect(isSel ? null : s.id)}
              className="absolute grid size-6 place-items-center rounded-full outline-none"
              style={{ left: '50%', top: '50%', opacity: 0, pointerEvents: 'none' }} aria-label={s.name} aria-pressed={isSel}>
              {hot && [0, 1].map((k) => (
                <motion.span key={k} className="absolute size-3 rounded-full" style={{ border: `1px solid ${hex}` }}
                  animate={{ scale: [1, isSel ? 3.4 : 2.5], opacity: [isSel ? 0.75 : 0.5, 0] }}
                  transition={{ duration: isSel ? 1.6 : 2.5, repeat: Infinity, ease: 'easeOut', delay: k * (isSel ? 0.8 : 1.25) }} />
              ))}
              {isSel && <motion.span layoutId="sector-ring" className="absolute size-5 rounded-full" style={{ border: `1.5px solid ${hex}`, boxShadow: `0 0 12px ${hex}66` }} />}
              <span className="relative rounded-full transition-all duration-200"
                style={{ width: isSel ? 9 : 7, height: isSel ? 9 : 7, background: hex, boxShadow: `0 0 ${isSel ? 14 : 7}px ${hex}`, outline: '1.5px solid #14100c' }} />
            </button>
          )
        })}
      </div>
      <div className="absolute right-2 top-2 flex items-center gap-1 rounded border border-line bg-surface/85 px-2 py-1 font-mono text-[10px] text-ink-3 backdrop-blur">
        {placed.length} sectors · drag to spin · click to zoom in
      </div>
    </div>
  )
}

export default function CommandView() {
  const navigate = useNavigate()
  const sectors = useQuery({ queryKey: ['sectors'], queryFn: api.sectors })
  const [selected, setSelected] = useState<string | null>(null)
  const detail = useQuery({ queryKey: ['sector', selected], queryFn: () => api.sector(selected as string), enabled: !!selected })
  const sel = sectors.data?.find((s) => s.id === selected) ?? null

  const mapPoints: MapPoint[] = (detail.data?.detections ?? [])
    .filter((d) => Array.isArray(d.centroid) && d.centroid.length === 2)
    .map((d) => ({
      id: d.id,
      position: d.centroid as LonLat,
      tone: d.has_spill ? 'spill' : 'clean',
      label: d.has_spill ? 'Possible slick' : 'Clean tile',
      onClick: () => navigate(d.sample_id ? `/app/detect?sample=${d.sample_id}` : '/app/detect'),
    }))
  // draw the confirmed incident's slick + drift ellipses on the sector map
  const overlay = detail.data?.incidents.find((i) => i.polygon && i.polygon.length > 2)

  return (
    <div className="p-6">
      <PageHeader eyebrow="Command" title="Coastal watch"
        description="Every sector we monitor. Select one to zoom into the real map and clear its detection queue — confirm the real slicks, dismiss the look-alikes." />

      <div className="grid gap-4 xl:grid-cols-[1fr_minmax(360px,420px)]">
        <Panel title={sel ? `${sel.name} — live map` : 'Where the sectors are'} bodyClassName={sel ? 'p-0' : 'grid place-items-center p-4'}>
          <AnimatePresence mode="wait" initial={false}>
            {sel ? (
              <motion.div key="map" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }} className="h-[560px] w-full">
                <RealMap className="size-full" focus={sel.bbox ?? undefined} points={mapPoints}
                  polygon={overlay?.polygon ?? []} zones={overlay?.origin_zones ?? []} />
              </motion.div>
            ) : (
              <motion.div key="globe" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }} className="w-full">
                {!sectors.data ? <Spinner label="Loading globe" /> : <SectorGlobe sectors={sectors.data} selectedId={selected} onSelect={setSelected} />}
              </motion.div>
            )}
          </AnimatePresence>
        </Panel>

        <Panel title={sel ? sel.name : 'Sectors'} bodyClassName="p-0"
          actions={sel && <button onClick={() => setSelected(null)} className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs text-ink-2 hover:text-ink"><ArrowLeft className="size-3.5" />All sectors</button>}>
          <AnimatePresence mode="wait" initial={false}>
            {!sel ? (
              <motion.ul key="list" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.22 }} className="divide-y divide-line">
                {(sectors.data ?? []).map((s) => (
                  <li key={s.id}>
                    <button onClick={() => setSelected(s.id)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-surface-2/60">
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{s.name}</span>
                        <span className="block font-mono text-[11px] text-ink-3">{s.region ?? '—'} · {s.vessels_now} ships · {s.open_incidents} open</span>
                      </span>
                      {s.pending > 0
                        ? <span className="shrink-0 rounded bg-accent px-2 py-0.5 font-mono text-[11px] font-semibold text-white">{s.pending} pending</span>
                        : <span className="shrink-0 font-mono text-[11px] text-ok">clear</span>}
                    </button>
                  </li>
                ))}
              </motion.ul>
            ) : (
              <motion.div key={sel.id} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }} transition={{ duration: 0.22 }} className="flex max-h-[70vh] flex-col overflow-auto">
                {!detail.data ? <div className="p-4"><Spinner /></div> : (
                  <div className="p-4">
                    <div className="label-caps mb-2">Detections to review</div>
                    {detail.data.detections.length === 0 ? (
                      <div className="rounded-md border border-line px-3 py-2 text-sm text-ink-2">Sector clear — nothing awaiting review.</div>
                    ) : (
                      <ul className="space-y-2">
                        {detail.data.detections.map((d) => (
                          <li key={d.id}>
                            <button onClick={() => navigate(d.sample_id ? `/app/detect?sample=${d.sample_id}` : '/app/detect')}
                              className="flex w-full items-center gap-3 rounded-md border border-line bg-surface px-3 py-2 text-left transition-colors hover:border-accent/60 hover:bg-surface-2/60">
                              <span className={cn('grid size-9 shrink-0 place-items-center rounded', d.has_spill ? 'bg-crit/10 text-crit' : 'bg-surface-3 text-ink-3')}>
                                {d.has_spill ? <AlertTriangle className="size-4" /> : <Waves className="size-4" />}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="flex items-center gap-2 text-sm font-medium">
                                  {d.has_spill ? 'Possible slick' : 'Clean tile'}
                                  {d.verified ? <span className="font-mono text-[10px] uppercase text-ok">reviewed</span> : <span className="font-mono text-[10px] uppercase text-accent">pending</span>}
                                </span>
                                <span className="block truncate font-mono text-[11px] text-ink-3">{d.scene ?? d.id}</span>
                              </span>
                              <span className="shrink-0 text-right">
                                <span className="block font-mono text-sm tnum">{Math.round(d.confidence * 100)}%</span>
                                {d.has_spill && <span className="block font-mono text-[11px] text-ink-3">{fmtKm2(d.area_km2)}</span>}
                              </span>
                              <ArrowUpRight className="size-4 shrink-0 text-ink-3" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}

                    <div className="label-caps mb-2 mt-4">Incidents in sector</div>
                    {detail.data.incidents.length === 0 ? (
                      <div className="text-sm text-ink-3">No incidents opened here yet.</div>
                    ) : (
                      <ul className="space-y-1.5">
                        {detail.data.incidents.map((i) => (
                          <li key={i.id}>
                            <Link to={`/app/incidents/${i.id}`} className="flex items-center justify-between gap-2 rounded-md border border-line px-3 py-2 hover:border-accent/60 hover:bg-surface-2/60">
                              <span className="font-mono text-xs text-sea">{i.code}</span>
                              <span className="flex items-center gap-2">{i.top_tier && <TierChip tier={i.top_tier} compact />}<StatusChip status={i.status} /></span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}

                    <button onClick={() => navigate('/app/detect')} className="mt-4 flex w-full items-center justify-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white hover:bg-accent-deep">
                      <ScanSearch className="size-4" />Open detection console
                    </button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
          {sectors.isError && <div className="p-4"><Empty title="Could not load sectors" /></div>}
        </Panel>
      </div>
    </div>
  )
}
