import { forwardRef, type ReactNode } from 'react'
import { AlertOctagon, AlertTriangle, CheckCircle2, Cpu, Loader2, Waves } from 'lucide-react'
import { cn } from '../lib/cn'
import { STATUS_LABEL, TIER_LABEL } from '../lib/format'
import type { Engine, IncidentStatus, Tier } from '../lib/types'

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-ink-3">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {label}
    </span>
  )
}

export function TierChip({ tier, compact = false }: { tier: Tier; compact?: boolean }) {
  const map = {
    prime: { cls: 'bg-crit/10 text-crit border-crit/40', Icon: AlertOctagon },
    poi: { cls: 'bg-warn/10 text-warn border-warn/40', Icon: AlertTriangle },
    cleared: { cls: 'bg-ok/10 text-ok border-ok/40', Icon: CheckCircle2 },
  }[tier]
  return (
    <span className={cn('inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[11px] font-medium uppercase tracking-wide', map.cls)}>
      <map.Icon className="size-3" aria-hidden />
      {compact ? tier : TIER_LABEL[tier]}
    </span>
  )
}

export function EngineBadge({ engine }: { engine: Engine }) {
  const unet = engine === 'unet'
  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[11px] font-medium uppercase tracking-wide',
        unet ? 'border-sea/40 bg-sea/10 text-sea' : 'border-warn/40 bg-warn/10 text-warn')}
      title={unet ? 'Segmented by the U-Net model' : 'Model unavailable: classic dark-spot heuristic answered'}
    >
      {unet ? <Cpu className="size-3" aria-hidden /> : <Waves className="size-3" aria-hidden />}
      {unet ? 'U-Net' : 'Heuristic'}
    </span>
  )
}

export function StatusChip({ status }: { status: IncidentStatus }) {
  const cls = {
    detected: 'text-accent border-accent/40 bg-accent/5',
    investigating: 'text-sea border-sea/40 bg-sea/5',
    inspection_requested: 'text-crit border-crit/40 bg-crit/5',
    closed: 'text-ink-3 border-line',
  }[status]
  return <span className={cn('inline-flex rounded border px-1.5 py-0.5 font-mono text-[11px] font-medium uppercase tracking-wide', cls)}>{STATUS_LABEL[status]}</span>
}

export const Panel = forwardRef<HTMLElement, {
  title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string; id?: string
}>(function Panel({ title, actions, children, className, bodyClassName, id }, ref) {
  return (
    <section ref={ref} id={id} className={cn('flex min-h-0 flex-col rounded-lg border border-line bg-surface shadow-[0_1px_2px_rgba(20,16,12,0.04)]', className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
          {typeof title === 'string' ? <h3 className="text-[15px] font-semibold tracking-wide text-ink">{title}</h3> : title}
          {actions}
        </header>
      )}
      <div className={cn('min-h-0 flex-1 p-4', bodyClassName)}>{children}</div>
    </section>
  )
})

export function PageHeader({ eyebrow, title, description, actions }: {
  eyebrow?: string; title: string; description?: string; actions?: ReactNode
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow && <div className="label-caps mb-1 flex items-center gap-1.5"><span className="h-px w-4 bg-accent" aria-hidden />{eyebrow}</div>}
        <h1 className="text-[28px] font-semibold leading-none">{title}</h1>
        {description && <p className="mt-1.5 max-w-[62ch] text-sm text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

export function KpiTile({ label, value, unit, hint, tone = 'default', className }: {
  label: string; value: string | number; unit?: string; hint?: string; tone?: 'default' | 'accent' | 'crit'; className?: string
}) {
  return (
    <div className={cn('relative overflow-hidden rounded-lg border border-line bg-surface px-4 py-3', className)}>
      <span className={cn('absolute inset-y-0 left-0 w-[3px]', tone === 'accent' ? 'bg-accent' : tone === 'crit' ? 'bg-crit' : 'bg-line')} aria-hidden />
      <div className="label-caps">{label}</div>
      <div className={cn('mt-1 flex items-baseline gap-1.5 font-display text-[30px] font-semibold leading-none tnum',
        tone === 'accent' && 'text-accent', tone === 'crit' && 'text-crit')}>
        {value}
        {unit && <span className="font-sans text-sm font-normal text-ink-3">{unit}</span>}
      </div>
      {hint && <div className="mt-1 text-xs text-ink-3">{hint}</div>}
    </div>
  )
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="grid place-items-center rounded-lg border border-dashed border-line px-6 py-10 text-center">
      <div>
        <div className="text-sm font-semibold text-ink-2">{title}</div>
        {hint && <div className="mt-1 text-xs text-ink-3">{hint}</div>}
      </div>
    </div>
  )
}

export function ErrorNote({ message }: { message: string }) {
  return <div className="rounded-md border border-crit/40 bg-crit/5 px-3 py-2 text-sm text-crit">{message}</div>
}

export function Button({ variant = 'primary', className, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' }) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md px-3.5 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'primary' && 'bg-accent text-white hover:bg-accent-deep',
        variant === 'ghost' && 'border border-line bg-transparent text-ink-2 hover:border-ink-3 hover:text-ink',
        variant === 'danger' && 'border border-crit/50 bg-crit/5 text-crit hover:bg-crit/10',
        className,
      )}
      {...rest}
    />
  )
}

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('overflow-x-auto rounded-lg border border-line bg-surface', className)}>
      <table className="w-full text-sm [&_td]:px-3 [&_td]:py-2 [&_td]:align-middle [&_th]:sticky [&_th]:top-0 [&_th]:bg-surface-2 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-mono [&_th]:text-[11px] [&_th]:font-medium [&_th]:uppercase [&_th]:tracking-wider [&_th]:text-ink-3 [&_tr]:border-b [&_tr]:border-line [&_tbody_tr:last-child]:border-0 [&_tbody_tr:hover]:bg-surface-2/60">
        {children}
      </table>
    </div>
  )
}
