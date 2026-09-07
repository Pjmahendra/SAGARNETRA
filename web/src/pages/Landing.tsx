import { useEffect, useRef } from 'react'
import { Link } from 'react-router'
import createGlobe from 'cobe'
import { ArrowRight } from 'lucide-react'

const STAGES = [
  ['Watch', 'New Sentinel-1 scenes over saved watch zones, tiled automatically.'],
  ['Detect', 'A U-Net segments each tile into sea, oil, look-alike, ship and land.'],
  ['Backtrack', 'Wind and current drive the slick backwards to origin zones at 6, 12 and 24 h.'],
  ['Ships nearby', 'Every AIS track inside those zones during the window.'],
  ['Categorise + rank', 'Type, behaviour, AIS gaps and heading fused into one explainable score.'],
  ['Officer', 'An evidence pack, track replay and a PDF the boarding team can act on.'],
] as const

export default function Landing() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    let phi = 3.9
    const size = 560
    const globe = createGlobe(canvas, {
      devicePixelRatio: 2, width: size * 2, height: size * 2, phi, theta: 0.32, dark: 1, diffuse: 1.1,
      mapSamples: 18000, mapBrightness: 5, baseColor: [0.13, 0.2, 0.33], markerColor: [0.89, 0.64, 0.19], glowColor: [0.07, 0.13, 0.24],
      markers: [
        { location: [21.05, 69.42], size: 0.07 }, { location: [18.84, 72.61], size: 0.04 }, { location: [13.21, 80.42], size: 0.04 },
      ],
    })
    let raf = 0
    const spin = () => { phi += 0.0022; globe.update({ phi }); raf = requestAnimationFrame(spin) }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!reduce) raf = requestAnimationFrame(spin)
    return () => { cancelAnimationFrame(raf); globe.destroy() }
  }, [])

  return (
    <div className="min-h-dvh bg-bg text-ink">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2.5">
          <div className="grid size-8 place-items-center rounded bg-ink font-pixel text-sm text-bg">S</div>
          <span className="font-display text-lg font-bold tracking-wide">SAGARNETRA</span>
        </div>
        <Link to="/login" className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-bg transition-opacity hover:opacity-90">
          Open console
        </Link>
      </header>

      <section className="relative overflow-hidden">
        {/* Oversized pixel wordmark, low-opacity — a nod to the pixel-tech identity that never competes with the copy or the globe. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-10 left-0 right-0 select-none whitespace-nowrap font-pixel text-[18vw] font-bold leading-none text-ink/[0.035] md:text-[11vw]"
        >
          SAGARNETRA
        </div>

        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-6 pb-20 pt-8 md:grid-cols-[1.1fr_1fr]">
          <div>
            <div className="label-caps mb-3 flex items-center gap-1.5">
              <span className="h-px w-4 bg-accent" aria-hidden />
              Smart India Hackathon 2026 · PS SIH26143
            </div>
            <h1 className="text-[52px] font-bold leading-[1.01] tracking-tight md:text-[66px]">
              From a dark patch on radar to the ship that left it.
            </h1>
            <p className="mt-5 max-w-[56ch] text-lg text-ink-2">
              SAGARNETRA reads Sentinel-1 radar for oil slicks, drifts them back to where the discharge happened, and ranks every vessel
              that was there with a score an officer can read line by line.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-4">
              <Link
                to="/login"
                className="inline-flex items-center gap-2 rounded-md bg-accent px-5 py-2.5 font-semibold text-white transition-colors hover:bg-accent-deep"
              >
                Sign in <ArrowRight className="size-4" />
              </Link>
              <span className="text-sm text-ink-3">Leads for inspection, not verdicts. Boarding and sampling confirm.</span>
            </div>
          </div>
          <div className="relative mx-auto aspect-square w-full max-w-[560px]">
            <canvas ref={ref} className="size-full" style={{ contain: 'layout paint size' }} aria-label="Globe with monitored zones" />
            <div className="absolute bottom-3 left-3 rounded border border-line bg-surface/90 px-2 py-1 font-mono text-[11px] text-ink-2 backdrop-blur">
              3 watch zones · Arabian Sea and Bay of Bengal
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-line bg-surface">
        <div className="mx-auto max-w-6xl px-6 py-14">
          <div className="label-caps mb-4 flex items-center gap-1.5">
            <span className="h-px w-4 bg-accent" aria-hidden />
            One pipeline, six stages
          </div>
          <ol className="grid gap-3 md:grid-cols-3">
            {STAGES.map(([title, body], i) => (
              <li key={title} className="group relative overflow-hidden rounded-lg border border-line bg-bg p-4 transition-colors hover:border-accent/50">
                <span className="absolute inset-x-0 top-0 h-[3px] origin-left scale-x-0 bg-accent transition-transform duration-300 group-hover:scale-x-100" aria-hidden />
                <div className="font-mono text-xs text-accent">{String(i + 1).padStart(2, '0')}</div>
                <div className="mt-1 font-display text-xl font-semibold">{title}</div>
                <p className="mt-1 text-sm text-ink-2">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-6 py-8 text-xs text-ink-3">
        Team AZIMUTH · Prior art acknowledged: SkyTruth Cerulean. Our contribution is the Indian-waters look-alike model, drift backtracking, a single calibrated score and the Coast Guard workflow.
      </footer>
    </div>
  )
}
