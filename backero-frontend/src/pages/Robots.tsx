import { useState } from 'react'
import { getRobot, type Robot, type RobotJob } from '../api.ts'
import Card, { PageHeader } from '../components/Card.tsx'
import StatusDot from '../components/StatusDot.tsx'
import { STATE_COLOR, STATE_TEXT } from '../components/RobotStrip.tsx'
import { useAutoRefresh } from '../hooks/useAutoRefresh.ts'

const OUTCOME: Record<string, { text: string; cls: string }> = {
  ok: { text: 'OK', cls: 'text-green-600' },
  partial: { text: 'Partly done', cls: 'text-amber-600' },
  skipped: { text: 'Skipped', cls: 'text-gray-400' },
  needs_you: { text: 'Needs you', cls: 'text-amber-600' },
  failed: { text: 'Failed', cls: 'text-red-600' },
}

function ago(iso: string | null): string {
  if (!iso) return 'never'
  const m = (Date.now() - new Date(iso).getTime()) / 60_000
  if (Number.isNaN(m)) return iso
  return m < 1 ? 'just now' : m < 120 ? `${Math.round(m)} min ago` : m < 2880 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`
}
function fmt(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })
}
const every = (m: number | null) => (m == null ? '—' : m < 180 ? `${Math.round(m)} min` : `${Math.round((m / 60) * 10) / 10} h`)

function JobRow({ j }: { j: RobotJob }) {
  const o = j.last_status ? OUTCOME[j.last_status] : null
  return (
    <div className={`border-t border-gray-100 py-2 ${j.enabled ? '' : 'opacity-50'}`}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-gray-900">{j.label}</span>
        <span className="whitespace-nowrap text-xs">
          {j.enabled ? (
            <>
              {o ? <span className={`font-semibold ${o.cls}`}>{o.text}</span> : <span className="text-gray-400">No run yet</span>}
              <span className="text-gray-400"> · {fmt(j.last_run) || 'never'} ({ago(j.last_run)})</span>
              {j.overdue && <span className="font-semibold text-red-600"> · OVERDUE</span>}
            </>
          ) : <span className="text-gray-400">no run reported yet (off, or not due yet)</span>}
        </span>
      </div>
      <div className="text-xs text-gray-400">{j.what}{j.every_minutes ? ` Runs every ${every(j.every_minutes)}.` : ''}</div>
      {j.enabled && j.detail && <div className={`mt-0.5 text-xs ${j.last_status === 'ok' ? 'text-gray-400' : 'text-gray-900'}`}>{j.detail}</div>}
    </div>
  )
}

function RobotCard({ r }: { r: Robot }) {
  const bad = r.state === 'error' || r.state === 'silent'
  const warn = r.state === 'needs_you' || r.state === 'attention' || r.state === 'never'
  return (
    <Card>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <StatusDot status={STATE_COLOR[r.state]} />
          <h2 className="text-base font-bold text-gray-900">{r.name}</h2>
          <span className="text-xs text-gray-400">{r.platform}</span>
        </div>
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">{STATE_TEXT[r.state]}</span>
      </div>
      <div className={`mt-2 rounded-lg border px-3 py-2 text-sm ${bad ? 'border-red-500 bg-red-50 text-red-600' : warn ? 'border-amber-400 bg-amber-50 text-amber-600' : 'border-gray-200 bg-gray-50 text-gray-900'}`}>
        {r.message}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-400">
        <span>Last heartbeat: <b className="text-gray-900">{fmt(r.beat) || 'never'}</b> ({ago(r.beat)})</span>
      </div>
      <p className="mt-1 text-xs text-gray-400">{r.how}</p>

      <h3 className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-gray-400">What it does</h3>
      {r.jobs.length === 0 ? <div className="text-sm text-gray-400">Nothing reported yet.</div> : r.jobs.map((j) => <JobRow key={j.id} j={j} />)}

      <h3 className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-gray-400">Recent runs</h3>
      {r.runs.length === 0 ? <div className="text-sm text-gray-400">No runs recorded yet.</div> : (
        <div className="max-h-64 overflow-y-auto">
          <table className="w-full text-xs">
            <tbody>
              {r.runs.slice(0, 15).map((x, i) => {
                const label = r.jobs.find((j) => j.id === x.job)?.label ?? x.job
                const o = OUTCOME[x.status]
                return (
                  <tr key={i} className="border-t border-gray-100 align-top">
                    <td className="whitespace-nowrap py-1 pr-2 text-gray-400">{fmt(x.finished_at) || ago(x.finished_at)}</td>
                    <td className="py-1 pr-2 text-gray-900">{label}</td>
                    <td className={`py-1 pr-2 font-semibold ${o?.cls ?? ''}`}>{o?.text ?? x.status}</td>
                    <td className="py-1 text-gray-400">{x.detail}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

export default function RobotsPage() {
  const [robot, setRobot] = useState<Robot | null>(null)
  const [error, setError] = useState(false)
  useAutoRefresh(() => { getRobot().then((r) => { setRobot(r); setError(false) }).catch(() => setError(true)) }, [], 30_000)

  return (
    <div>
      <PageHeader title="Amazon Robo" subtitle="The worker that collects Amazon data: it checks in every few minutes and reports what every job did and how it ended." />
      {error && <div className="mb-3 rounded-lg border border-red-500 bg-red-50 px-3 py-2 text-sm text-red-600">Could not reach the server — is "MCC Server" running?</div>}
      {!robot ? <div className="text-gray-400">Loading…</div> : <div className="max-w-3xl"><RobotCard r={robot} /></div>}
    </div>
  )
}
