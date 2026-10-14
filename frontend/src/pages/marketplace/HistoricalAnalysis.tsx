import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { fmtPct } from '../utils/metricFormat.js'
import { platformFromPath, marketplaceId } from '../hooks/platformScope.js'
import Card, { PageHeader } from '../components/Card.js'
import axios from 'axios'
import { BarChart3, LineChart as LineChartIcon } from 'lucide-react'
import { StatTile, TrendLineChart } from '../components/charts/index.js'
import { platformColor } from '../theme/colors.js'

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
    { id: 'amazon_in', label: '🔶 Amazon' },
    { id: 'meesho', label: '💜 Meesho' },
    { id: 'snapdeal', label: '🟡 Snapdeal' },
    { id: 'flipkart', label: '🔵 Flipkart' },
  ]

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        const [allRes, trendRes] = await Promise.all([
          axios.get('/v1/dashboard/platform-comparison?days=90').catch(() => ({ data: { platforms: {} } })),
          axios.get(`/v1/trends/${selectedMarketplace}?days=90`).catch(() => ({ data: { data: [] } })),
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

  if (loading) return <Card className="text-stone">Loading historical data...</Card>

  if (!data || Object.keys(data).length === 0) {
    return (
      <div className="space-y-5">
        <PageHeader
          title="Historical Analysis"
          subtitle="30+ day trends, patterns, and performance analysis"
        />
        <Card className="text-center py-8">
          <p className="text-stone mb-2">No historical data yet</p>
          <p className="text-xs text-stone">Data will appear after first collection cycle...</p>
        </Card>
      </div>
    )
  }

  const selectedData = selectedMarketplace && data ? data[selectedMarketplace] : null

  const metrics = [
    { key: 'ctr_pct', label: 'CTR %', icon: LineChartIcon, color: 'clay' },
    { key: 'cvr_pct', label: 'CVR %', icon: LineChartIcon, color: 'ember' },
    { key: 'orders', label: 'Orders', icon: BarChart3, color: 'green-600' },
    { key: 'revenue', label: 'Revenue', icon: BarChart3, color: 'clay' },
    { key: 'margin_pct', label: 'Margin %', icon: LineChartIcon, color: 'blue-600' },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="Historical Analysis"
        subtitle="90-day trends, patterns, and performance analysis across all platforms"
      />

      {/* Platform & Metric Selectors */}
      <div className={`grid gap-3 ${scope ? "grid-cols-1" : "grid-cols-2"}`}>
        {!scope && (<Card className="bg-cream border-l-4 border-clay">
          <div className="text-xs font-medium text-ink mb-2">Select Platform:</div>
          <div className="flex gap-2 flex-wrap">
            {marketplaces.map((mp) => (
              <button
                key={mp.id}
                onClick={() => setSelectedMarketplace(mp.id)}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  selectedMarketplace === mp.id
                    ? 'bg-clay text-white'
                    : 'bg-sand text-ink hover:bg-clay hover:text-white'
                }`}
              >
                {mp.label}
              </button>
            ))}
          </div>
        </Card>)}

        <Card className="bg-sand">
          <div className="text-xs font-medium text-ink mb-2">Metric:</div>
          <div className="flex gap-2 flex-wrap">
            {metrics.map((m) => (
              <button
                key={m.key}
                onClick={() => setSelectedMetric(m.key as any)}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  selectedMetric === m.key
                    ? 'bg-clay text-white'
                    : 'bg-white text-ink border border-clay hover:bg-cream'
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
            <h2 className="text-sm font-semibold text-ink mb-4">
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
            <h2 className="text-sm font-semibold text-ink mb-3">Daily Breakdown</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-sand bg-cream">
                    <th className="text-left py-2 px-3 text-stone">Date</th>
                    <th className="text-right py-2 px-3 text-stone">CTR %</th>
                    <th className="text-right py-2 px-3 text-stone">CVR %</th>
                    <th className="text-right py-2 px-3 text-stone">Orders</th>
                    <th className="text-right py-2 px-3 text-stone">Revenue</th>
                    <th className="text-right py-2 px-3 text-stone">Margin %</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedData.trend_data &&
                    selectedData.trend_data
                      .slice()
                      .reverse()
                      .map((row: any, idx: number) => (
                        <tr key={idx} className="border-b border-sand hover:bg-cream">
                          <td className="py-2 px-3 text-ink font-medium">{row.date}</td>
                          <td className="text-right py-2 px-3 text-stone">{row.ctr?.toFixed(2)}%</td>
                          <td className="text-right py-2 px-3 text-stone">{row.cvr?.toFixed(2)}%</td>
                          <td className="text-right py-2 px-3 text-stone font-medium">{row.orders?.toLocaleString()}</td>
                          <td className="text-right py-2 px-3 text-stone">
                            ₹{(row.revenue || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                          </td>
                          <td className="text-right py-2 px-3 text-stone">{row.margin?.toFixed(1)}%</td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Insights */}
          <Card className="bg-cream border-l-4 border-clay">
            <h3 className="font-semibold text-ink text-sm mb-2">💡 Quick Insights</h3>
            <div className="space-y-2 text-sm text-stone">
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
                    <p className="text-brick">
                      • <strong>Declining Trend:</strong> Revenue dropped by ₹
                      {Math.abs(selectedData.change_30d.revenue_delta).toLocaleString('en-IN', { maximumFractionDigits: 0 })}{' '}
                      in 30 days
                    </p>
                  )}
                  {selectedData.latest.margin_pct > 20 && (
                    <p className="text-green-600">• <strong>Healthy Margins:</strong> {selectedData.latest.margin_pct?.toFixed(1)}% is excellent</p>
                  )}
                  {selectedData.latest.margin_pct < 10 && (
                    <p className="text-brick">• <strong>Low Margins:</strong> {selectedData.latest.margin_pct?.toFixed(1)}% needs optimization</p>
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
