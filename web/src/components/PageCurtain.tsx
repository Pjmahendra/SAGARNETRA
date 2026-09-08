import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'

/**
 * The console's page transition: a near-black blade wipes in from the left over the page you are
 * leaving, the destination's own title rises into the centre, holds a beat, and the blade carries
 * on off to the right to reveal the destination already rendered underneath.
 *
 * Two modes, driven by `AppRoutes` in App.tsx:
 *   `cover`  runs over the outgoing page and calls `onDone` once the screen is dark and the title
 *            has settled, which is when the router is allowed to swap pages.
 *   `reveal` starts already covering — the same element simply changes direction, so the dark
 *            screen is continuous across the swap — and calls `onDone` when it has left.
 *
 * The page underneath is swapped only while fully covered, so the destination never flashes.
 */
const EASE = [0.76, 0, 0.24, 1] as const
const WIPE_S = 0.78            // panel travel, each direction
const TITLE_IN_DELAY_S = 0.42  // title starts rising while the panel is still arriving
const TITLE_S = 0.55
const HOLD_MS = 520            // title settled, screen dark, before the route changes
const REVEAL_DELAY_S = 0.18    // title fades first, then the panel leaves

export default function PageCurtain({ mode, title, onDone }: {
  mode: 'cover' | 'reveal'
  title: string
  onDone: () => void
}) {
  const covering = mode === 'cover'
  // In `cover` the hold begins once the title has finished rising; in `reveal` we leave at once.
  const [settled, setSettled] = useState(!covering)

  // The hold is timed from the title settling, so it must not restart just because the parent
  // re-rendered and handed us a fresh callback — which is exactly what a second click mid-curtain
  // does. Keep the latest callback in a ref and leave the timer alone.
  const done = useRef(onDone)
  useEffect(() => { done.current = onDone })

  useEffect(() => {
    if (!covering || !settled) return
    const t = window.setTimeout(() => done.current(), HOLD_MS)
    return () => window.clearTimeout(t)
  }, [covering, settled])

  return (
    <div className="pointer-events-none fixed inset-0 z-[9999] overflow-hidden" aria-hidden>
      {/* Wider than the viewport and skewed, so the leading edge reads as a slanted blade rather
          than a flat vertical line. */}
      <motion.div
        className="absolute inset-y-0 -left-[12vw] w-[124vw]"
        style={{ background: '#0b0501', skewX: -6 }}
        initial={{ x: covering ? '-118%' : '0%' }}
        animate={{ x: covering ? '0%' : '118%' }}
        transition={{ duration: WIPE_S, ease: EASE, delay: covering ? 0 : REVEAL_DELAY_S }}
        onAnimationComplete={() => { if (!covering) onDone() }}
      />
      <div className="absolute inset-0 grid place-items-center px-6">
        <motion.h1
          className="text-center font-normal leading-none tracking-[-0.02em] text-[#f4f2ef]"
          style={{ fontFamily: '"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif', fontSize: 'clamp(44px, 7.5vw, 116px)' }}
          initial={covering ? { opacity: 0, y: 28 } : { opacity: 1, y: 0 }}
          animate={covering ? { opacity: 1, y: 0 } : { opacity: 0, y: -18 }}
          transition={covering
            ? { duration: TITLE_S, ease: EASE, delay: TITLE_IN_DELAY_S }
            : { duration: 0.3, ease: 'easeIn' }}
          onAnimationComplete={() => { if (covering) setSettled(true) }}
        >
          {title}
        </motion.h1>
      </div>
    </div>
  )
}
