import { useState } from 'react'
import Card, { PageHeader } from '../../components/Card.tsx'
import { useAutoRefresh } from '../../hooks/useAutoRefresh.ts'
import { getJioMartOverview, type JioMartOverview } from './api.ts'
import SectionHeader from '../../components/SectionHeader.tsx'
import { StatTile } from '../../components/charts/index.ts'
import { PLATFORM_COLORS } from '../../theme/colors.ts'

function Tile({ label, value }: { label: string; value: string | number }) {
  return <StatTile label={label} value={value} format="raw" accentColor={PLATFORM_COLORS.jiomart} />
}

export default function JioMartOverviewPage() {
  const [data, setData] = useState<JioMartOverview | null>(null)
  const [error, setError] = useState<string | null>(null)

  useAutoRefresh(() => {
    getJioMartOverview().then(setData).catch((e) => setError(String(e)))
  }, [], 60_000)

  if (error) return <Card className="text-brick">Error loading JioMart data: {error}</Card>
  if (!data) return <Card className="text-stone">Loading JioMart Overview…</Card>

  const m = data.metrics || {}

  return (
    <div className="space-y-5">
      <PageHeader
        title="JioMart — Overview"
        subtitle="Real-time seller metrics from JioMart Seller Hub"
      />

      <SectionHeader title="Key Metrics" />
      <div className="grid grid-cols-4 gap-3">
        <Tile label="Impressions" value={m.impressions?.toLocaleString() || '0'} />
        <Tile label="Clicks" value={m.clicks?.toLocaleString() || '0'} />
        <Tile label="Orders" value={m.orders?.toLocaleString() || '0'} />
        <Tile label="Revenue" value={`₹${(m.revenue || 0).toLocaleString('en-IN')}`} />
      </div>

      <div className="grid grid-cols-4 gap-3">
        <Tile label="CTR %" value={`${(m.ctr_pct || 0).toFixed(2)}%`} />
        <Tile label="CVR %" value={`${(m.cvr_pct || 0).toFixed(2)}%`} />
        <Tile label="Dispatch SLA" value={`${(m.dispatch_sla_met || 0).toFixed(2)}%`} />
        <Tile label="Return Rate" value={`${(m.return_rate || 0).toFixed(2)}%`} />
      </div>

      <Card>
        <h2 className="text-sm font-semibold text-ink mb-3">Seller Hub Status</h2>
        <p className="text-stone text-sm">
          {data.status === 'no_data'
            ? 'No data available. Connect your JioMart seller account to start tracking.'
            : `Last updated: ${new Date(data.timestamp).toLocaleString()}`}
        </p>
      </Card>
    </div>
  )
}
