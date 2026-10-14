import { useState } from 'react'
import Card, { PageHeader } from '../../components/Card.tsx'
import StatusDot from '../../components/StatusDot.tsx'
import { useAutoRefresh } from '../../hooks/useAutoRefresh.ts'
import { getSnapdealAlerts, resolveSnapdealAlert, type SnapdealAlert } from './api.ts'

const SEV_COLOR: Record<string, 'green' | 'amber' | 'red'> = { critical: 'red', warning: 'amber', info: 'green' }

export default function SnapdealRecommendationsPage() {
  const [rows, setRows] = useState<SnapdealAlert[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<number | null>(null)

  const load = () => { getSnapdealAlerts('open').then(setRows).catch((e) => setError(String(e))) }
  useAutoRefresh(load, [], 60_000)

  const resolve = async (id: number) => {
    setBusy(id)
    try { await resolveSnapdealAlert(id); load() } finally { setBusy(null) }
  }

  if (error) return <Card className="text-brick">Could not reach Snapdeal's app on port 8300 — is it running? ({error})</Card>
  if (!rows) return <Card className="text-stone">Loading…</Card>

  return (
    <div className="space-y-4">
      <PageHeader title="Snapdeal — Recommendations" subtitle={`${rows.length} open alert${rows.length === 1 ? '' : 's'}, from real audits.`} />
      <div className="space-y-3">
        {rows.map((a) => (
          <Card key={a.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2">
                <span className="mt-1"><StatusDot status={SEV_COLOR[a.severity] ?? 'amber'} /></span>
                <div>
                  <div className="font-medium text-ink">{a.title} <span className="text-xs text-stone">· {a.code}</span></div>
                  <div className="text-xs text-stone">{a.module} · {a.entity} · {a.ts.replace('T', ' ')}</div>
                  <p className="mt-1 text-sm"><span className="font-medium text-ink">Why:</span> <span className="text-stone">{a.reason}</span></p>
                  <p className="mt-1 text-sm"><span className="font-medium text-ink">Do this:</span> <span className="text-stone">{a.fix}</span></p>
                  <p className="mt-1 text-xs text-stone">Evidence: {a.source}</p>
                </div>
              </div>
              <button
                onClick={() => resolve(a.id)}
                disabled={busy === a.id}
                className="shrink-0 rounded-lg bg-sand px-3 py-1.5 text-xs font-medium text-ink hover:bg-clay hover:text-white disabled:opacity-50"
              >
                {busy === a.id ? 'Marking…' : 'Mark done'}
              </button>
            </div>
          </Card>
        ))}
        {rows.length === 0 && <Card className="text-sm text-stone">No open alerts — every monitored marker is inside thresholds.</Card>}
      </div>
    </div>
  )
}
