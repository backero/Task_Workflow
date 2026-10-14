import { useState } from 'react'
import Card, { PageHeader } from '../../components/Card.tsx'
import StatusDot from '../../components/StatusDot.tsx'
import { useAutoRefresh } from '../../hooks/useAutoRefresh.ts'
import { getMeeshoRecommendations, markMeeshoRecommendationDone, type MeeshoRecommendation } from './api.ts'

const PRIORITY_COLOR: Record<string, 'green' | 'amber' | 'red'> = { high: 'red', medium: 'amber', low: 'green' }

export default function MeeshoRecommendationsPage() {
  const [rows, setRows] = useState<MeeshoRecommendation[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<number | null>(null)

  const load = () => { getMeeshoRecommendations().then(setRows).catch((e) => setError(String(e))) }
  useAutoRefresh(load, [], 60_000)

  const markDone = async (id: number) => {
    setBusy(id)
    try { await markMeeshoRecommendationDone(id); load() } finally { setBusy(null) }
  }

  if (error) return <Card className="text-brick">Could not reach Meesho's app on port 8000 — is it running? ({error})</Card>
  if (!rows) return <Card className="text-stone">Loading…</Card>

  return (
    <div className="space-y-4">
      <PageHeader title="Meesho — Recommendations" subtitle={`${rows.length} open recommendation${rows.length === 1 ? '' : 's'}, from real panel data.`} />
      <div className="space-y-3">
        {rows.map((r) => (
          <Card key={r.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2">
                <span className="mt-1"><StatusDot status={PRIORITY_COLOR[r.priority] ?? 'amber'} /></span>
                <div>
                  <div className="font-medium text-ink">{r.title} <span className="text-xs text-stone">· {r.code}</span></div>
                  {r.listing_name && <div className="text-xs text-stone">{r.listing_name}</div>}
                  <p className="mt-1 text-sm text-ink">{r.reason}</p>
                  <p className="mt-1 text-sm"><span className="font-medium text-ink">Do this:</span> <span className="text-stone">{r.action}</span></p>
                  <p className="mt-1 text-xs text-stone">Source: {r.source} · {r.ts.replace('T', ' ')}</p>
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
