import { useState } from 'react'
import axios from 'axios'
import Card, { PageHeader } from '../../components/Card.tsx'
import { useAutoRefresh } from '../../hooks/useAutoRefresh.ts'
import { getFlipkartOverview, type FlipkartOverview } from './api.ts'
import SectionHeader from '../../components/SectionHeader.tsx'
import { StatTile, TrendLineChart, PlatformBarChart, SeverityBreakdownChart, PriorityBarChart } from '../../components/charts/index.ts'
import { PLATFORM_COLORS } from '../../theme/colors.ts'

function Tile({ label, value }: { label: string; value: string | number }) {
  return <StatTile label={label} value={value} format="raw" accentColor={PLATFORM_COLORS.flipkart} />
}

export default function FlipkartOverviewPage() {
  const [data, setData] = useState<FlipkartOverview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [trend, setTrend] = useState<any>(null)
  const [profitability, setProfitability] = useState<any>(null)
  const [alertStats, setAlertStats] = useState<any>(null)
  const [insightsSummary, setInsightsSummary] = useState<any>(null)
  const [recommendations, setRecommendations] = useState<any[]>([])
  const [historical, setHistorical] = useState<any>(null)
  useAutoRefresh(() => {
    getFlipkartOverview().then(setData).catch((e) => setError(String(e)))
    axios.get('/v1/trends/flipkart?days=30').then((r) => setTrend(r.data)).catch(() => {})
    axios.get('/v1/profitability/summary?marketplace=flipkart').then((r) => setProfitability(r.data?.summary)).catch(() => {})
    axios.get('/v1/alerts/stats?marketplace=flipkart').then((r) => setAlertStats(r.data?.stats)).catch(() => {})
    axios.get('/v1/insights/summary?marketplace=flipkart').then((r) => setInsightsSummary(r.data)).catch(() => {})
    axios.get('/v1/recommendations/action-plan?marketplace=flipkart').then((r) => setRecommendations(r.data?.recommendations || [])).catch(() => {})
    axios.get('/v1/dashboard/platform-comparison?days=90').then((r) => setHistorical(r.data?.platforms?.flipkart)).catch(() => {})
  }, [], 60_000)

  if (error) return <Card className="text-brick">Could not reach FK-Pulse's API on port 8600 — is it running? ({error})</Card>
  if (!data) return <Card className="text-stone">Loading…</Card>

  const bh = data.account_metrics?.business_health
  const traffic = data.account_metrics?.traffic
  const ads = data.account_metrics?.ads

  return (
    <div className="space-y-5">
      <PageHeader title="Flipkart — Overview" subtitle="Real Seller Hub figures from FK-Pulse (hub read every few minutes)" />

      <SectionHeader title="Unified Snapshot" to="/flipkart/unified" />
      <div className="grid grid-cols-4 gap-3">
        <Tile label="Listings" value={data.listings} />
        <Tile label="Active" value={data.active} />
        <Tile label="Avg Rating" value={`${(data.avg_rating || 0).toFixed(2)} ⭐`} />
        <Tile label="Open Recommendations" value={Object.values(data.open_recommendations || {}).reduce((a, b) => a + b, 0)} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card>
          <SectionHeader title="Trends — Revenue (30 days)" to="/flipkart/trends" />
          <TrendLineChart
            data={trend?.data || []}
            series={[{ key: 'revenue', label: 'Revenue', color: PLATFORM_COLORS.flipkart }]}
            yFormat={(v) => `₹${v.toLocaleString('en-IN')}`}
            height={200}
          />
        </Card>
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-ink">Inventory — Listings Health</h2>
          <PlatformBarChart
            data={[
              { platformId: 'active', label: 'Active', value: data.active },
              { platformId: 'inactive', label: 'Inactive', value: Math.max(0, data.listings - data.active) },
            ]}
            colorMap={{ active: '#6b8f5a', inactive: '#d9a441' }}
            height={200}
          />
        </Card>
      </div>

      <Card>
        <SectionHeader title="Alerts" to="/flipkart/alerts" />
        <div className="grid grid-cols-3 gap-3 mb-3">
          <StatTile label="Critical" value={alertStats?.critical || 0} format="number" accentColor="#c05a3d" />
          <StatTile label="Warnings" value={alertStats?.warnings || 0} format="number" accentColor="#d9a441" />
          <StatTile label="Info" value={alertStats?.info || 0} format="number" accentColor="#6b8f5a" />
        </div>
        {alertStats && <SeverityBreakdownChart data={[{ label: 'Flipkart', critical: alertStats.critical || 0, warning: alertStats.warnings || 0, info: alertStats.info || 0 }]} height={80} />}
      </Card>

      <Card>
        <SectionHeader title="Analytics — 30-Day Profitability" to="/flipkart/analytics" />
        <div className="grid grid-cols-4 gap-3">
          <StatTile label="Revenue" value={profitability?.total_revenue || 0} format="currency" accentColor={PLATFORM_COLORS.flipkart} />
          <StatTile label="Net Profit" value={profitability?.total_profit || 0} format="currency" accentColor={PLATFORM_COLORS.flipkart} />
          <StatTile label="Ad Spend" value={profitability?.total_ad_spend || 0} format="currency" accentColor={PLATFORM_COLORS.flipkart} />
          <StatTile label="Avg Margin" value={profitability?.avg_margin_pct || 0} format="percent" accentColor={PLATFORM_COLORS.flipkart} />
        </div>
      </Card>

      <Card>
        <SectionHeader title="Recommendations" to="/flipkart/recommendations" />
        {recommendations.length > 0 ? (
          <PriorityBarChart data={recommendations.map((r) => ({ id: r.id, label: r.title, score: r.priority_score || 0, priority: r.priority }))} height={180} />
        ) : (
          <p className="text-sm text-stone">No recommendations yet.</p>
        )}
      </Card>

      <Card>
        <SectionHeader title="Historical — Orders (90 days)" to="/flipkart/historical" />
        <TrendLineChart
          data={historical?.trend_data || []}
          series={[{ key: 'orders', label: 'Orders', color: PLATFORM_COLORS.flipkart }]}
          height={200}
        />
      </Card>

      <Card>
        <SectionHeader title="Insights" to="/flipkart/insights" />
        <div className="grid grid-cols-3 gap-3">
          <StatTile label="High Priority" value={insightsSummary?.recommendations_summary?.high_priority || 0} format="number" accentColor="#c05a3d" />
          <StatTile label="In Progress" value={insightsSummary?.recommendations_summary?.in_progress || 0} format="number" />
          <StatTile label="Completed" value={insightsSummary?.recommendations_summary?.completed || 0} format="number" accentColor="#6b8f5a" />
        </div>
      </Card>

      {bh && (
        <Card className="bg-cream border-l-4 border-clay">
          <h2 className="text-sm font-semibold text-ink mb-3">Business Health (7-day)</h2>
          <div className="grid grid-cols-4 gap-3 text-sm">
            <div><span className="text-stone">Impressions:</span><div className="font-bold text-ink">{bh.impressions_7d?.toLocaleString('en-IN')}</div></div>
            <div><span className="text-stone">Units:</span><div className="font-bold text-ink">{bh.units_7d}</div></div>
            <div><span className="text-stone">Sales:</span><div className="font-bold text-ink">₹{bh.sales_7d?.toLocaleString('en-IN')}</div></div>
            <div><span className="text-stone">Conversion:</span><div className="font-bold text-ink">{bh.conversion_7d_pct}%</div></div>
            <div><span className="text-stone">RTO %:</span><div className="font-bold text-brick">{bh.rto_pct}%</div></div>
            <div><span className="text-stone">Buyer Returns %:</span><div className="font-bold text-ink">{bh.buyer_returns_pct}%</div></div>
            <div><span className="text-stone">Seller Cancel %:</span><div className="font-bold text-ink">{bh.seller_cancel_pct}%</div></div>
            <div><span className="text-stone">Low Quality Listings:</span><div className="font-bold text-ink">{bh.low_quality_listings}/{bh.listings_scored}</div></div>
          </div>
        </Card>
      )}

      {traffic && (
        <Card>
          <h2 className="text-sm font-semibold text-ink mb-3">Traffic (30-day)</h2>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div><span className="text-stone">Impressions 30d:</span><div className="font-bold text-ink">{traffic.impressions_30d?.toLocaleString('en-IN')} <span className={traffic.impressions_change_pct < 0 ? 'text-brick' : 'text-green-600'}>({traffic.impressions_change_pct > 0 ? '+' : ''}{traffic.impressions_change_pct}%)</span></div></div>
            <div><span className="text-stone">Units 30d:</span><div className="font-bold text-ink">{traffic.units_30d}</div></div>
            <div><span className="text-stone">Sales 30d:</span><div className="font-bold text-ink">₹{traffic.sales_30d?.toLocaleString('en-IN')}</div></div>
          </div>
        </Card>
      )}

      {ads && (
        <Card className="bg-sand">
          <h2 className="text-sm font-semibold text-ink mb-3">Ads ({ads.range_label})</h2>
          <div className="grid grid-cols-4 gap-3 text-sm">
            <div><span className="text-stone">Spend:</span><div className="font-bold text-ink">₹{ads.spend}</div></div>
            <div><span className="text-stone">ROI:</span><div className="font-bold text-ink">{ads.roi}x</div></div>
            <div><span className="text-stone">CTR:</span><div className="font-bold text-ink">{ads.ctr_pct}%</div></div>
            <div><span className="text-stone">CVR:</span><div className="font-bold text-ink">{ads.cvr_pct}%</div></div>
          </div>
        </Card>
      )}
    </div>
  )
}
