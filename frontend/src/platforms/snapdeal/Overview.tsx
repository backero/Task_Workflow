import { useState } from 'react'
import axios from 'axios'
import Card, { PageHeader } from '../../components/Card.js'
import { useAutoRefresh } from '../../hooks/useAutoRefresh.js'
import { getSnapdealOverview, getSnapdealAiInsights, type SnapdealOverview, type AiInsight } from './api.js'
import AiText from '../../components/AiText.js'
import SectionHeader from '../../components/SectionHeader.js'
import { StatTile, TrendLineChart, PlatformBarChart, SeverityBreakdownChart, PriorityBarChart } from '../../components/charts/index.js'
import { PLATFORM_COLORS } from '../../theme/colors.js'

function Tile({ label, value }: { label: string; value: string | number }) {
  return <StatTile label={label} value={value} format="raw" accentColor={PLATFORM_COLORS.snapdeal} />
}

export default function SnapdealOverviewPage() {
  const [data, setData] = useState<SnapdealOverview | null>(null)
  const [ai, setAi] = useState<AiInsight[]>([])
  const [error, setError] = useState<string | null>(null)
  const [trend, setTrend] = useState<any>(null)
  const [profitability, setProfitability] = useState<any>(null)
  const [alertStats, setAlertStats] = useState<any>(null)
  const [insightsSummary, setInsightsSummary] = useState<any>(null)
  const [recommendations, setRecommendations] = useState<any[]>([])
  const [historical, setHistorical] = useState<any>(null)

  useAutoRefresh(() => {
    getSnapdealOverview().then(setData).catch((e) => setError(String(e)))
    getSnapdealAiInsights().then(setAi).catch(() => {})
    axios.get('/v1/trends/snapdeal?days=30').then((r) => setTrend(r.data)).catch(() => {})
    axios.get('/v1/profitability/summary?marketplace=snapdeal').then((r) => setProfitability(r.data?.summary)).catch(() => {})
    axios.get('/v1/alerts/stats?marketplace=snapdeal').then((r) => setAlertStats(r.data?.stats)).catch(() => {})
    axios.get('/v1/insights/summary?marketplace=snapdeal').then((r) => setInsightsSummary(r.data)).catch(() => {})
    axios.get('/v1/recommendations/action-plan?marketplace=snapdeal').then((r) => setRecommendations(r.data?.recommendations || [])).catch(() => {})
    axios.get('/v1/dashboard/platform-comparison?days=90').then((r) => setHistorical(r.data?.platforms?.snapdeal)).catch(() => {})
  }, [], 60_000)

  if (error) return <Card className="text-brick">Could not reach Snapdeal's app on port 8300 — is it running? ({error})</Card>
  if (!data) return <Card className="text-stone">Loading Snapdeal overview…</Card>

  const noTraffic = data.week.impressions === 0 && data.week.orders === 0
  const panel = data.panel ?? null
  const num = (k: string) => (panel && typeof panel[k] === 'number' ? (panel[k] as number) : null)

  return (
    <div className="space-y-5">
      <PageHeader title="Snapdeal — Overview" subtitle="Read straight from Snapdeal's own app (port 8300) — real listing and order data." />

      <SectionHeader title="Unified Snapshot" to="/snapdeal/unified" />
      <div className="grid grid-cols-4 gap-3">
        <Tile label="Listings" value={data.listings} />
        <Tile label="Live" value={data.live} />
        <Tile label="Out of Stock" value={data.oos} />
        <Tile label="Critical Alerts" value={data.open_alerts?.critical || 0} />
        <Tile label="Impressions (week)" value={data.week.impressions.toLocaleString('en-IN')} />
        <Tile label="Clicks (week)" value={data.week.clicks} />
        <Tile label="Orders (week)" value={data.week.orders} />
        <Tile label="Revenue (week)" value={`₹${data.week.revenue.toLocaleString('en-IN')}`} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card>
          <SectionHeader title="Trends — Revenue (30 days)" to="/snapdeal/trends" />
          <TrendLineChart
            data={trend?.data || []}
            series={[{ key: 'revenue', label: 'Revenue', color: PLATFORM_COLORS.snapdeal }]}
            yFormat={(v) => `₹${v.toLocaleString('en-IN')}`}
            height={200}
          />
        </Card>
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-ink">Listings Health</h2>
          <PlatformBarChart
            data={[
              { platformId: 'live', label: 'Live', value: data.live },
              { platformId: 'oos', label: 'Out of Stock', value: data.oos },
            ]}
            colorMap={{ live: '#6b8f5a', oos: '#d9a441' }}
            height={200}
          />
        </Card>
      </div>

      {panel && (
        <Card>
          <h2 className="mb-1 text-sm font-semibold text-ink">Seller Panel dashboard (real numbers read from Snapdeal)</h2>
          <p className="mb-3 text-xs text-stone">As read at {String(panel.captured_at).replace('T', ' ')} — the period is whatever Snapdeal's own dashboard shows.</p>
          <div className="grid grid-cols-4 gap-3">
            <Tile label="Orders booked" value={num('orders_booked') ?? '—'} />
            <Tile label="Orders processed" value={num('orders_processed') ?? '—'} />
            <Tile label="Orders returned" value={num('orders_returned') ?? '—'} />
            <Tile label="Sales completed" value={num('sales_completed') != null ? `₹${num('sales_completed')!.toLocaleString('en-IN')}` : '—'} />
            <Tile label="Sales returned" value={num('sales_returned') != null ? `₹${num('sales_returned')!.toLocaleString('en-IN')}` : '—'} />
            <Tile label="Avg seller rating" value={num('avg_seller_rating') ?? '—'} />
            <Tile label="Account health" value={String(panel.account_health ?? '—')} />
            <Tile label="Order processing" value={String(panel.order_processing_health ?? '—')} />
          </div>
          {num('orders_booked') != null && (
            <div className="mt-4">
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-stone">Order funnel</h3>
              <PlatformBarChart
                data={[
                  { platformId: 'booked', label: 'Booked', value: num('orders_booked') || 0 },
                  { platformId: 'processed', label: 'Processed', value: num('orders_processed') || 0 },
                  { platformId: 'returned', label: 'Returned', value: num('orders_returned') || 0 },
                ]}
                colorMap={{ booked: PLATFORM_COLORS.snapdeal, processed: '#6b8f5a', returned: '#c05a3d' }}
                height={180}
              />
            </div>
          )}
        </Card>
      )}

      {noTraffic && !panel && (
        <Card className="bg-amber-50 border-l-4 border-amber-500">
          <p className="text-sm text-ink">No traffic recorded this week yet — Snapdeal's robot tracks {data.listings} real listings, but order/impression metrics haven't been captured. This is honest zero, not an error.</p>
        </Card>
      )}

      <Card>
        <SectionHeader title="Alerts" to="/snapdeal/alerts" />
        <div className="grid grid-cols-3 gap-3 mb-3">
          <StatTile label="Critical" value={alertStats?.critical || 0} format="number" accentColor="#c05a3d" />
          <StatTile label="Warnings" value={alertStats?.warnings || 0} format="number" accentColor="#d9a441" />
          <StatTile label="Info" value={alertStats?.info || 0} format="number" accentColor="#6b8f5a" />
        </div>
        {alertStats && <SeverityBreakdownChart data={[{ label: 'Snapdeal', critical: alertStats.critical || 0, warning: alertStats.warnings || 0, info: alertStats.info || 0 }]} height={80} />}
      </Card>

      <Card>
        <SectionHeader title="Analytics — 30-Day Profitability" to="/snapdeal/analytics" />
        <div className="grid grid-cols-4 gap-3">
          <StatTile label="Revenue" value={profitability?.total_revenue || 0} format="currency" accentColor={PLATFORM_COLORS.snapdeal} />
          <StatTile label="Net Profit" value={profitability?.total_profit || 0} format="currency" accentColor={PLATFORM_COLORS.snapdeal} />
          <StatTile label="Ad Spend" value={profitability?.total_ad_spend || 0} format="currency" accentColor={PLATFORM_COLORS.snapdeal} />
          <StatTile label="Avg Margin" value={profitability?.avg_margin_pct || 0} format="percent" accentColor={PLATFORM_COLORS.snapdeal} />
        </div>
      </Card>

      <Card>
        <SectionHeader title="Recommendations" to="/snapdeal/recommendations" />
        {recommendations.length > 0 ? (
          <PriorityBarChart data={recommendations.map((r) => ({ id: r.id, label: r.title, score: r.priority_score || 0, priority: r.priority }))} height={180} />
        ) : (
          <p className="text-sm text-stone">No recommendations yet.</p>
        )}
      </Card>

      <Card>
        <SectionHeader title="Historical — Orders (90 days)" to="/snapdeal/historical" />
        <TrendLineChart
          data={historical?.trend_data || []}
          series={[{ key: 'orders', label: 'Orders', color: PLATFORM_COLORS.snapdeal }]}
          height={200}
        />
      </Card>

      <Card>
        <SectionHeader title="Insights" to="/snapdeal/insights" />
        <div className="grid grid-cols-3 gap-3">
          <StatTile label="High Priority" value={insightsSummary?.recommendations_summary?.high_priority || 0} format="number" accentColor="#c05a3d" />
          <StatTile label="In Progress" value={insightsSummary?.recommendations_summary?.in_progress || 0} format="number" />
          <StatTile label="Completed" value={insightsSummary?.recommendations_summary?.completed || 0} format="number" accentColor="#6b8f5a" />
        </div>
      </Card>

      <Card>
        <h2 className="mb-1 text-sm font-semibold text-ink">AI strategic analysis</h2>
        {ai.length === 0 ? (
          <p className="text-sm text-stone">No analysis yet.</p>
        ) : (
          <>
            <p className="mb-2 text-xs text-stone">Claude's read on the real numbers above, as of {ai[0].ts.replace('T', ' ')}.</p>
            <div className="text-sm text-ink"><AiText text={ai[0].summary} /></div>
          </>
        )}
      </Card>
    </div>
  )
}
