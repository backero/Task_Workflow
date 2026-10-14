import { useState } from 'react'
import Card, { PageHeader } from '../../components/Card.js'
import StatusDot from '../../components/StatusDot.js'
import { useAutoRefresh } from '../../hooks/useAutoRefresh.js'
import { getMeeshoAlerts, ackMeeshoAlert, type MeeshoAlert } from './api.js'
import { StatTile, SeverityBreakdownChart } from '../../components/charts/index.js'

const SEV_COLOR: Record<string, 'green' | 'amber' | 'red'> = { critical: 'red', warning: 'amber', info: 'green' }

export default function MeeshoAlertsPage() {
  const [rows, setRows] = useState<MeeshoAlert[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<number | null>(null)

  const load = () => { getMeeshoAlerts().then(setRows).catch((e) => setError(String(e))) }
  useAutoRefresh(load, [], 60_000)

  const ack = async (id: number) => {
    setBusy(id)
    try { await ackMeeshoAlert(id); load() } finally { setBusy(null) }
  }

  if (error) return <Card className="text-brick">Could not reach Meesho's app on port 8000 — is it running? ({error})</Card>
  if (!rows) return <Card className="text-stone">Loading…</Card>

  const open = rows.filter((r) => !r.acknowledged)
  const acked = rows.filter((r) => r.acknowledged)
  const critical = open.filter((r) => r.severity === 'critical').length
  const warning = open.filter((r) => r.severity === 'warning').length
  const info = open.filter((r) => r.severity === 'info').length

  return (
    <div className="space-y-4">
      <PageHeader title="Meesho — Alerts" subtitle={`${open.length} unacknowledged, ${acked.length} acknowledged.`} />
      {open.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <StatTile label="Critical" value={critical} format="number" accentColor="#c05a3d" />
            <StatTile label="Warning" value={warning} format="number" accentColor="#d9a441" />
            <StatTile label="Info" value={info} format="number" accentColor="#6b8f5a" />
          </div>
          <Card>
            <h2 className="mb-3 text-sm font-semibold text-ink">Severity Breakdown</h2>
            <SeverityBreakdownChart data={[{ label: 'Meesho', critical, warning, info }]} height={90} />
          </Card>
        </>
      )}
      <div className="space-y-3">
        {open.map((a) => (
          <Card key={a.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2">
                <span className="mt-1"><StatusDot status={SEV_COLOR[a.severity] ?? 'amber'} /></span>
                <div>
                  <div className="font-medium text-ink">{a.code} <span className="text-xs text-stone">· listing #{a.listing_id}</span></div>
                  <p className="mt-1 text-sm text-ink">{a.message}</p>
                  <p className="mt-1 text-xs text-stone">{a.ts.replace('T', ' ')}</p>
                </div>
              </div>
              <button
                onClick={() => ack(a.id)}
                disabled={busy === a.id}
                className="shrink-0 rounded-lg bg-sand px-3 py-1.5 text-xs font-medium text-ink hover:bg-clay hover:text-white disabled:opacity-50"
              >
                {busy === a.id ? 'Acking…' : 'Acknowledge'}
              </button>
            </div>
          </Card>
        ))}
        {open.length === 0 && <Card className="text-sm text-stone">No unacknowledged alerts.</Card>}
      </div>
      {acked.length > 0 && (
        <details className="rounded-xl border border-sand bg-white p-4">
          <summary className="cursor-pointer text-sm font-semibold text-ink">Acknowledged ({acked.length})</summary>
          <div className="mt-3 space-y-2">
            {acked.map((a) => (
              <div key={a.id} className="text-sm text-stone">
                <StatusDot status={SEV_COLOR[a.severity] ?? 'amber'} /> {a.code} · {a.message} · {a.ts.replace('T', ' ')}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
