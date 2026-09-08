import { useEffect, useState } from 'react'
import { motion } from 'motion/react'

/**
 * The one page transition in the console: Dashboard "Open investigation" → the incident's case file.
 *
 * A near-black panel wipes in from the left over the Dashboard, the destination's title (the
 * incident code, exactly as Page B's header shows it) rises into the centre, holds for a beat,
 * and the panel continues off to the right to reveal the case file already in place underneath.
 *
 * Two halves, owned by the two pages — not a global system:
 *   `cover`  is rendered by the Dashboard and calls `onDone` once the screen is fully dark and the
 *            title has settled, which is when the Dashboard navigates.
 *   `reveal` is rendered by the Investigation page on its very first paint (so Page B never flashes),
 *            starts already covering, and calls `onDone` when it has left the screen.
 * Because the route swap happens in one React commit, the dark panel is continuous across it.
 */
const EASE = [0.76, 0, 0.24, 1] as const
const WIPE_S = 0.78            // panel travel, each direction
const TITLE_IN_DELAY_S = 0.42  // title starts rising while the panel is still arriving
const TITLE_S = 0.55
const HOLD_MS = 520            // title fully settled, screen dark, before the route changes
const REVEAL_DELAY_S = 0.18    // title starts fading first, then the panel leaves

export default function CaseFileCurtain({ mode, title, onDone }: {
  mode: 'cover' | 'reveal'
  title: string
  onDone: () => void
}) {
  const covering = mode === 'cover'
  // In `cover` the hold begins when the title has finished rising; in `reveal` we leave at once.
  const [settled, setSettled] = useState(!covering)

  useEffect(() => {
    if (!covering || !settled) return
    const t = window.setTimeout(onDone, HOLD_MS)
    return () => window.clearTimeout(t)
  }, [covering, settled, onDone])

  return (
    <div className="pointer-events-none fixed inset-0 z-[9999] overflow-hidden" aria-hidden>
      {/* Wider than the viewport and skewed, so the leading edge reads as a slanted blade like the
          reference rather than a flat vertical line. */}
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
          style={{ fontFamily: '"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif', fontSize: 'clamp(48px, 8vw, 120px)' }}
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
