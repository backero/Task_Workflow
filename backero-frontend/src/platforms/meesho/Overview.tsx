import { useState } from 'react'
import axios from 'axios'
import Card, { PageHeader } from '../../components/Card.tsx'
import AiText from '../../components/AiText.tsx'
import StatusDot from '../../components/StatusDot.tsx'
import LastFetched from '../../components/LastFetched.tsx'
import SectionHeader from '../../components/SectionHeader.tsx'
import { useAutoRefresh } from '../../hooks/useAutoRefresh.ts'
import { getMeeshoOverview, getMeeshoAiInsights, getMeeshoRobot, getMeeshoAlerts, type MeeshoOverview, type AiInsight, type MeeshoRobot } from './api.ts'
import { StatTile, TrendLineChart, PlatformBarChart, SeverityBreakdownChart, PriorityBarChart } from '../../components/charts/index.ts'
import { PLATFORM_COLORS } from '../../theme/colors.ts'

const SEV_COLOR: Record<string, 'green' | 'amber' | 'red'> = { critical: 'red', warning: 'amber', info: 'green' }

function Tile({ label, value }: { label: string; value: string | number }) {
  return <StatTile label={label} value={value} format="raw" accentColor={PLATFORM_COLORS.meesho} />
}

export default function MeeshoOverviewPage() {
  const [data, setData] = useState<MeeshoOverview | null>(null)
  const [ai, setAi] = useState<AiInsight[]>([])
  const [robot, setRobot] = useState<MeeshoRobot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [trend, setTrend] = useState<any>(null)
  const [profitability, setProfitability] = useState<any>(null)
  const [nativeAlerts, setNativeAlerts] = useState<{ critical: number; warning: number; info: number } | null>(null)
  const [insightsSummary, setInsightsSummary] = useState<any>(null)
  const [recommendations, setRecommendations] = useState<any[]>([])
  const [historical, setHistorical] = useState<any>(null)

  useAutoRefresh(() => {
    getMeeshoOverview().then(setData).catch((e) => setError(String(e)))
    getMeeshoAiInsights().then(setAi).catch(() => {})
    getMeeshoRobot().then(setRobot).catch(() => {})
    axios.get('/v1/trends/meesho?days=30').then((r) => setTrend(r.data)).catch(() => {})
    axios.get('/v1/profitability/summary?marketplace=meesho').then((r) => setProfitability(r.data?.summary)).catch(() => {})
    getMeeshoAlerts().then((rows) => {
      const open = rows.filter((r) => !r.acknowledged)
      setNativeAlerts({
        critical: open.filter((r) => r.severity === 'critical').length,
        warning: open.filter((r) => r.severity === 'warning').length,
        info: open.filter((r) => r.severity === 'info').length,
      })
    }).catch(() => {})
    axios.get('/v1/insights/summary?marketplace=meesho').then((r) => setInsightsSummary(r.data)).catch(() => {})
    axios.get('/v1/recommendations/action-plan?marketplace=meesho').then((r) => setRecommendations(r.data?.recommendations || [])).catch(() => {})
    axios.get('/v1/dashboard/platform-comparison?days=90').then((r) => setHistorical(r.data?.platforms?.meesho)).catch(() => {})
  }, [], 60_000)

  if (error) return <Card className="text-brick">Could not reach Meesho's app on port 8000 — is it running? ({error})</Card>
  if (!data) return <Card className="text-stone">Loading Meesho overview…</Card>

  const { kpis } = data
  const panelRead = robot?.jobs.find((j) => j.id === 'panel_read')
  return (
    <div className="space-y-5">
      <PageHeader title="Meesho — Overview" subtitle="Read straight from Meesho's own app (port 8000) — the same real numbers its own dashboard shows." />
      <LastFetched label="Last real data fetch (panel_read)" iso={panelRead?.last_run} />

      <SectionHeader title="Unified Snapshot" to="/meesho/unified" />
      <div className="grid grid-cols-4 gap-3">
        <Tile label="Listings" value={kpis.listings} />
        <Tile label="Live" value={kpis.live} />
        <Tile label="Blocked" value={kpis.blocked} />
        <Tile label="Total views" value={kpis.impressions_7d.toLocaleString('en-IN')} />
        <Tile label="Total clicks" value={kpis.clicks_7d ?? 'n/a'} />
        <Tile label="Total orders" value={kpis.orders_7d} />
        <Tile label="Conversion rate" value={kpis.conversion_pct_7d != null ? `${kpis.conversion_pct_7d}%` : 'n/a'} />
        <Tile label="Total sales" value={kpis.sales_7d != null ? `₹${kpis.sales_7d.toLocaleString('en-IN')}` : 'n/a'} />
        <Tile label="Avg quality score" value={kpis.avg_quality_score || 'N/A'} />
        <Tile label="Avg rating" value={kpis.avg_rating} />
        <Tile label="Critical alerts" value={kpis.open_critical_alerts} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card>
          <SectionHeader title="Trends — Revenue (30 days)" to="/meesho/trends" />
          <TrendLineChart
            data={trend?.data || []}
            series={[{ key: 'revenue', label: 'Revenue', color: PLATFORM_COLORS.meesho }]}
            yFormat={(v) => `₹${v.toLocaleString('en-IN')}`}
            height={200}
          />
        </Card>
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-ink">Listings Health</h2>
          <PlatformBarChart
            data={[
              { platformId: 'live', label: 'Live', value: kpis.live },
              { platformId: 'blocked', label: 'Blocked', value: kpis.blocked },
            ]}
            colorMap={{ live: '#6b8f5a', blocked: '#c05a3d' }}
            height={200}
          />
        </Card>
      </div>

      <Card>
        <SectionHeader title="Alerts" to="/meesho/alerts" />
        <div className="grid grid-cols-3 gap-3 mb-3">
          <StatTile label="Critical" value={nativeAlerts?.critical || 0} format="number" accentColor="#c05a3d" />
          <StatTile label="Warnings" value={nativeAlerts?.warning || 0} format="number" accentColor="#d9a441" />
          <StatTile label="Info" value={nativeAlerts?.info || 0} format="number" accentColor="#6b8f5a" />
        </div>
        {nativeAlerts && <SeverityBreakdownChart data={[{ label: 'Meesho', critical: nativeAlerts.critical, warning: nativeAlerts.warning, info: nativeAlerts.info }]} height={80} />}
      </Card>

      <Card>
        <SectionHeader title="Analytics — 30-Day Profitability" to="/meesho/analytics" />
        <div className="grid grid-cols-4 gap-3">
          <StatTile label="Revenue" value={profitability?.total_revenue || 0} format="currency" accentColor={PLATFORM_COLORS.meesho} />
          <StatTile label="Net Profit" value={profitability?.total_profit || 0} format="currency" accentColor={PLATFORM_COLORS.meesho} />
          <StatTile label="Ad Spend" value={profitability?.total_ad_spend || 0} format="currency" accentColor={PLATFORM_COLORS.meesho} />
          <StatTile label="Avg Margin" value={profitability?.avg_margin_pct || 0} format="percent" accentColor={PLATFORM_COLORS.meesho} />
        </div>
      </Card>

      <Card>
        <SectionHeader title="Recommendations" to="/meesho/recommendations" />
        {recommendations.length > 0 ? (
          <PriorityBarChart data={recommendations.map((r) => ({ id: r.id, label: r.title, score: r.priority_score || 0, priority: r.priority }))} height={180} />
        ) : (
          <p className="text-sm text-stone">No recommendations yet.</p>
        )}
      </Card>

      <Card>
        <SectionHeader title="Historical — Orders (90 days)" to="/meesho/historical" />
        <TrendLineChart
          data={historical?.trend_data || []}
          series={[{ key: 'orders', label: 'Orders', color: PLATFORM_COLORS.meesho }]}
          height={200}
        />
      </Card>

      <Card>
        <SectionHeader title="Insights" to="/meesho/insights" />
        <div className="grid grid-cols-3 gap-3">
          <StatTile label="High Priority" value={insightsSummary?.recommendations_summary?.high_priority || 0} format="number" accentColor="#c05a3d" />
          <StatTile label="In Progress" value={insightsSummary?.recommendations_summary?.in_progress || 0} format="number" />
          <StatTile label="Completed" value={insightsSummary?.recommendations_summary?.completed || 0} format="number" accentColor="#6b8f5a" />
        </div>
      </Card>

      <Card>
        <h2 className="mb-1 text-sm font-semibold text-ink">AI strategic analysis</h2>
        {ai.length === 0 ? (
          <p className="text-sm text-stone">No analysis yet — it runs after Meesho's next real data read.</p>
        ) : (
          <>
            <p className="mb-2 text-xs text-stone">Claude's read on the real numbers above, as of {ai[0].ts.replace('T', ' ')}.</p>
            <div className="text-sm text-ink"><AiText text={ai[0].summary} /></div>
          </>
        )}
      </Card>

      <Card>
        <h2 className="mb-2 text-sm font-semibold text-ink">Top issues ({kpis.open_recs} open)</h2>
        <ul className="space-y-2">
          {data.top_issues.map((i) => (
            <li key={i.id} className="flex items-start gap-2 text-sm">
              <span className="mt-1"><StatusDot status={SEV_COLOR[i.severity] ?? 'amber'} /></span>
              <span><span className="font-medium text-ink">{i.code}</span> · {i.message} <span className="text-stone">· {i.ts.replace('T', ' ')}</span></span>
            </li>
          ))}
          {data.top_issues.length === 0 && <li className="text-sm text-stone">No open issues.</li>}
        </ul>
      </Card>
    </div>
  )
}
