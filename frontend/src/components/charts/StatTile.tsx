import { TrendingUp, TrendingDown } from 'lucide-react'

interface StatTileProps {
  label: string
  value: number | string | null | undefined
  format?: 'number' | 'percent' | 'currency' | 'raw'
  trend?: number | null
  trendPct?: number | null
  goodDirection?: 'up' | 'down'
  accentColor?: string
}

export default function StatTile({ label, value, format = 'number', trend, trendPct, goodDirection = 'up', accentColor = '#6b7280' }: StatTileProps) {
  const formatted = value == null ? '—' : format === 'raw' ? String(value) : format === 'percent' ? `${(Number(value) || 0).toFixed(1)}%` : format === 'currency' ? `₹${(Number(value) || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : (Number(value) || 0).toLocaleString()

  const trendValue = trendPct ?? trend
  const isTrendGood = trendValue == null ? null : goodDirection === 'up' ? trendValue > 0 : trendValue < 0
  const trendColor = trendValue == null ? 'text-stone' : isTrendGood ? 'text-leaf' : isTrendGood === false ? 'text-brick' : 'text-stone'
  const trendIcon = trendValue == null ? null : isTrendGood ? <TrendingUp size={14} /> : isTrendGood === false ? <TrendingDown size={14} /> : null

  return (
    <div className="p-4 bg-cream rounded border border-stone/10" style={{ borderLeftColor: accentColor, borderLeftWidth: '3px' }}>
      <div className="text-xs font-medium text-stone mb-2">{label}</div>
      <div className="flex items-end justify-between">
        <div className="text-xl font-bold text-ink">{formatted}</div>
        {trendValue != null && (
          <div className={`flex items-center gap-1 text-xs font-medium ${trendColor}`}>
            {trendIcon}
            {Math.abs(trendValue).toFixed(1)}%
          </div>
        )}
      </div>
    </div>
  )
}
