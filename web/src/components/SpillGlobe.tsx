import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import createGlobe from 'cobe'
import { motion } from 'motion/react'
import { Link } from 'react-router'
import { Anchor, ArrowUpRight, ZoomIn } from 'lucide-react'
import type { Incident, LonLat, Tier } from '../lib/types'

/**
 * Interactive globe of detected slicks.
 *
 * Marker screen positions come from cobe itself: for every marker given an `id`, cobe v2 appends a
 * 1px anchor div to the wrapper it puts around our canvas, carrying `left`/`top` as percentages.
 * Reading those is exact and needs no re-derivation of its projection. Front/back visibility is the
 * one thing cobe does not expose per frame, so we compute the camera-space z ourselves — that only
 * needs the sign, so it is calibration-free.
 *
 * Zoom is real, not a CSS trick: it drives cobe's own `scale` camera parameter every frame, so the
 * rendered sphere itself magnifies. What it cannot do is reveal actual satellite imagery close up —
 * cobe draws a fixed low-resolution world map on a sphere; it has no closer-in tiles to switch to,
 * the way Google Earth or Cesium does. Past a threshold zoom we hand off to the real thing instead
 * of pretending the globe has detail it doesn't: a link into the incident's own coordinate-accurate
 * plan view. Cesium is the tracked upgrade path for a true close-up reveal (see docs/DECISIONS.md).
 */

type TierKey = Tier | 'none'

const TIER: Record<TierKey, { rgb: [number, number, number]; hex: string; label: string }> = {
  prime: { rgb: [0.78, 0.19, 0.12], hex: '#c7301f', label: 'Prime suspect' },
  poi: { rgb: [0.68, 0.23, 0.01], hex: '#ae3a02', label: 'Person of interest' },
  cleared: { rgb: [0.12, 0.54, 0.33], hex: '#1f8a54', label: 'Cleared' },
  none: { rgb: [0.12, 0.42, 0.46], hex: '#1e6b74', label: 'Not ranked' },
}

const tierOf = (i: Incident): TierKey => i.top_tier ?? 'none'
const SPIN = 0.0022
const TAU = Math.PI * 2
const MIN_ZOOM = 1
const MAX_ZOOM = 4.5
const ZOOM_LINK_THRESHOLD = 2.2

/** cobe's lat/lon -> unit vector (mirrors its internal `U`). */
function unitVec(lat: number, lon: number) {
  const latR = (lat * Math.PI) / 180
  const lonR = (lon * Math.PI) / 180 - Math.PI
  const c = Math.cos(latR)
  return { x: -c * Math.cos(lonR), y: Math.sin(latR), z: c * Math.sin(lonR) }
}

/** Camera-space z for a point at the given globe orientation. > 0 means it faces the viewer. */
function depthOf(lat: number, lon: number, phi: number, theta: number) {
  const { x, y, z } = unitVec(lat, lon)
  const sp = Math.sin(phi), cp = Math.cos(phi)
  const st = Math.sin(theta), ct = Math.cos(theta)
  return -sp * ct * x + st * y + cp * ct * z
}

/** The (phi, theta) that brings a point to the centre of the disc, facing the viewer. */
function orientationFor(lat: number, lon: number) {
  const { x, y, z } = unitVec(lat, lon)
  const phi = Math.atan2(-x, z)
  const r = -Math.sin(phi) * x + Math.cos(phi) * z
  return { phi, theta: Math.atan2(y, r) }
}

/** Shortest signed angular distance, so a fly-to never takes the long way round. */
function shortestDelta(from: number, to: number) {
  let d = (to - from) % TAU
  if (d > Math.PI) d -= TAU
  if (d < -Math.PI) d += TAU
  return d
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const dist = (a: PointerEvent, b: PointerEvent) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)

