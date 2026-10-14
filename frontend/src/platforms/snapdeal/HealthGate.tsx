import { useState } from 'react'
import Card, { PageHeader } from '../../components/Card.js'
import { useAutoRefresh } from '../../hooks/useAutoRefresh.js'
import { getSnapdealHealth, type SnapdealHealth } from './api.js'

const GATES: { key: Exclude<keyof NonNullable<SnapdealHealth['latest']>, 'day'>; label: string; limit: number; higherIsWorse: boolean }[] = [
  { key: 'cancellation_pct', label: 'Cancellation %', limit: 1, higherIsWorse: true },
  { key: 'ontime_pct', label: 'On-time dispatch %', limit: 98, higherIsWorse: false },
  { key: 'rating', label: 'Rating', limit: 4.0, higherIsWorse: false },
  { key: 'dto_pct', label: 'DTO %', limit: 5.5, higherIsWorse: true },
  { key: 'rto_pct', label: 'RTO %', limit: 10, higherIsWorse: true },
  { key: 'dispatched_24h_pct', label: 'Dispatched within 24h %', limit: 95, higherIsWorse: false },
]

export default function SnapdealHealthGatePage() {
  const [data, setData] = useState<SnapdealHealth | null>(null)
  const [error, setError] = useState<string | null>(null)
  useAutoRefresh(() => { getSnapdealHealth().then(setData).catch((e) => setError(String(e))) }, [], 60_000)

  if (error) return <Card className="text-brick">Could not reach Snapdeal's app on port 8300 — is it running? ({error})</Card>
  if (!data) return <Card className="text-stone">Loading…</Card>

  return (
    <div className="space-y-4">
      <PageHeader title="Snapdeal — Health Gate" subtitle="Seller-health thresholds that gate visibility, from the seller scorecard." />
      {!data.latest ? (
        <Card className="text-sm text-stone">No scorecard data read yet.</Card>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {GATES.map((g) => {
            const v = data.latest![g.key]
            const breached = v != null && (g.higherIsWorse ? v > g.limit : v < g.limit)
            return (
              <Card key={g.key} className={breached ? 'border-brick' : undefined}>
                <div className="text-xs font-medium uppercase tracking-wide text-stone">{g.label}</div>
                <div className={`mt-1 text-2xl font-bold ${breached ? 'text-brick' : 'text-ink'}`}>{v ?? '—'}</div>
                <div className="text-xs text-stone">Gate: {g.higherIsWorse ? '<' : '>'} {g.limit}</div>
              </Card>
            )
          })}
        </div>
      )}
      {data.history.length > 0 && (
        <Card>
          <h2 className="mb-2 text-sm font-semibold text-ink">History</h2>
          <table className="w-full text-xs">
            <thead className="text-left text-stone">
              <tr><th className="pb-1 pr-3">Day</th><th className="pb-1 pr-3">Cancel%</th><th className="pb-1 pr-3">On-time%</th><th className="pb-1 pr-3">Rating</th><th className="pb-1 pr-3">DTO%</th><th className="pb-1 pr-3">RTO%</th><th className="pb-1">Dispatched24h%</th></tr>
            </thead>
            <tbody>
              {data.history.map((h) => (
                <tr key={h.day} className="border-t border-sand">
                  <td className="py-1.5 pr-3 text-stone">{h.day}</td>
                  <td className="py-1.5 pr-3">{h.cancellation_pct ?? '—'}</td>
                  <td className="py-1.5 pr-3">{h.ontime_pct ?? '—'}</td>
                  <td className="py-1.5 pr-3">{h.rating ?? '—'}</td>
                  <td className="py-1.5 pr-3">{h.dto_pct ?? '—'}</td>
                  <td className="py-1.5 pr-3">{h.rto_pct ?? '—'}</td>
                  <td className="py-1.5">{h.dispatched_24h_pct ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
