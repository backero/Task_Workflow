import { useState } from 'react'
import Card, { PageHeader } from '../../components/Card.tsx'
import { useAutoRefresh } from '../../hooks/useAutoRefresh.ts'
import { getMeeshoSourcesStatus, type MeeshoSourcesStatus } from './api.ts'

export default function MeeshoSourcesPage() {
  const [s, setS] = useState<MeeshoSourcesStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  useAutoRefresh(() => { getMeeshoSourcesStatus().then(setS).catch((e) => setError(String(e))) }, [], 30_000)

  if (error) return <Card className="text-brick">Could not reach Meesho's app on port 8000 — is it running? ({error})</Card>
  if (!s) return <Card className="text-stone">Loading…</Card>

  return (
    <div className="space-y-4">
      <PageHeader title="Meesho — Sources" subtitle="Where the data comes from and the last events recorded." />
      <Card>
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div><span className="text-stone">Mode:</span> <span className="font-semibold text-ink">{s.mode}</span></div>
          <div><span className="text-stone">Session:</span> <span className="font-semibold text-ink">{s.session_exists ? 'signed in' : 'not signed in'}</span></div>
          <div><span className="text-stone">Status:</span> <span className="font-semibold text-ink">{s.ok ? 'ok' : 'error'}</span></div>
        </div>
      </Card>
      <Card>
        <h2 className="mb-2 text-sm font-semibold text-ink">Recent events</h2>
        <table className="w-full text-xs">
          <tbody>
            {s.last_events.map((e) => (
              <tr key={e.id} className="border-t border-sand">
                <td className="py-1.5 pr-3 text-stone">{e.ts.replace('T', ' ')}</td>
                <td className="py-1.5 pr-3 font-medium text-ink">{e.source}</td>
                <td className="py-1.5 pr-3">{e.status}</td>
                <td className="py-1.5 text-stone">{e.detail}</td>
              </tr>
            ))}
            {s.last_events.length === 0 && (
              <tr><td className="py-2 text-sm text-stone">No events recorded yet.</td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
