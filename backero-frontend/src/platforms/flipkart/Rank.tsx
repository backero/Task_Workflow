import { useState } from 'react'
import Card, { PageHeader } from '../../components/Card.tsx'
import { useAutoRefresh } from '../../hooks/useAutoRefresh.ts'
import { getFlipkartRank, type FlipkartRank } from './api.ts'

export default function FlipkartRankPage() {
  const [data, setData] = useState<FlipkartRank | null>(null)
  const [error, setError] = useState<string | null>(null)
  useAutoRefresh(() => { getFlipkartRank().then(setData).catch((e) => setError(String(e))) }, [], 60_000)

  if (error) return <Card className="text-brick">Could not reach FK-Pulse's API on port 8600 — is it running? ({error})</Card>
  if (!data) return <Card className="text-stone">Loading…</Card>

  return (
    <div className="space-y-4">
      <PageHeader title="Flipkart — Rank Tracker" subtitle={`${data.keywords.length} tracked keywords, ${data.history.length} readings.`} />
      <Card>
        <h2 className="mb-2 text-sm font-semibold text-ink">Latest position per keyword</h2>
        <table className="w-full text-xs">
          <thead className="text-left text-stone"><tr><th className="pb-1 pr-3">FSN</th><th className="pb-1 pr-3">Keyword</th><th className="pb-1 pr-3">Position</th><th className="pb-1 pr-3">Page</th><th className="pb-1 pr-3">SERP median ₹</th><th className="pb-1">Fetched at</th></tr></thead>
          <tbody>
            {data.latest.map((r, i) => (
              <tr key={i} className="border-t border-sand">
                <td className="py-1.5 pr-3 text-stone">{r.fsn}</td>
                <td className="py-1.5 pr-3 font-medium text-ink">{r.keyword}</td>
                <td className="py-1.5 pr-3">{r.position}</td>
                <td className="py-1.5 pr-3">{r.page}</td>
                <td className="py-1.5 pr-3">{r.serp_median_price ?? '—'}</td>
                <td className="py-1.5 text-stone">{r.fetched_at.replace('T', ' ')}</td>
              </tr>
            ))}
            {data.latest.length === 0 && <tr><td className="py-2 text-sm text-stone" colSpan={6}>No rank data read yet.</td></tr>}
          </tbody>
        </table>
      </Card>
      <Card>
        <h2 className="mb-2 text-sm font-semibold text-ink">Tracked keywords</h2>
        <table className="w-full text-xs">
          <thead className="text-left text-stone"><tr><th className="pb-1 pr-3">Title</th><th className="pb-1 pr-3">FSN</th><th className="pb-1">Keyword</th></tr></thead>
          <tbody>
            {data.keywords.map((k) => (
              <tr key={k.id} className="border-t border-sand">
                <td className="py-1.5 pr-3 font-medium text-ink">{k.title ?? '—'}</td>
                <td className="py-1.5 pr-3 text-stone">{k.fsn}</td>
                <td className="py-1.5">{k.keyword}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
