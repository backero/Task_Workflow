import { useState } from 'react'
import Card, { PageHeader } from '../../components/Card.tsx'
import { useAutoRefresh } from '../../hooks/useAutoRefresh.ts'
import { getFlipkartAccount, type FlipkartAccount } from './api.ts'

function fmtVal(key: string, v: number) {
  if (key.includes('pct') || key.includes('rate')) return `${(v * 100).toFixed(2)}%`
  return v.toFixed(2)
}

export default function FlipkartAccountPage() {
  const [data, setData] = useState<FlipkartAccount | null>(null)
  const [error, setError] = useState<string | null>(null)
  useAutoRefresh(() => { getFlipkartAccount().then(setData).catch((e) => setError(String(e))) }, [], 60_000)

  if (error) return <Card className="text-brick">Could not reach FK-Pulse's API on port 8600 — is it running? ({error})</Card>
  if (!data) return <Card className="text-stone">Loading…</Card>

  return (
    <div className="space-y-4">
      <PageHeader title="Flipkart — Account Health" subtitle="KPI cards vs thresholds, from metrics_snapshots." />
      <div className="grid grid-cols-3 gap-3">
        {data.kpis.map((k) => (
          <Card key={k.key} className={k.within_threshold === false ? 'border-brick' : undefined}>
            <div className="text-xs font-medium uppercase tracking-wide text-stone">{k.label}</div>
            <div className={`mt-1 text-xl font-bold ${k.within_threshold === false ? 'text-brick' : 'text-ink'}`}>
              {k.value == null ? '—' : fmtVal(k.key, k.value)}
            </div>
            <div className="text-xs text-stone">
              {k.value == null ? 'no data' : `limit ${fmtVal(k.key, k.threshold)} · ${k.within_threshold ? 'within threshold' : 'breach'}`}
            </div>
          </Card>
        ))}
      </div>
      <Card>
        <h2 className="mb-2 text-sm font-semibold text-ink">Metric trends</h2>
        {data.trends.length === 0 ? (
          <p className="text-sm text-stone">No data yet — the scheduler needs to compute metrics_snapshots first.</p>
        ) : (
          <table className="w-full text-xs">
            <thead className="text-left text-stone"><tr><th className="pb-1 pr-3">Computed at</th><th className="pb-1 pr-3">Metric</th><th className="pb-1">Value</th></tr></thead>
            <tbody>
              {data.trends.slice(-30).reverse().map((t, i) => (
                <tr key={i} className="border-t border-sand">
                  <td className="py-1.5 pr-3 text-stone">{t.computed_at.replace('T', ' ')}</td>
                  <td className="py-1.5 pr-3 font-medium text-ink">{t.key}</td>
                  <td className="py-1.5">{t.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
