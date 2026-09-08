import { create } from 'zustand'
import { useNavigate } from 'react-router'

/**
 * A themed "page curtain" transition: vertical panels drop from the top rail to cover the
 * screen, the route changes underneath while covered, then the panels lift away to reveal the
 * destination — modelled on motion.dev's page-curtains pattern (examples.motion.dev/ui/sections/page-curtains).
 *
 * Deliberately a tiny state machine rather than driving navigation directly: PageCurtain (the
 * component that actually renders and animates the panels) calls back into `onCovered` at the
 * exact moment the screen is fully hidden, so the caller's `navigate()` never runs mid-animation
 * and is never visible happening.
 */
type Phase = 'idle' | 'closing' | 'covered' | 'opening'

interface CurtainState {
  phase: Phase
  onCovered: (() => void) | null
  run: (onCovered: () => void) => void
  markCovered: () => void
  startOpening: () => void
  markOpened: () => void
}

export const useCurtain = create<CurtainState>((set, get) => ({
  phase: 'idle',
  onCovered: null,
  run: (onCovered) => {
    if (get().phase !== 'idle') return // already mid-transition; don't stack another
    set({ phase: 'closing', onCovered })
  },
  markCovered: () => {
    get().onCovered?.()
    set({ phase: 'covered' })
  },
  startOpening: () => set({ phase: 'opening' }),
  markOpened: () => set({ phase: 'idle', onCovered: null }),
}))

/** Runs the curtain, then navigates to `to` the instant the screen is fully covered. */
export function useCurtainNavigate() {
  const navigate = useNavigate()
  const run = useCurtain((s) => s.run)
  return (to: string) => run(() => navigate(to))
}