export default function SpillGlobe({
  incidents,
  selectedId,
  onSelect,
  onZoomedIn,
  homeCenter,
  homeLabel,
  className,
}: {
  incidents: Incident[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  /** Fires once, when the auto zoom-in on `selectedId` reaches max — the cue to navigate on to that incident's investigation. */
  onZoomedIn?: (id: string) => void
  /** An officer's sector centre [lon, lat]: the globe opens here and holds, instead of free-spinning, and returns here on deselect. Omit for an unrestricted (admin) view. */
  homeCenter?: LonLat | null
  /** Zone name shown alongside homeCenter, so the officer sees which sector they're locked to. */
  homeLabel?: string
  className?: string
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const anchors = useRef(new Map<string, HTMLElement>())
  const dots = useRef(new Map<string, HTMLButtonElement>())

  // First paint already faces the officer's sector when one is given, so there's no visible
  // fly-in from some arbitrary default orientation on load.
  const initialOrientation = homeCenter ? orientationFor(homeCenter[1], homeCenter[0]) : { phi: 3.9, theta: 0.32 }
  const phiRef = useRef(initialOrientation.phi)
  const thetaRef = useRef(initialOrientation.theta)
  const spinRef = useRef(!homeCenter)
  const dragRef = useRef<{ x: number; y: number; phi: number; theta: number } | null>(null)
  const velRef = useRef(0)
  const flightRef = useRef<{ p0: number; t0: number; dp: number; dt: number; start: number } | null>(null)

  // Zoom: a target driven by wheel/pinch (or the auto zoom-in on selection), smoothly chased
  // each frame — steadier than snapping straight to noisy per-event wheel/touch deltas.
  const zoomRef = useRef(1)
  const zoomTargetRef = useRef(1)
  const pinchRef = useRef<{ pointers: Map<number, PointerEvent>; d0: number; z0: number } | null>(null)
  const [zoomedIn, setZoomedIn] = useState(false)
  // Guards onZoomedIn to firing once per selection, and lets the render-loop closure (set up
  // once per globe rebuild) read the latest selection/callback without being a rebuild trigger.
  const firedZoomForRef = useRef<string | null>(null)
  const liveRef = useRef({ selectedId, onZoomedIn })
  useEffect(() => {
    liveRef.current = { selectedId, onZoomedIn }
  }, [selectedId, onZoomedIn])

  const [hovered, setHovered] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )

  // Only markers we can actually place.
  const placed = useMemo(
    () => incidents.filter((i) => Array.isArray(i.centroid) && i.centroid.length === 2),
    [incidents],
  )
  const selectedInc = placed.find((i) => i.id === selectedId) ?? null

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setReduced(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  // Fly to the selected slick and ramp zoom all the way in — cinematic, and the cue that a
  // hand-off to the investigation page (fired from the render loop below, once zoom arrives)
  // is coming. Deselecting reverses both: zoom back out, and settle on the officer's sector
  // if they have one, or resume idle spin if this is the unrestricted (admin) view.
  useEffect(() => {
    firedZoomForRef.current = null
    if (!selectedId) {
      zoomTargetRef.current = 1
      if (homeCenter) {
        spinRef.current = false
        const [lon, lat] = homeCenter
        const target = orientationFor(lat, lon)
        if (reduced) {
          phiRef.current = target.phi
          thetaRef.current = target.theta
          flightRef.current = null
        } else {
          flightRef.current = {
            p0: phiRef.current,
            t0: thetaRef.current,
            dp: shortestDelta(phiRef.current, target.phi),
            dt: target.theta - thetaRef.current,
            start: performance.now(),
          }
        }
      } else {
        spinRef.current = true
      }
      return
    }
    const inc = placed.find((i) => i.id === selectedId)
    if (!inc) return
    const [lon, lat] = inc.centroid
    const target = orientationFor(lat, lon)
    spinRef.current = false
    zoomTargetRef.current = MAX_ZOOM
    if (reduced) {
      phiRef.current = target.phi
      thetaRef.current = target.theta
      flightRef.current = null
      zoomRef.current = MAX_ZOOM
      return
    }
    flightRef.current = {
      p0: phiRef.current,
      t0: thetaRef.current,
      dp: shortestDelta(phiRef.current, target.phi),
      dt: target.theta - thetaRef.current,
      start: performance.now(),
    }
  }, [selectedId, placed, reduced, homeCenter])

  const markers = useMemo(
    () =>
      placed.map((i) => {
        const [lon, lat] = i.centroid
        return {
          id: i.id,
          location: [lat, lon] as [number, number],
          size: clamp(0.028 + i.area_km2 / 900, 0.028, 0.075),
          color: TIER[tierOf(i)].rgb,
        }
      }),
    [placed],
  )

  // Live data for the render loop. Kept in a ref so a refetch that returns identical
  // incidents does not tear down and rebuild the globe.
  const dataRef = useRef({ placed, markers })
  useEffect(() => {
    dataRef.current = { placed, markers }
  }, [placed, markers])

  // Rebuild only when the marker set genuinely changes. TanStack Query hands us a fresh
  // array on every refetch, and createGlobe is expensive (22k map samples).
  const sig = useMemo(
    () =>
      markers
        .map((m) => `${m.id},${m.location[0].toFixed(4)},${m.location[1].toFixed(4)},${m.size.toFixed(4)},${m.color.join('/')}`)
        .join('|'),
    [markers],
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const host = hostRef.current

    let raf = 0
    let disposed = false
    const globe = createGlobe(canvas, {
      devicePixelRatio: Math.min(window.devicePixelRatio || 1, 2),
      width: 1000,
      height: 1000,
      phi: phiRef.current,
      theta: thetaRef.current,
      scale: zoomRef.current,
      dark: 1,
      diffuse: 1.15,
      mapSamples: 22000,
      mapBrightness: 5.2,
      // Warm dark charcoal, not navy — the sphere reads as part of the grayscale+orange system,
      // a dark instrument face against the light console rather than a leftover blue theme.
      baseColor: [0.16, 0.13, 0.11],
      markerColor: [1, 0.408, 0.012],
      glowColor: [0.09, 0.06, 0.04],
      markerElevation: 0,
      markers: dataRef.current.markers,
    })

    // cobe sizes its wrapper div (and the canvas inside it) with inline pixel styles of its
    // own choosing, not necessarily the host's actual rendered box. Our marker-button overlay
    // is positioned `absolute inset-0` against the host, so if cobe's box drifts from the
    // host's box, the anchor percentages we copy below land in the wrong place — visibly, on
    // whatever sits below the globe on the page. Pin both to the host's box exactly, so cobe's
    // own percentages and our overlay always share one coordinate space.
    const wrap = canvas.parentElement
    if (wrap && wrap !== host) {
      wrap.style.position = 'absolute'
      wrap.style.inset = '0'
      wrap.style.width = '100%'
      wrap.style.height = '100%'
    }
    canvas.style.width = '100%'
    canvas.style.height = '100%'

    // cobe wraps our canvas in a relative div and appends the anchor divs there.
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
      } else if (!dragRef.current) {
        // pointermove drives rotation while dragging; otherwise coast, then idle-spin
        if (Math.abs(velRef.current) > 0.00005) {
          phiRef.current += velRef.current
          velRef.current *= 0.94
        } else if (spinRef.current && !reduced) {
          phiRef.current += SPIN
        }
      }

      // Chase the zoom target — smooths noisy wheel/touch deltas into one steady motion.
      zoomRef.current += (zoomTargetRef.current - zoomRef.current) * (reduced ? 1 : 0.16)
      const nowZoomedIn = zoomRef.current > ZOOM_LINK_THRESHOLD
      setZoomedIn((prev) => (prev === nowZoomedIn ? prev : nowZoomedIn))

      // The auto zoom-in on a selection ramps toward MAX_ZOOM but only ever asymptotically
      // approaches it (it's a chase, not a snap) — "close enough" is the arrival signal, fired
      // once per selection so a click never re-triggers the hand-off it already made.
      const { selectedId: liveSelectedId, onZoomedIn: liveOnZoomedIn } = liveRef.current
      if (
        liveSelectedId &&
        liveOnZoomedIn &&
        firedZoomForRef.current !== liveSelectedId &&
        MAX_ZOOM - zoomRef.current < 0.08
      ) {
        firedZoomForRef.current = liveSelectedId
        liveOnZoomedIn(liveSelectedId)
      }

      globe.update({ phi: phiRef.current, theta: thetaRef.current, scale: zoomRef.current })

      if (anchors.current.size === 0) findAnchors()

      for (const inc of dataRef.current.placed) {
        const dot = dots.current.get(inc.id)
        if (!dot) continue
        const a = anchors.current.get(inc.id)
        if (!a) continue
        const [lon, lat] = inc.centroid
        const z = depthOf(lat, lon, phiRef.current, thetaRef.current)
        const front = z > 0
        dot.style.left = a.style.left
        dot.style.top = a.style.top
        const vis = front ? clamp(0.3 + z * 1.15, 0, 1) : 0
        dot.style.opacity = String(vis)
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
      // cobe wraps the canvas in a div and never removes it on destroy (we then repin it to
      // `absolute`, above). Unwrap it, or repeated mounts nest wrappers indefinitely.
      const wrap = canvas.parentElement
      if (wrap && wrap !== host && wrap.contains(canvas) && (wrap.style.position === 'relative' || wrap.style.position === 'absolute')) {
        wrap.parentElement?.insertBefore(canvas, wrap)
        wrap.remove()
      }
    }
  }, [sig, reduced])

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (pinchRef.current) return // a second finger down starts a pinch, not a drag
    dragRef.current = { x: e.clientX, y: e.clientY, phi: phiRef.current, theta: thetaRef.current }
    flightRef.current = null
    velRef.current = 0
    e.currentTarget.style.cursor = 'grabbing'
  }, [])

  // Wheel-to-zoom (native listener: React's synthetic wheel handler is passive, so it cannot
  // preventDefault to stop the page scrolling under the globe) and two-finger pinch-to-zoom.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const factor = Math.pow(1.0015, -e.deltaY)
      zoomTargetRef.current = clamp(zoomTargetRef.current * factor, MIN_ZOOM, MAX_ZOOM)
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })

    const activePointers = new Map<number, PointerEvent>()
    const onDown = (e: PointerEvent) => {
      activePointers.set(e.pointerId, e)
      if (activePointers.size === 2) {
        dragRef.current = null // two fingers: stop any single-finger drag/rotate
        const [a, b] = [...activePointers.values()]
        pinchRef.current = { pointers: activePointers, d0: dist(a, b), z0: zoomTargetRef.current }
      }
    }
    const onMove = (e: PointerEvent) => {
      if (!activePointers.has(e.pointerId)) return
      activePointers.set(e.pointerId, e)
      const pinch = pinchRef.current
      if (pinch && activePointers.size >= 2) {
        const [a, b] = [...activePointers.values()]
        const d1 = dist(a, b)
        if (pinch.d0 > 0) zoomTargetRef.current = clamp((d1 / pinch.d0) * pinch.z0, MIN_ZOOM, MAX_ZOOM)
      }
    }
    const onUp = (e: PointerEvent) => {
      activePointers.delete(e.pointerId)
      if (activePointers.size < 2) pinchRef.current = null
    }

    canvas.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerup', onUp, { passive: true })
    window.addEventListener('pointercancel', onUp, { passive: true })
    return () => {
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [])

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = dragRef.current
      if (!d) return
      const dx = (e.clientX - d.x) / 220
      phiRef.current = d.phi - dx
      thetaRef.current = clamp(d.theta + (e.clientY - d.y) / 380, -1.05, 1.05)
      velRef.current = -dx * 0.06
    }
    const up = () => {
      if (!dragRef.current) return
      dragRef.current = null
      const c = canvasRef.current
      if (c) c.style.cursor = 'grab'
    }
    window.addEventListener('pointermove', move, { passive: true })
    window.addEventListener('pointerup', up, { passive: true })
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [])

  return (
    // overflow-hidden: cobe's own anchor percentages are unclamped (its projection math for a
    // back-facing or off-disc marker can compute well outside 0–100%; cobe just never renders
    // those anchors, since it only draws the sphere itself). We copy that same percentage onto
    // a real, clickable button, so without a clip a stray marker can drift off the globe entirely
    // and land on whatever content follows it on the page. Clipping to this box is the guarantee.
    <div ref={hostRef} className={`relative aspect-square w-full select-none overflow-hidden ${className ?? ''}`}>
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onDoubleClick={() => onSelect(null)}
        className="size-full"
        style={{
          contain: 'layout paint size',
          cursor: 'grab',
          touchAction: 'none',
          opacity: ready ? 1 : 0,
          transition: 'opacity 900ms ease',
        }}
        aria-label={`Globe showing ${placed.length} detected slicks`}
      />

      {/* Clickable slick markers. Positioned each frame from cobe's own anchors. */}
      <div className="pointer-events-none absolute inset-0">
        {placed.map((inc) => {
          const tier = TIER[tierOf(inc)]
          const isSel = inc.id === selectedId
          const isHot = inc.id === hovered
          return (
            <button
              key={inc.id}
              ref={(el) => {
                if (el) dots.current.set(inc.id, el)
                else dots.current.delete(inc.id)
              }}
              type="button"
              onClick={() => onSelect(isSel ? null : inc.id)}
              onPointerEnter={() => setHovered(inc.id)}
              onPointerLeave={() => setHovered((h) => (h === inc.id ? null : h))}
              className="absolute grid size-6 place-items-center rounded-full outline-none"
              style={{ left: '50%', top: '50%', opacity: 0, pointerEvents: 'none' }}
              aria-label={`${inc.code}, ${inc.zone}`}
              aria-pressed={isSel}
            >
              {/* radar ping */}
              {!reduced &&
                [0, 1].map((k) => (
                  <motion.span
                    key={k}
                    className="absolute size-3 rounded-full"
                    style={{ border: `1px solid ${tier.hex}` }}
                    animate={{ scale: [1, isSel ? 3.4 : 2.5], opacity: [isSel ? 0.75 : 0.5, 0] }}
                    transition={{
                      duration: isSel ? 1.6 : 2.5,
                      repeat: Infinity,
                      ease: 'easeOut',
                      delay: k * (isSel ? 0.8 : 1.25),
                    }}
                  />
                ))}

              {/* selection ring */}
              {isSel && (
                <motion.span
                  layoutId="slick-ring"
                  className="absolute size-5 rounded-full"
                  style={{ border: `1.5px solid ${tier.hex}`, boxShadow: `0 0 12px ${tier.hex}66` }}
                />
              )}

              {/* the dot */}
              <span
                className="relative rounded-full transition-all duration-200"
                style={{
                  width: isSel || isHot ? 9 : 7,
                  height: isSel || isHot ? 9 : 7,
                  background: tier.hex,
                  boxShadow: `0 0 ${isSel || isHot ? 14 : 7}px ${tier.hex}`,
                  outline: '1.5px solid #14100c',
                }}
              />

              {/* hover label */}
              {isHot && !isSel && (
                <span className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded border border-line bg-surface-2/95 px-1.5 py-0.5 font-mono text-[10px] text-ink shadow-lg backdrop-blur">
                  {inc.code}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Past this zoom, the sphere has no more real detail to show, and the globe is already
          ramping to MAX_ZOOM to auto-hand-off to the investigation page (see onZoomedIn in the
          render loop). This link is the early-exit: never make the officer sit through an
          animation they don't need to. */}
      {zoomedIn && selectedInc && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="absolute bottom-2 left-1/2 z-20 -translate-x-1/2"
        >
          <Link
            to={`/app/incidents/${selectedInc.id}`}
            className="flex items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 font-mono text-[11px] font-medium text-bg shadow-lg hover:opacity-90"
          >
            <ArrowUpRight className="size-3.5" /> Opening investigation for {selectedInc.code}…
          </Link>
        </motion.div>
      )}

      {/* legend */}
      <div className="absolute bottom-2 left-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded border border-line bg-surface/85 px-2 py-1.5 font-mono text-[10px] text-ink-2 backdrop-blur">
        {(['prime', 'poi', 'none'] as TierKey[]).map((k) => (
          <span key={k} className="flex items-center gap-1.5">
            <span
              className="size-2 rounded-full"
              style={{ background: TIER[k].hex, boxShadow: `0 0 6px ${TIER[k].hex}` }}
            />
            {TIER[k].label}
          </span>
        ))}
      </div>

      <div className="absolute right-2 top-2 flex items-center gap-1 rounded border border-line bg-surface/85 px-2 py-1 font-mono text-[10px] text-ink-3 backdrop-blur">
        <ZoomIn className="size-3" aria-hidden />
        {placed.length} slick{placed.length === 1 ? '' : 's'} · drag to spin · scroll/pinch to zoom
      </div>

      {/* Visible confirmation that the hold-on-sector behaviour above is active, and which
          sector — an officer restricted to one zone should never have to guess why the globe
          stopped spinning. */}
      {homeCenter && homeLabel && (
        <div className="absolute left-2 top-2 flex items-center gap-1.5 rounded border border-line bg-surface/85 px-2 py-1 font-mono text-[10px] text-ink-2 backdrop-blur">
          <Anchor className="size-3 text-accent" aria-hidden />
          Sector: {homeLabel}
        </div>
      )}
    </div>
  )
}
