import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { fmtPct } from '../utils/metricFormat.ts'
import { platformFromPath, marketplaceId } from '../hooks/platformScope.ts'
import Card, { PageHeader } from '../components/Card.tsx'
import api from '../api/axios.js'
import { BarChart3, LineChart as LineChartIcon, Lightbulb } from 'lucide-react'
import { StatTile, TrendLineChart } from '../components/charts/index.ts'
import { platformColor } from '../theme/colors.ts'

// /v1/dashboard/platform-comparison's trend_data rows use short field names
// (ctr/cvr/margin), NOT the _pct-suffixed names used by the metric selector
// or by /v1/trends — map explicitly rather than assuming they match.
const METRIC_FIELD: Record<string, string> = {
  ctr_pct: 'ctr',
  cvr_pct: 'cvr',
  margin_pct: 'margin',
  orders: 'orders',
  revenue: 'revenue',
}

type HistoricalData = {
  [key: string]: {
    latest: any
    change_30d: any
    trend_data: any[]
  }
}

export default function HistoricalAnalysis() {
  const location = useLocation()
  const [data, setData] = useState<HistoricalData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedMetric, setSelectedMetric] = useState<'ctr_pct' | 'cvr_pct' | 'orders' | 'revenue' | 'margin_pct'>('revenue')
  const scope = platformFromPath(location.pathname)
  const [selectedMarketplace, setSelectedMarketplace] = useState<string>(scope ? marketplaceId(scope) : 'amazon_in')

  const marketplaces = [
    { id: 'amazon_in', label: 'Amazon', color: '#FF9900' },
    { id: 'meesho', label: 'Meesho', color: '#f43397' },
    { id: 'snapdeal', label: 'Snapdeal', color: '#e40046' },
    { id: 'flipkart', label: 'Flipkart', color: '#2874f0' },
  ]

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        const [allRes, trendRes] = await Promise.all([
          api.get('/marketflow/v1/dashboard/platform-comparison?days=90').catch(() => ({ data: { platforms: {} } })),
          api.get(`/marketflow/v1/trends/${selectedMarketplace}?days=90`).catch(() => ({ data: { data: [] } })),
        ])
        setData(allRes.data.platforms)
      } catch (err) {
        console.error('Error fetching historical data:', err)
      }
      setLoading(false)
    }

    fetchData()
    const interval = setInterval(fetchData, 10 * 60 * 1000)
    return () => clearInterval(interval)
  }, [selectedMarketplace])

  if (loading) return <Card className="text-gray-400">Loading historical data...</Card>

  if (!data || Object.keys(data).length === 0) {
    return (
      <div className="space-y-5">
        <PageHeader
          title="Historical Analysis"
          subtitle="30+ day trends, patterns, and performance analysis"
        />
        <Card className="text-center py-8">
          <p className="text-gray-500 mb-2 text-sm">No historical data yet</p>
          <p className="text-xs text-gray-400">Data will appear after first collection cycle...</p>
        </Card>
      </div>
    )
  }

  const selectedData = selectedMarketplace && data ? data[selectedMarketplace] : null

  const metrics = [
    { key: 'ctr_pct', label: 'CTR %', icon: LineChartIcon, color: '#f97316' },
    { key: 'cvr_pct', label: 'CVR %', icon: LineChartIcon, color: '#ea580c' },
    { key: 'orders', label: 'Orders', icon: BarChart3, color: '#16a34a' },
    { key: 'revenue', label: 'Revenue', icon: BarChart3, color: '#f97316' },
    { key: 'margin_pct', label: 'Margin %', icon: LineChartIcon, color: '#2563eb' },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="Historical Analysis"
        subtitle="90-day trends, patterns, and performance analysis across all platforms"
      />

      {/* Platform & Metric Selectors */}
      <div className={`grid gap-3 ${scope ? "grid-cols-1" : "grid-cols-2"}`}>
        {!scope && (<Card className="bg-orange-50 border-l-4 border-orange-500">
          <div className="text-xs font-bold text-gray-700 mb-2">Select Platform:</div>
          <div className="flex gap-2 flex-wrap">
            {marketplaces.map((mp) => (
              <button
                key={mp.id}
                onClick={() => setSelectedMarketplace(mp.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  selectedMarketplace === mp.id
                    ? 'bg-gray-900 text-white'
                    : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-400'
                }`}
              >
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: mp.color }} />
                {mp.label}
              </button>
            ))}
          </div>
        </Card>)}

        <Card className="bg-gray-50">
          <div className="text-xs font-bold text-gray-700 mb-2">Metric:</div>
          <div className="flex gap-2 flex-wrap">
            {metrics.map((m) => (
              <button
                key={m.key}
                onClick={() => setSelectedMetric(m.key as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  selectedMetric === m.key
                    ? 'bg-orange-500 text-white'
                    : 'bg-white text-gray-600 border border-gray-200 hover:border-orange-200 hover:text-orange-600'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </Card>
      </div>

      {selectedData && (
        <>
          {/* Summary Stats, with 30-day change folded in as the trend badge */}
          <div className="grid grid-cols-5 gap-3">
            <StatTile
              label="Latest CTR"
              value={selectedData.latest?.ctr_pct || 0}
              format="percent"
              trendPct={selectedData.change_30d?.ctr_change_pct != null ? Number(selectedData.change_30d.ctr_change_pct) : null}
              accentColor={platformColor(selectedMarketplace)}
            />
            <StatTile
              label="Latest CVR"
              value={selectedData.latest?.cvr_pct || 0}
              format="percent"
              trendPct={selectedData.change_30d?.cvr_change_pct != null ? Number(selectedData.change_30d.cvr_change_pct) : null}
              accentColor={platformColor(selectedMarketplace)}
            />
            <StatTile
              label="Total Orders"
              value={selectedData.latest?.orders || 0}
              format="number"
              accentColor={platformColor(selectedMarketplace)}
            />
            <StatTile
              label="Total Revenue"
              value={selectedData.latest?.revenue || 0}
              format="currency"
              accentColor={platformColor(selectedMarketplace)}
            />
            <StatTile
              label="Margin"
              value={selectedData.latest?.margin_pct || 0}
              format="percent"
              trendPct={selectedData.change_30d?.margin_change_pct != null ? Number(selectedData.change_30d.margin_change_pct) : null}
              accentColor={platformColor(selectedMarketplace)}
            />
          </div>

          {/* Historical Chart */}
          <Card>
            <h2 className="text-sm font-bold text-gray-900 mb-4">
              30-Day {metrics.find((m) => m.key === selectedMetric)?.label} Trend
            </h2>
            <TrendLineChart
              data={selectedData.trend_data || []}
              series={[{
                key: METRIC_FIELD[selectedMetric],
                label: metrics.find((m) => m.key === selectedMetric)?.label || selectedMetric,
                color: platformColor(selectedMarketplace),
              }]}
              yFormat={(v) => (selectedMetric.includes('pct') ? `${v.toFixed(1)}%` : selectedMetric === 'revenue' ? `₹${v.toLocaleString('en-IN')}` : v.toLocaleString('en-IN'))}
            />
          </Card>

          {/* Daily Breakdown Table */}
          <Card>
            <h2 className="text-sm font-bold text-gray-900 mb-3">Daily Breakdown</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left py-2 px-3 text-gray-400">Date</th>
                    <th className="text-right py-2 px-3 text-gray-400">CTR %</th>
                    <th className="text-right py-2 px-3 text-gray-400">CVR %</th>
                    <th className="text-right py-2 px-3 text-gray-400">Orders</th>
                    <th className="text-right py-2 px-3 text-gray-400">Revenue</th>
                    <th className="text-right py-2 px-3 text-gray-400">Margin %</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedData.trend_data &&
                    selectedData.trend_data
                      .slice()
                      .reverse()
                      .map((row: any, idx: number) => (
                        <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-2 px-3 text-gray-900 font-semibold">{row.date}</td>
                          <td className="text-right py-2 px-3 text-gray-500">{row.ctr?.toFixed(2)}%</td>
                          <td className="text-right py-2 px-3 text-gray-500">{row.cvr?.toFixed(2)}%</td>
                          <td className="text-right py-2 px-3 text-gray-500 font-medium">{row.orders?.toLocaleString()}</td>
                          <td className="text-right py-2 px-3 text-gray-500">
                            ₹{(row.revenue || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                          </td>
                          <td className="text-right py-2 px-3 text-gray-500">{row.margin?.toFixed(1)}%</td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Insights */}
          <Card className="bg-orange-50 border-l-4 border-orange-500">
            <h3 className="font-bold text-gray-900 text-sm mb-2 flex items-center gap-1.5"><Lightbulb className="w-4 h-4 text-orange-500" />Quick Insights</h3>
            <div className="space-y-2 text-sm text-gray-600">
              {selectedData.latest && (
                <>
                  <p>
                    • <strong>Performance:</strong> CTR at {fmtPct(selectedData.latest.ctr_pct)}, CVR at{' '}
                    {fmtPct(selectedData.latest.cvr_pct)}
                  </p>
                  {selectedData.change_30d?.revenue_delta > 0 && (
                    <p className="text-green-600">
                      • <strong>Positive Trend:</strong> Revenue grew by ₹
                      {selectedData.change_30d.revenue_delta.toLocaleString('en-IN', { maximumFractionDigits: 0 })} in
                      30 days
                    </p>
                  )}
                  {selectedData.change_30d?.revenue_delta < 0 && (
                    <p className="text-red-500">
                      • <strong>Declining Trend:</strong> Revenue dropped by ₹
                      {Math.abs(selectedData.change_30d.revenue_delta).toLocaleString('en-IN', { maximumFractionDigits: 0 })}{' '}
                      in 30 days
                    </p>
                  )}
                  {selectedData.latest.margin_pct > 20 && (
                    <p className="text-green-600">• <strong>Healthy Margins:</strong> {selectedData.latest.margin_pct?.toFixed(1)}% is excellent</p>
                  )}
                  {selectedData.latest.margin_pct < 10 && (
                    <p className="text-red-500">• <strong>Low Margins:</strong> {selectedData.latest.margin_pct?.toFixed(1)}% needs optimization</p>
                  )}
                </>
              )}
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
