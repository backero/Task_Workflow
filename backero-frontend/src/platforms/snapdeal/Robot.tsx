import { useState } from 'react'
import Card, { PageHeader } from '../../components/Card.tsx'
import StatusDot from '../../components/StatusDot.tsx'
import { useAutoRefresh } from '../../hooks/useAutoRefresh.ts'
import { getSnapdealRobot, type SnapdealRobot } from './api.ts'

const STATE_COLOR: Record<string, 'green' | 'amber' | 'red'> = {
  healthy: 'green', attention: 'amber', needs_you: 'amber', error: 'red', demo: 'amber',
}

function fmt(iso: string | null | undefined): string {
  if (!iso) return 'never'
  return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })
}

export default function SnapdealRobotPage() {
  const [r, setR] = useState<SnapdealRobot | null>(null)
  const [error, setError] = useState<string | null>(null)
  useAutoRefresh(() => { getSnapdealRobot().then(setR).catch((e) => setError(String(e))) }, [], 30_000)

  if (error) return <Card className="text-brick">Could not reach Snapdeal's app on port 8300 — is it running? ({error})</Card>
  if (!r) return <Card className="text-stone">Loading…</Card>

  return (
    <div className="space-y-5">
      <PageHeader title="SD Robo" subtitle="snapdeal_keeper - the browser window that stays signed in and reads real data." />
      <Card>
        <div className="flex items-center gap-2 text-lg font-semibold text-ink"><StatusDot status={STATE_COLOR[r.state] ?? 'amber'} />{r.state}</div>
        <p className="mt-1 text-sm text-stone">{r.message}</p>
        <p className="mt-2 text-xs text-stone">Connector: {r.connector} · Started: {fmt(r.started_at)} · Last heartbeat: {fmt(r.beat)}</p>
      </Card>
      <Card>
        <h2 className="mb-2 text-sm font-semibold text-ink">Jobs</h2>
        <div className="space-y-2">
          {r.jobs.map((j) => (
            <div key={j.id} className="border-t border-sand pt-2 first:border-0 first:pt-0">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-ink">{j.label}</span>
                <span className="text-stone">{j.last_status ?? 'never run'} · every {j.every_minutes}m</span>
              </div>
              <p className="text-xs text-stone">{j.what}</p>
              {j.detail && <p className="mt-0.5 text-xs text-ink">{j.detail}</p>}
              <p className="mt-0.5 text-xs text-stone">Last run: {fmt(j.last_run)}</p>
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <h2 className="mb-2 text-sm font-semibold text-ink">Recent runs</h2>
        <table className="w-full text-xs">
          <tbody>
            {r.runs.slice(0, 15).map((run, i) => (
              <tr key={i} className="border-t border-sand">
                <td className="py-1.5 pr-3 text-stone">{fmt(run.finished_at)}</td>
                <td className="py-1.5 pr-3 font-medium text-ink">{run.job}</td>
                <td className="py-1.5 pr-3">{run.status}</td>
                <td className="py-1.5 text-stone">{run.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
