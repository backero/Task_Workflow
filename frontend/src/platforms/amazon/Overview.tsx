import { useState, useEffect } from 'react'
import Card, { PageHeader } from '../../components/Card.js'
import COGSCalculator from '../../components/COGSCalculator.js'
import SectionHeader from '../../components/SectionHeader.js'
import axios from 'axios'
import { getAccountOverview } from '../../api.js'
import { StatTile, TrendLineChart, PlatformBarChart, SeverityBreakdownChart, PriorityBarChart } from '../../components/charts/index.js'
import { PLATFORM_COLORS } from '../../theme/colors.js'

function Tile({ label, value }: { label: string; value: string | number }) {
  return <StatTile label={label} value={value} format="raw" accentColor={PLATFORM_COLORS.amazon_in} />
}

export default function AmazonOverviewPage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [trend, setTrend] = useState<any>(null)
  const [profitability, setProfitability] = useState<any>(null)
  const [alertStats, setAlertStats] = useState<any>(null)
  const [insightsSummary, setInsightsSummary] = useState<any>(null)
  const [recommendations, setRecommendations] = useState<any[]>([])
  const [historical, setHistorical] = useState<any>(null)
  const [inventory, setInventory] = useState<{ inStock: number; outOfStock: number } | null>(null)

  useEffect(() => {
    axios.get('/v1/trends/amazon_in?days=30').then((r) => setTrend(r.data)).catch(() => {})
    axios.get('/v1/profitability/summary?marketplace=amazon_in').then((r) => setProfitability(r.data?.summary)).catch(() => {})
    axios.get('/v1/alerts/stats?marketplace=amazon_in').then((r) => setAlertStats(r.data?.stats)).catch(() => {})
    axios.get('/v1/insights/summary?marketplace=amazon_in').then((r) => setInsightsSummary(r.data)).catch(() => {})
    axios.get('/v1/recommendations/action-plan?marketplace=amazon_in').then((r) => setRecommendations(r.data?.recommendations || [])).catch(() => {})
    axios.get('/v1/dashboard/platform-comparison?days=90').then((r) => setHistorical(r.data?.platforms?.amazon_in)).catch(() => {})
    getAccountOverview().then((acc) => {
      const listings = acc.listings || []
      const inStock = listings.filter((l) => (l.available || 0) > 0).length
      setInventory({ inStock, outOfStock: Math.max(0, listings.length - inStock) })
    }).catch(() => {})
    const fetchData = async () => {
      try {
        const res = await axios.get('/v1/profitability/traffic?marketplace=amazon_in')
        const trafficData = res.data?.traffic
        setData({
          impressions: trafficData?.impressions || 0,
          clicks: trafficData?.clicks || 0,
          orders: trafficData?.clicks || trafficData?.total_units || 0,
          revenue: trafficData?.total_sales || 0,
          ctr_pct: trafficData?.ctr_pct || 0,
          cvr_pct: trafficData?.cvr_pct || 0,
          avg_order_value: trafficData?.avg_order_value || 0,
          unique_products: trafficData?.unique_products || 0,
          avg_rating: 0,
          return_rate: 0,
          open_alerts: 6
        })
      } catch (err) {
        console.error('Error fetching Amazon data:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
    const interval = setInterval(fetchData, 60000)
    return () => clearInterval(interval)
  }, [])

  if (loading) return <Card className="text-stone">Loading Amazon overview…</Card>
  if (!data || (data.impressions === 0 && data.orders === 0))
    return (
      <Card className="text-center py-8">
        <p className="text-stone mb-2">Amazon data loading from robot</p>
        <p className="text-xs text-stone">Check back in a few moments</p>
      </Card>
    )

  return (
    <div className="space-y-5">
      <PageHeader title="Amazon — Overview" subtitle="Real-time metrics and performance" />

      <SectionHeader title="Unified Snapshot" to="/amazon/unified" />
      <div className="grid grid-cols-4 gap-3">
        <Tile label="Impressions (7d)" value={(data.impressions || 0).toLocaleString('en-IN')} />
        <Tile label="Clicks" value={(data.clicks || 0).toLocaleString('en-IN')} />
        <Tile label="Orders" value={(data.orders || 0).toLocaleString('en-IN')} />
        <Tile label="Revenue" value={`₹${(data.revenue || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`} />
        <Tile label="CTR" value={`${(data.ctr_pct || 0).toFixed(2)}%`} />
        <Tile label="CVR" value={`${(data.cvr_pct || 0).toFixed(2)}%`} />
        <Tile label="Avg Order Value" value={`₹${(data.avg_order_value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`} />
        <Tile label="Open Alerts" value={data.open_alerts || 0} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card>
          <SectionHeader title="Trends — Revenue (30 days)" to="/amazon/trends" />
          <TrendLineChart
            data={trend?.data || []}
            series={[{ key: 'revenue', label: 'Revenue', color: PLATFORM_COLORS.amazon_in }]}
            yFormat={(v) => `₹${v.toLocaleString('en-IN')}`}
            height={200}
          />
        </Card>
        <Card>
          <SectionHeader title="Inventory" to="/amazon/inventory" />
          {inventory ? (
            <PlatformBarChart
              data={[
                { platformId: 'inStock', label: 'In Stock', value: inventory.inStock },
                { platformId: 'outOfStock', label: 'Out of Stock', value: inventory.outOfStock },
              ]}
              colorMap={{ inStock: '#6b8f5a', outOfStock: '#c05a3d' }}
              height={200}
            />
          ) : (
            <p className="text-sm text-stone">Loading inventory…</p>
          )}
        </Card>
      </div>

      <Card>
        <SectionHeader title="Alerts" to="/amazon/alerts" />
        <div className="grid grid-cols-3 gap-3 mb-3">
          <StatTile label="Critical" value={alertStats?.critical || 0} format="number" accentColor="#c05a3d" />
          <StatTile label="Warnings" value={alertStats?.warnings || 0} format="number" accentColor="#d9a441" />
          <StatTile label="Info" value={alertStats?.info || 0} format="number" accentColor="#6b8f5a" />
        </div>
        {alertStats && <SeverityBreakdownChart data={[{ label: 'Amazon', critical: alertStats.critical || 0, warning: alertStats.warnings || 0, info: alertStats.info || 0 }]} height={80} />}
      </Card>

      <Card>
        <SectionHeader title="Analytics — 30-Day Profitability" to="/amazon/analytics" />
        <div className="grid grid-cols-4 gap-3">
          <StatTile label="Revenue" value={profitability?.total_revenue || 0} format="currency" accentColor={PLATFORM_COLORS.amazon_in} />
          <StatTile label="Net Profit" value={profitability?.total_profit || 0} format="currency" accentColor={PLATFORM_COLORS.amazon_in} />
          <StatTile label="Ad Spend" value={profitability?.total_ad_spend || 0} format="currency" accentColor={PLATFORM_COLORS.amazon_in} />
          <StatTile label="Avg Margin" value={profitability?.avg_margin_pct || 0} format="percent" accentColor={PLATFORM_COLORS.amazon_in} />
        </div>
      </Card>

      <Card>
        <SectionHeader title="Recommendations" to="/amazon/recommendations" />
        {recommendations.length > 0 ? (
          <PriorityBarChart data={recommendations.map((r) => ({ id: r.id, label: r.title, score: r.priority_score || 0, priority: r.priority }))} height={180} />
        ) : (
          <p className="text-sm text-stone">No recommendations yet.</p>
        )}
      </Card>

      <Card>
        <SectionHeader title="Historical — Orders (90 days)" to="/amazon/historical" />
        <TrendLineChart
          data={historical?.trend_data || []}
          series={[{ key: 'orders', label: 'Orders', color: PLATFORM_COLORS.amazon_in }]}
          height={200}
        />
      </Card>

      <Card>
        <SectionHeader title="Insights" to="/amazon/insights" />
        <div className="grid grid-cols-3 gap-3">
          <StatTile label="High Priority" value={insightsSummary?.recommendations_summary?.high_priority || 0} format="number" accentColor="#c05a3d" />
          <StatTile label="In Progress" value={insightsSummary?.recommendations_summary?.in_progress || 0} format="number" />
          <StatTile label="Completed" value={insightsSummary?.recommendations_summary?.completed || 0} format="number" accentColor="#6b8f5a" />
        </div>
      </Card>

      <Card className="bg-cream border-l-4 border-clay">
        <h2 className="text-sm font-semibold text-ink mb-3">Performance Overview</h2>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-stone">Unique Products:</span>
            <div className="font-bold text-ink mt-1">{data.unique_products || 0}</div>
          </div>
          <div>
            <span className="text-stone">Avg Rating:</span>
            <div className="font-bold text-ink mt-1">{(data.avg_rating || 0).toFixed(1)} ⭐</div>
          </div>
          <div>
            <span className="text-stone">Return Rate:</span>
            <div className="font-bold text-ink mt-1">{(data.return_rate || 0).toFixed(2)}%</div>
          </div>
        </div>
      </Card>

      <COGSCalculator revenue={data.revenue || 0} />
    </div>
  )
}
