import { useState } from 'react'
import Card, { PageHeader } from '../../components/Card.js'
import StatusDot from '../../components/StatusDot.js'
import { useAutoRefresh } from '../../hooks/useAutoRefresh.js'
import { getFlipkartRecommendations, markFlipkartRecommendationDone, type FlipkartRecommendation } from './api.js'

const SEV_COLOR: Record<string, 'green' | 'amber' | 'red'> = { high: 'red', medium: 'amber', low: 'green' }

export default function FlipkartRecommendationsPage() {
  const [rows, setRows] = useState<FlipkartRecommendation[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<number | null>(null)

  const load = () => { getFlipkartRecommendations().then(setRows).catch((e) => setError(String(e))) }
  useAutoRefresh(load, [], 60_000)

  const markDone = async (id: number) => {
    setBusy(id)
    try { await markFlipkartRecommendationDone(id); load() } finally { setBusy(null) }
  }

  if (error) return <Card className="text-brick">Could not reach FK-Pulse's API on port 8600 — is it running? ({error})</Card>
  if (!rows) return <Card className="text-stone">Loading…</Card>

  return (
    <div className="space-y-4">
      <PageHeader title="Flipkart — Recommendations" subtitle={`${rows.length} open recommendation${rows.length === 1 ? '' : 's'}.`} />
      <div className="space-y-3">
        {rows.map((r) => (
          <Card key={r.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2">
                <span className="mt-1"><StatusDot status={SEV_COLOR[r.severity] ?? 'amber'} /></span>
                <div>
                  <div className="font-medium text-ink">{r.title} <span className="text-xs text-stone">· {r.rule_id}</span></div>
                  {r.fsn && <div className="text-xs text-stone">{r.fsn}</div>}
                  <p className="mt-1 text-sm text-ink">{r.detail}</p>
                  <p className="mt-1 text-xs text-stone">{r.scope} · {r.created_at.replace('T', ' ')}</p>
                </div>
              </div>
              <button
                onClick={() => markDone(r.id)}
                disabled={busy === r.id}
                className="shrink-0 rounded-lg bg-sand px-3 py-1.5 text-xs font-medium text-ink hover:bg-clay hover:text-white disabled:opacity-50"
              >
                {busy === r.id ? 'Marking…' : 'Mark done'}
              </button>
            </div>
          </Card>
        ))}
        {rows.length === 0 && <Card className="text-sm text-stone">No open recommendations.</Card>}
      </div>
    </div>
  )
}
