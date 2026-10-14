import type { DataQuality } from '../api.ts'

const config: Record<DataQuality, { label: string; className: string }> = {
  api: { label: 'API', className: 'bg-leaf-light text-leaf-dark' },
  observed: { label: 'OBSERVED', className: 'bg-amber-light text-amber-dark' },
  derived: { label: 'DERIVED', className: 'bg-sand text-stone' },
  estimate: { label: 'ESTIMATE', className: 'bg-brick-light text-brick-dark' },
}

export default function DataQualityBadge({ quality }: { quality: DataQuality }) {
  const c = config[quality] ?? config.observed
  return (
    <span className={`inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold tracking-wide ${c.className}`} title="Data quality — see the design doc's honesty-sticker rule">
      {c.label}
    </span>
  )
}
