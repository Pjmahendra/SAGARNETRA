import { useEffect, useRef, useState } from 'react'

/**
 * The backdrop behind the sign-in page: the Chennai–Ennore coast this console watches.
 *
 * Three layers, each covering the one below if it is there:
 *
 *  1. `public/media/login.jpg` — Esri World Imagery of the sector, the same source the incident
 *     maps use, stitched and graded offline into one 140 kB still. This is what normally shows.
 *  2. `public/media/login.{webm,mp4}` — a looping clip, if anyone drops one in. Nothing else needs
 *     changing; it fades in over the still.
 *  3. A sea drawn live on canvas, underneath both. It is what you would see if the still were ever
 *     missing, and it is why the page can never come up blank.
 *
 * Everything is bundled, nothing is fetched at runtime: the build plan requires the demo to survive
 * the venue WiFi dying, so a CDN backdrop was never an option.
 *
 * Motion is honest about being decorative: it stops when the tab is hidden, and it never starts for
 * a viewer who has asked the operating system to reduce motion.
 */

/** Harbour haze, sampled to sit under cream text without fighting the console's warm palette. */
const SKY_TOP = '#9aa6b2'
const SKY_HORIZON = '#c2c8cd'
const SEA_NEAR_HORIZON = '#4a5865'
const SEA_DEEP = '#16202b'
const HORIZON = 0.4 // fraction of height
const ROWS = 90
const CRESTS = 34 // per row

/** Deterministic hash-noise in [0,1). Same sea on every load, and no allocation per frame. */
function rnd(n: number) {
  const s = Math.sin(n * 12.9898) * 43758.5453
  return s - Math.floor(s)
}

function paint(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  const hy = h * HORIZON

  const sky = ctx.createLinearGradient(0, 0, 0, hy)
  sky.addColorStop(0, SKY_TOP)
  sky.addColorStop(1, SKY_HORIZON)
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, w, hy)

  const sea = ctx.createLinearGradient(0, hy, 0, h)
  sea.addColorStop(0, SEA_NEAR_HORIZON)
  sea.addColorStop(0.35, '#2b3a48')
  sea.addColorStop(1, SEA_DEEP)
  ctx.fillStyle = sea
  ctx.fillRect(0, hy, w, h - hy)

  // A far shore: a bare suggestion of land, so the horizon is a place and not a ruled line.
  ctx.fillStyle = 'rgba(38,48,58,0.42)'
  ctx.beginPath()
  ctx.moveTo(0, hy)
  for (let x = 0; x <= w; x += 24) {
    const k = x / w
    const bump = Math.sin(k * 9) * 2.5 + Math.sin(k * 23 + 1.7) * 1.6 + Math.sin(k * 3) * 3
    ctx.lineTo(x, hy - 2 - Math.max(0, bump))
  }
  ctx.lineTo(w, hy)
  ctx.closePath()
  ctx.fill()

  // Ripples. Rows are spaced quadratically from the horizon, which is what gives the sea its
  // perspective: crowded and fine in the distance, long and slow in the foreground. Every crest is
  // placed and sized from `rnd`, because evenly spaced dashes read as corduroy, not water.
  ctx.lineCap = 'round'
  for (let i = 0; i < ROWS; i++) {
    const k = i / ROWS
    const y = hy + k * k * (h - hy)
    const depth = k * k // 0 at the horizon, 1 at the near edge
    const amp = 0.5 + depth * 7
    const unit = 10 + depth * 150 // typical crest length at this distance
    const drift = t * (4 + depth * 46) // nearer water slides past faster

    // A long, slow swell running under everything, so the surface heaves as one body of water
    // instead of each row rippling on its own.
    const swell = Math.sin(t * 0.32 + k * 5.5) * (1 + depth * 5)

    const light = `rgba(198,210,220,${0.045 + depth * 0.13})`
    const dark = `rgba(9,15,22,${0.035 + depth * 0.17})`

    for (const [tone, dy, dir] of [[light, 0, 1], [dark, 1.2 + depth * 2.5, -0.7]] as const) {
      ctx.strokeStyle = tone
      ctx.lineWidth = 0.6 + depth * 2.2
      ctx.beginPath()
      const span = w + unit * 2
      for (let j = 0; j < CRESTS; j++) {
        const seed = i * 131 + j * 17
        const r1 = rnd(seed), r2 = rnd(seed + 1), r3 = rnd(seed + 2)
        if (r3 < 0.25) continue // gaps: real water is not continuously textured
        const len = unit * (0.35 + r2 * 1.1)
        let x = (r1 * span + drift * dir) % span - unit
        if (x < -unit) x += span
        const off = swell + Math.sin(t * (0.7 + depth) + r1 * 12 + x * 0.004) * amp + (r2 - 0.5) * amp
        ctx.moveTo(x, y + off + dy)
        ctx.lineTo(x + len, y + off + dy + (r3 - 0.5) * depth * 2)
      }
      ctx.stroke()
    }
  }

  // Haze pooling on the horizon, which is what makes the distance read as distance.
  const haze = ctx.createLinearGradient(0, hy - h * 0.1, 0, hy + h * 0.14)
  haze.addColorStop(0, 'rgba(194,200,205,0)')
  haze.addColorStop(0.5, 'rgba(194,200,205,0.5)')
  haze.addColorStop(1, 'rgba(194,200,205,0)')
  ctx.fillStyle = haze
  ctx.fillRect(0, hy - h * 0.1, w, h * 0.24)
}

export default function SeaBackdrop({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [videoReady, setVideoReady] = useState(false)
  const [imgReady, setImgReady] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    let w = 0
    let h = 0

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const r = canvas.getBoundingClientRect()
      w = Math.max(1, Math.round(r.width))
      h = Math.max(1, Math.round(r.height))
      canvas.width = w * dpr
      canvas.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      paint(ctx, w, h, still ? 12 : performance.now() / 1000)
    }

    const frame = () => {
      paint(ctx, w, h, performance.now() / 1000)
      raf = requestAnimationFrame(frame)
    }
    const start = () => { if (!still && !raf && !document.hidden) raf = requestAnimationFrame(frame) }
    const stop = () => { if (raf) { cancelAnimationFrame(raf); raf = 0 } }
    const onVisibility = () => (document.hidden ? stop() : start())

    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    resize()
    start()
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      stop()
      ro.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return (
    <div className={className} aria-hidden>
      <canvas ref={canvasRef} className="size-full" />

      {/* The Chennai–Ennore coast from the same Esri imagery the console's maps use, stitched and
          graded offline into `public/media/login.jpg`. Bundled, so it needs no network. It layers
          over the canvas; if the file were ever missing, the drawn sea is still underneath. */}
      <img
        src="/media/login.jpg" alt=""
        className={`absolute inset-0 size-full object-cover transition-opacity duration-700 ${imgReady ? 'opacity-100' : 'opacity-0'}`}
        onLoad={() => setImgReady(true)}
      />
      {/* Optional: drop a clip at web/public/media/login.mp4 and it takes over. If the file is not
          there the request 404s, onError fires, and the still simply stays. */}
      <video
        className={`absolute inset-0 size-full object-cover transition-opacity duration-1000 ${videoReady ? 'opacity-100' : 'opacity-0'}`}
        autoPlay muted loop playsInline preload="auto"
        onCanPlay={() => setVideoReady(true)}
        onError={() => setVideoReady(false)}
      >
        <source src="/media/login.webm" type="video/webm" />
        <source src="/media/login.mp4" type="video/mp4" />
      </video>
    </div>
  )
}
