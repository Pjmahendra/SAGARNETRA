import { type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { cn } from '../lib/cn'
import { DUR, EASE_OUT, group, rise, useReveal } from '../lib/motion'

/**
 * The reusable half of the motion system. Tokens and hooks live in `lib/motion.ts`; these are the
 * three shapes worth having as components because they are otherwise copied by hand.
 *
 * Nothing here sets a colour, a font, a size or a spacing value. Each one animates `transform`,
 * `opacity` or `clip-path` and hands its own `className` straight through, so a wrapped element
 * looks exactly as it did once the motion has settled.
 */

/** A section that reveals as it scrolls into view. Once, never on the way back up. */
export function Reveal({ children, className, amount = 0.15, as: As = 'div' }: {
  children: ReactNode; className?: string; amount?: number; as?: 'div' | 'section' | 'li'
}) {
  const props = useReveal(rise, amount)
  const M = motion[As]
  return <M {...props} className={className}>{children}</M>
}

/** A staggered group. Children reveal in order; wrap each in `RevealItem`. */
export function RevealGroup({ children, className, stagger, amount = 0.15 }: {
  children: ReactNode; className?: string; stagger?: number; amount?: number
}) {
  const props = useReveal(group(stagger), amount)
  return <motion.div {...props} className={className}>{children}</motion.div>
}

export function RevealItem({ children, className }: { children: ReactNode; className?: string }) {
  const still = useReducedMotion()
  return <motion.div variants={still ? undefined : rise} className={className}>{children}</motion.div>
}

/**
 * A heading that rises out from behind its own baseline, rather than fading in place.
 *
 * The mask is the point: text sliding up inside a clipped box reads as *revealed*, where a fade
 * reads as *loaded*. `leading-none` headings put descenders below the line box, so the clip gets
 * a little room via padding cancelled by an equal negative margin — the glyphs land in exactly the
 * same place, they just are not sheared off.
 */
export function TextReveal({ children, className, delay = 0, as: As = 'span' }: {
  children: ReactNode; className?: string; delay?: number; as?: 'span' | 'h1' | 'h2'
}) {
  const still = useReducedMotion()
  const M = motion[As]
  if (still) return <M className={className}>{children}</M>
  return (
    <span className="block overflow-hidden pb-[0.14em] -mb-[0.14em]">
      <M
        className={cn('block', className)}
        initial={{ y: '105%' }}
        animate={{ y: '0%' }}
        transition={{ duration: DUR.reveal, ease: EASE_OUT, delay }}
      >
        {children}
      </M>
    </span>
  )
}

/**
 * An image that settles into its frame instead of appearing in it, and lifts a little under a
 * pointer. The container clips, so the scale never bleeds past the border it was given.
 *
 * `hover` is opt-in and pointer-only: a scale bound to hover would latch on touch, where there is
 * no way to un-hover.
 */
export function ImageReveal({ src, alt = '', className, imgClassName, hover = false }: {
  src: string; alt?: string; className?: string; imgClassName?: string; hover?: boolean
}) {
  const still = useReducedMotion()
  return (
    <div className={cn('overflow-hidden', className)}>
      <motion.img
        src={src} alt={alt}
        className={cn('size-full', imgClassName, hover && 'motion-safe:hover:scale-[1.03]',
          hover && 'transition-transform duration-[600ms] ease-[cubic-bezier(0.22,1,0.36,1)]')}
        initial={still ? false : { opacity: 0, scale: 1.04 }}
        whileInView={still ? undefined : { opacity: 1, scale: 1 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: DUR.reveal, ease: EASE_OUT }}
      />
    </div>
  )
}
