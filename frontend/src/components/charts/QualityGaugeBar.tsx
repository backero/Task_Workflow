interface QualityGaugeBarProps {
  label: string
  value: number | null | undefined
  sublabel?: string
  target?: number
}

export default function QualityGaugeBar({ label, value, sublabel, target = 80 }: QualityGaugeBarProps) {
  const percent = Math.min(100, Math.max(0, value ?? 0))
  const isBelowTarget = percent < (target ?? 80)
  const color = percent >= 80 ? '#4ade80' : percent >= 60 ? '#eab308' : '#ef4444'

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs font-medium">
        <span className="text-stone">{label}</span>
        <span className="text-ink">{percent.toFixed(1)}%</span>
      </div>
      <div className="relative h-6 bg-cream rounded-full overflow-hidden border border-stone/10">
        <div className="absolute inset-0 flex">
          <div className="flex-1" style={{ backgroundColor: color, width: `${percent}%` }} />
        </div>
        {target && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-stone/30"
            style={{ left: `${target}%` }}
            title={`Target: ${target}%`}
          />
        )}
      </div>
      {sublabel && <div className="text-xs text-stone mt-1">{sublabel}</div>}
    </div>
  )
}
