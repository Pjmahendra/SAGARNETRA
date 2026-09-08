import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { EASE, EASE_OUT } from '../lib/motion'

/**
 * The console's page transition: a horizon closing.
 *
 * Two bands sweep in from the top and bottom of the screen and meet at the centre line, the
 * destination's name resolves on the seam, and the bands then continue outward to reveal the page
 * already built underneath. Chosen over a side wipe for two reasons. It reads as a horizon, which
 * is the one shape this whole product is about; and closing to a line puts the destination name
 * exactly where the eye already is, rather than asking it to track a panel across the screen.
 *
 * Two modes, driven by `AppRoutes` in App.tsx:
 *   `cover`  runs over the outgoing page and calls `onDone` once the screen is closed and the name
 *            has settled — that is the moment the router is allowed to swap pages.
 *   `reveal` starts closed and parts. Because the same two elements simply change direction, the
 *            dark screen is continuous across the swap and the destination never flashes.
 *
 * Everything animates `transform` and `opacity` only. Colours are the palette's own `ink`; the type
 * is the console's display face, so the transition is in the product's voice rather than a
 * borrowed one.
 */
const INK = '#14100c'

const CLOSE_S = 0.46   // bands sweeping to the centre
const OPEN_S = 0.52    // and continuing outward
const NAME_S = 0.34
const HOLD_MS = 190    // closed, name legible, before the route changes
const OPEN_DELAY = 0.1 // the name starts leaving fractionally before the bands do

export default function PageCurtain({ mode, title, onDone }: {
  mode: 'cover' | 'reveal'
  title: string
  onDone: () => void
}) {
  const covering = mode === 'cover'
  const [settled, setSettled] = useState(!covering)

  // The hold is timed from the name settling and must not restart because the parent re-rendered
  // with a fresh callback, which is exactly what a second click mid-transition does.
  const done = useRef(onDone)
  useEffect(() => { done.current = onDone })

  useEffect(() => {
    if (!covering || !settled) return
    const t = window.setTimeout(() => done.current(), HOLD_MS)
    return () => window.clearTimeout(t)
  }, [covering, settled])

  // Each band covers just over half the viewport, so they overlap at the seam and never leave a
  // hairline of the page showing between them at the moment of the swap.
  const band = (from: 'top' | 'bottom') => {
    const sign = from === 'top' ? -1 : 1
    return {
      className: 'absolute inset-x-0 h-[51%]',
      style: { background: INK, [from]: 0 } as React.CSSProperties,
      initial: { y: covering ? `${sign * 100}%` : '0%' },
      animate: { y: covering ? '0%' : `${sign * 100}%` },
      transition: {
        duration: covering ? CLOSE_S : OPEN_S,
        ease: covering ? EASE : EASE_OUT,
        delay: covering ? 0 : OPEN_DELAY,
      },
    }
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-[9999] overflow-hidden" aria-hidden>
      <motion.div {...band('top')} />
      <motion.div
        {...band('bottom')}
        onAnimationComplete={() => { if (!covering) done.current() }}
      />

      {/* The destination's name, on the seam. Display face, tracked out — the same voice the
          console's own labels use, not a typeface introduced for the transition. */}
      <div className="absolute inset-0 grid place-items-center px-6">
        <motion.div
          className="text-center font-display font-semibold uppercase leading-none tracking-[0.14em] text-bg"
          style={{ fontSize: 'clamp(20px, 3.4vw, 46px)' }}
          initial={covering ? { opacity: 0, y: 10 } : { opacity: 1, y: 0 }}
          animate={covering ? { opacity: 1, y: 0 } : { opacity: 0, y: -8 }}
          transition={covering
            ? { duration: NAME_S, ease: EASE_OUT, delay: CLOSE_S * 0.55 }
            : { duration: 0.22, ease: 'easeIn' }}
          onAnimationComplete={() => { if (covering) setSettled(true) }}
        >
          {title}
        </motion.div>
      </div>
    </div>
  )
}
