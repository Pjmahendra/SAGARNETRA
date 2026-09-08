import { useEffect } from 'react'
import { motion } from 'motion/react'
import { useCurtain } from '../store/curtain'

/**
 * Five vertical panels in the console's own palette, dropping from the top rail like theater
 * curtains covering the stage — the route changes while fully hidden, then the panels lift away
 * (from the bottom this time, so it reads as one continuous motion, not a rewind) to reveal the
 * destination. Modelled on motion.dev's page-curtains pattern.
 */
const PANEL_COLORS = ['#14100c', '#ae3a02', '#ff6803', '#ae3a02', '#14100c']
const EASE = [0.76, 0, 0.24, 1] as const
const PANEL_MS = 520
const STAGGER_MS = 70
const HOLD_MS = 140

export default function PageCurtain() {
  const { phase, markCovered, startOpening, markOpened } = useCurtain()

  useEffect(() => {
    if (phase !== 'covered') return
    const t = window.setTimeout(startOpening, HOLD_MS)
    return () => window.clearTimeout(t)
  }, [phase, startOpening])

  if (phase === 'idle') return null

  const closing = phase === 'closing' || phase === 'covered'
  const lastPanel = PANEL_COLORS.length - 1

  return (
    <div className="pointer-events-none fixed inset-0 z-[9999] flex" aria-hidden>
      {PANEL_COLORS.map((color, i) => {
        // Closing sweeps left-to-right; opening reverses the order so the last panel down is
        // the first to lift, reading as one motion folding back rather than a rewind. Whichever
        // index carries the *largest* stagger delay is the one that actually finishes last —
        // that's `lastPanel` while closing, but `0` while opening, since order flips.
        const order = closing ? i : lastPanel - i
        const finishesLast = closing ? i === lastPanel : i === 0
        return (
          <motion.div
            key={i}
            className="h-full flex-1"
            style={{ background: color, transformOrigin: closing ? 'top' : 'bottom' }}
            initial={{ scaleY: 0 }}
            animate={{ scaleY: closing ? 1 : 0 }}
            transition={{ duration: PANEL_MS / 1000, delay: (order * STAGGER_MS) / 1000, ease: EASE }}
            onAnimationComplete={() => {
              if (!finishesLast) return
              if (phase === 'closing') markCovered()
              else if (phase === 'opening') markOpened()
            }}
          />
        )
      })}
    </div>
  )
}
