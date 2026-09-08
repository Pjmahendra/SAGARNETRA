import { useReducedMotion, type Transition, type Variants } from 'motion/react'

/**
 * One motion vocabulary for the whole console, so timing and easing are a system rather than a
 * per-component opinion. Nothing here touches colour, type, spacing or layout: every value drives
 * `transform` or `opacity` only, which are the two properties the compositor can animate without
 * laying the page out again.
 *
 * `EASE` is the curve the page curtain already uses. Reusing it means a panel settling and a page
 * arriving feel like the same hand moved them.
 */

/** Symmetrical, weighted. For anything that both starts and stops on screen. */
export const EASE = [0.76, 0, 0.24, 1] as const
/** Fast out, long settle. For things entering, which should arrive rather than glide to a halt. */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const

export const DUR = {
  /** Pointer feedback. Must be under ~200 ms or it reads as lag, not response. */
  tap: 0.14,
  hover: 0.22,
  /** Element entrances. */
  base: 0.42,
  /** Large reveals: a page's content, a panel the size of the viewport. */
  slow: 0.62,
} as const

/** Gap between children in a staggered group. Small: this is texture, not choreography. */
export const STAGGER = 0.055

/** The house entrance: a short rise with the fade, never a fade on its own. */
export const rise: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: DUR.base, ease: EASE_OUT } },
}

/** Same, from the side. For things that belong to a row rather than a column. */
export const riseX: Variants = {
  hidden: { opacity: 0, x: -10 },
  show: { opacity: 1, x: 0, transition: { duration: DUR.base, ease: EASE_OUT } },
}

/** Parent of a staggered group. Children opt in by using `rise`. */
export const group = (stagger = STAGGER, delay = 0): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: stagger, delayChildren: delay } },
})

/**
 * Whether this viewer wants motion at all.
 *
 * Returns the props to spread so a component animates for most people and simply *is* for anyone
 * who asked the operating system to reduce motion — no transform, no fade, no delay, and never a
 * hidden initial state that could leave content invisible if an animation failed to start.
 */
export function useEntrance(variants: Variants = rise) {
  const still = useReducedMotion()
  if (still) return { initial: false as const, animate: undefined, variants: undefined }
  return { initial: 'hidden' as const, animate: 'show' as const, variants }
}

/** As above, but triggered by scrolling into view. Fires once; content never re-animates on scroll back. */
export function useReveal(variants: Variants = rise, amount = 0.15) {
  const still = useReducedMotion()
  if (still) return { initial: false as const, variants: undefined }
  return {
    initial: 'hidden' as const,
    whileInView: 'show' as const,
    viewport: { once: true, amount },
    variants,
  }
}

/**
 * Press feedback for controls.
 *
 * Deliberately press-only, no `whileHover`. Hover styling already exists in CSS and applies on the
 * devices that have a pointer; a JS hover animation would also fire on touch, where it sticks after
 * the finger lifts. A tap scale is honest on every input.
 */
export function usePress(scale = 0.97) {
  const still = useReducedMotion()
  if (still) return {}
  return {
    whileTap: { scale },
    transition: { duration: DUR.tap, ease: EASE_OUT } satisfies Transition,
  }
}
