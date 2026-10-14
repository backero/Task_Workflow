import { useState } from 'react'
import Card, { PageHeader } from '../../components/Card.js'
import StatusDot from '../../components/StatusDot.js'
import { useAutoRefresh } from '../../hooks/useAutoRefresh.js'
import { getFlipkartRobot, type FlipkartRobot } from './api.js'

const STATE_COLOR: Record<string, 'green' | 'amber' | 'red'> = {
  healthy: 'green', attention: 'amber', needs_you: 'amber', error: 'red', demo: 'amber',
}

function fmt(iso: string | null | undefined): string {
  if (!iso) return 'never'
  return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })
}

export default function FlipkartRobotPage() {
  const [r, setR] = useState<FlipkartRobot | null>(null)
  const [error, setError] = useState<string | null>(null)
  useAutoRefresh(() => { getFlipkartRobot().then(setR).catch((e) => setError(String(e))) }, [], 30_000)

  if (error) return <Card className="text-brick">Could not reach FK-Pulse's API on port 8600 — is it running? ({error})</Card>
  if (!r) return <Card className="text-stone">Loading…</Card>

  return (
    <div className="space-y-5">
      <PageHeader title="Flipkart Robo" subtitle="hubkeeper - the browser window that stays signed into Seller Hub and reads real data." />
      <Card>
        <div className="flex items-center gap-2 text-lg font-semibold text-ink"><StatusDot status={STATE_COLOR[r.state] ?? 'amber'} />{r.state}</div>
        <p className="mt-1 text-sm text-stone">{r.message}</p>
        <p className="mt-2 text-xs text-stone">Started: {fmt(r.started_at)} · Last heartbeat: {fmt(r.beat)}</p>
      </Card>
      <Card>
        <h2 className="mb-2 text-sm font-semibold text-ink">Jobs</h2>
        <div className="space-y-2">
          {r.jobs.map((j) => (
            <div key={j.id} className="border-t border-sand pt-2 first:border-0 first:pt-0">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-ink">{j.label}{!j.enabled && <span className="ml-2 text-xs text-stone">(disabled)</span>}</span>
                <span className={j.overdue ? 'text-brick' : 'text-stone'}>{j.last_status ?? 'never run'} · every {j.every_minutes}m{j.overdue ? ' · overdue' : ''}</span>
              </div>
              <p className="text-xs text-stone">{j.what}</p>
              {j.detail && <p className="mt-0.5 text-xs text-ink">{j.detail}</p>}
              <p className="mt-0.5 text-xs text-stone">Last run: {fmt(j.last_run)}{j.duration_s != null ? ` · took ${j.duration_s}s` : ''}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
