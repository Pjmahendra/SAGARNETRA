import type { FeatureContribution } from '../lib/types'

export default function FeatureBars({ features, dense = false }: { features: FeatureContribution[]; dense?: boolean }) {
  if (dense) {
    return (
      <div className="flex items-end gap-0.5" title={features.map((f) => `${f.label}: ${f.contribution}`).join('\n')}>
        {features.map((f) => (
          <div key={f.key} className="w-1.5 rounded-sm bg-surface-3" style={{ height: 18 }}>
            <div className="w-full rounded-sm bg-accent" style={{ height: `${Math.max(4, f.normalised * 100)}%`, marginTop: `${100 - Math.max(4, f.normalised * 100)}%` }} />
          </div>
        ))}
      </div>
    )
  }
  return (
    <ul className="space-y-2">
      {features.map((f) => (
        <li key={f.key} className="grid grid-cols-[110px_1fr_44px] items-center gap-3 text-xs">
          <span className="text-ink-2">{f.label}</span>
          <span className="relative h-2 overflow-hidden rounded-sm bg-surface-3" aria-label={`${f.label} ${Math.round(f.normalised * 100)} percent`}>
            <span className="absolute inset-y-0 left-0 rounded-sm bg-accent" style={{ width: `${f.normalised * 100}%` }} />
          </span>
          <span className="text-right font-mono tnum text-ink">{f.contribution.toFixed(1)}<span className="text-ink-3">/{f.weight}</span></span>
          <span className="col-span-3 -mt-1 text-[11px] text-ink-3">{f.raw}</span>
        </li>
      ))}
    </ul>
  )
}
