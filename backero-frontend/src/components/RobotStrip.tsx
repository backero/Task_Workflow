import { useState } from 'react'
import { Link } from 'react-router-dom'
import { getRobot, type Robot, type RobotState } from '../api.ts'
import { useAutoRefresh } from '../hooks/useAutoRefresh.ts'
import StatusDot from './StatusDot.tsx'

export const STATE_TEXT: Record<RobotState, string> = {
  healthy: 'Healthy', attention: 'Partly working', needs_you: 'Needs you', error: 'Problem', silent: 'Not running', never: 'Never started',
}
export const STATE_COLOR: Record<RobotState, 'green' | 'amber' | 'red'> = {
  healthy: 'green', attention: 'amber', needs_you: 'amber', error: 'red', silent: 'red', never: 'amber',
}

/** Always-visible pulse of Amazon Robo in the sidebar, so a stopped or stuck robot is noticed without opening a page. */
export default function RobotStrip() {
  const [r, setR] = useState<Robot | null>(null)
  useAutoRefresh(() => { getRobot().then(setR).catch(() => setR(null)) }, [], 30_000)
  if (!r) return null
  return (
    <Link to="/amazon/robots" className="mb-4 block rounded-lg border border-gray-200 bg-white px-3 py-2 hover:bg-gray-50" title="Open the Robots page">
      <div className="flex items-center justify-between py-0.5 text-xs">
        <span className="flex items-center gap-2 font-medium text-gray-900"><StatusDot status={STATE_COLOR[r.state]} />{r.name}</span>
        <span className="text-gray-400">{STATE_TEXT[r.state]}</span>
      </div>
    </Link>
  )
}
