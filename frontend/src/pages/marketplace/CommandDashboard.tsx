import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { getCommandDashboard, type CommandDashboard as CommandDashboardT } from '../api'
import Card, { PageHeader } from '../components/Card'
import StatusDot from '../components/StatusDot'
import DataQualityBadge from '../components/DataQualityBadge'
import LastFetched from '../components/LastFetched'
import { useAutoRefresh } from '../hooks/useAutoRefresh'

const roboTitle: Record<string, string> = {
  silent: 'Robo has gone quiet',
  needs_reauth: 'Robo needs you to sign in to Seller Central',
  error: 'Robo reported a problem',
  never: 'Robo has not reported yet',
}

// The ads tiles are empty because there is nothing to measure (or nothing collected) — say which.
const adsHint: Record<string, string> = {
  none: 'No ads running',
  active: 'Ads are running — per-product data not collected yet',
  unknown: 'Ads not checked yet',
}

const noDataHint: Record<string, string> = {
  'Est. Margin': 'Needs COGS — see Products & COGS',
}

function formatValue(value: number, unit: string) {
  if (unit === '₹') return `₹${Math.round(value).toLocaleString('en-IN')}`
  if (unit === 'pct') return `${(value * 100).toFixed(1)}%`
  return Math.round(value).toLocaleString('en-IN')
}

export default function CommandDashboard() {
  const [data, setData] = useState<CommandDashboardT | null>(null)
  const [error, setError] = useState<string | null>(null)

  useAutoRefresh(() => {
    getCommandDashboard().then(setData).catch((e) => setError(String(e)))
  }, [])

  if (error) return <div className="text-brick">Failed to load: {error}</div>
  if (!data) return <div className="text-stone">Loading…</div>

  return (
    <div>
      <PageHeader title="Command Dashboard" subtitle={data.as_of ? `As of ${data.as_of} · 7-day window vs prior 7 days` : 'No data yet'} />
      <LastFetched label="Last robo heartbeat" iso={data.robo?.last_seen_at} />

      {data.robo && data.robo.state !== 'healthy' && (
        <div className="mb-3 rounded-lg border border-brick bg-brick-light px-4 py-2 text-sm text-brick-dark">
          <span className="font-semibold">{roboTitle[data.robo.state]}</span>
          {data.robo.message && <span> — {data.robo.message}</span>}
        </div>
      )}
      {data.account_health && (data.account_health.at_risk === 1) && (
        <div className="mb-3 rounded-lg border border-brick bg-brick-light px-4 py-2 text-sm text-brick-dark">
          <span className="font-semibold">Account health: seller-fulfilled offers are at risk of deactivation</span>
          {' — '}order defects {data.account_health.odr_fbm_pct}% (limit {data.account_health.odr_target_pct}%), late dispatch {data.account_health.late_dispatch_pct}% (limit {data.account_health.late_dispatch_target_pct}%), cancellations {data.account_health.cancel_pct}% (limit {data.account_health.cancel_target_pct}%).{' '}
          <Link to="/amazon/inventory" className="font-semibold underline">See details</Link>
        </div>
      )}
      {data.cogs && data.cogs.missing + data.cogs.estimate + data.cogs.stale > 0 && (
        <div className="mb-3 rounded-lg border border-sand bg-white px-4 py-2 text-sm text-ink">
          COGS needs attention for {data.cogs.missing + data.cogs.estimate + data.cogs.stale} of {data.cogs.total} products
          ({data.cogs.missing} missing{data.cogs.stale > 0 ? `, ${data.cogs.stale} older than 90 days` : ''}) — margin and the ad-bleed alert depend on it.{' '}
          <Link to="/amazon/products" className="font-semibold text-ember underline">Enter COGS</Link>
        </div>
      )}

      <div className="mb-5 flex gap-3">
        <Card className="flex items-center gap-2 !py-2">
          <StatusDot status="red" />
          <span className="text-sm font-semibold">{data.rule_status.red} red alerts</span>
        </Card>
        <Card className="flex items-center gap-2 !py-2">
          <StatusDot status="amber" />
          <span className="text-sm font-semibold">{data.rule_status.amber} amber alerts</span>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.tiles.map((tile) => (
          <Card key={tile.label}>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-stone">{tile.label}</span>
              <StatusDot status={tile.status} />
            </div>
            {tile.no_data ? (
              <>
                <div className="text-2xl font-bold text-stone">No data</div>
                <div className="mt-1 text-xs text-stone">{['CTR', 'ACOS', 'TACOS'].includes(tile.label) ? adsHint[data.ads?.state ?? 'unknown'] : (noDataHint[tile.label] ?? 'Not collected yet')}</div>
              </>
            ) : (
              <div className="text-2xl font-bold text-ink">{formatValue(tile.value, tile.unit)}</div>
            )}
            <div className="mt-1 flex items-center gap-2">
              {tile.wow_change != null && (
                <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${tile.wow_change >= 0 ? 'text-leaf-dark' : 'text-brick-dark'}`}>
                  {tile.wow_change >= 0 ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                  {Math.abs(tile.wow_change * 100).toFixed(1)}% WoW
                </span>
              )}
              <DataQualityBadge quality={tile.data_quality} />
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
