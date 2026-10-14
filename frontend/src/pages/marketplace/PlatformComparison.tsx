import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { fmtPct } from '../utils/metricFormat.js'
import { platformFromPath, marketplaceId } from '../hooks/platformScope.js'
import Card, { PageHeader } from '../components/Card.js'
import axios from 'axios'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { PlatformBarChart, TrendLineChart } from '../components/charts/index.js'
import { PLATFORM_COLORS, PLATFORM_LABELS } from '../theme/colors.js'

// trend_data rows use short field names (ctr/cvr/margin), not the _pct-suffixed
// metric keys used by the selector or by /v1/trends — map explicitly.
const METRIC_FIELD: Record<string, string> = {
  ctr_pct: 'ctr',
  cvr_pct: 'cvr',
  margin_pct: 'margin',
  orders: 'orders',
  revenue: 'revenue',
}

type ComparisonData = {
  [key: string]: {
    latest: any
    change_30d: any
    trend_data: any[]
  }
}

export default function PlatformComparison() {
  const [comparisonAll, setComparisonAll] = useState<ComparisonData | null>(null)
  const [comparisonByPlatform, setComparisonByPlatform] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [selectedMetric, setSelectedMetric] = useState<'ctr_pct' | 'cvr_pct' | 'orders' | 'revenue' | 'margin_pct'>('revenue')
  const scope = platformFromPath(useLocation().pathname)
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
          axios.get('/v1/dashboard/platform-comparison?days=30').catch(() => ({ data: { platforms: {} } })),
          axios.get(`/v1/trends/${selectedMarketplace}?days=30`).catch(() => ({ data: { data: [] } })),
        ])
        setComparisonAll(allRes.data.platforms)
        setComparisonByPlatform(trendRes.data)
      } catch (err) {
        console.error('Error fetching comparison:', err)
      }
      setLoading(false)
    }

    fetchData()
    const interval = setInterval(fetchData, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [selectedMarketplace])

  if (loading) return <Card className="text-stone">Loading platform comparison...</Card>

  if (!comparisonAll || Object.keys(comparisonAll).length === 0) {
    return (
      <div className="space-y-5">
        <PageHeader
          title="Platform Comparison"
          subtitle="Side-by-side analysis of all 4 marketplace platforms"
        />
        <Card className="text-center py-8">
          <p className="text-stone mb-2">No comparison data yet</p>
          <p className="text-xs text-stone">Waiting for first data collection cycle...</p>
        </Card>
      </div>
    )
  }

  const comparison = comparisonAll
  const platformKeys = Object.keys(comparison).filter((k) => !scope || k === marketplaceId(scope))
  const metrics = [
    { key: 'ctr_pct', label: 'CTR %', format: (v: any) => (v == null ? 'n/a' : v.toFixed(2)) },
    { key: 'cvr_pct', label: 'CVR %', format: (v: any) => (v == null ? 'n/a' : v.toFixed(2)) },
    { key: 'orders', label: 'Orders', format: (v: any) => v?.toLocaleString() },
    { key: 'revenue', label: 'Revenue', format: (v: any) => `₹${(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}` },
    { key: 'margin_pct', label: 'Margin %', format: (v: any) => v?.toFixed(1) },
  ]

  // Create ranking for selected metric
  const rankings = platformKeys
    .map((mp) => ({
      platform: mp,
      value: comparison[mp].latest?.[selectedMetric] || 0,
    }))
    .sort((a, b) => b.value - a.value)

  return (
    <div className="space-y-5">
      <PageHeader
        title="Platform Comparison"
        subtitle="Detailed side-by-side analytics and performance rankings"
      />

      {/* Platform Selector */}
      {!scope && (<Card className="bg-cream border-l-4 border-clay">
        <div className="flex items-center gap-2 flex-wrap">
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

      {/* Metric Selector */}
      <Card className="bg-sand">
        <div className="flex items-center gap-2 flex-wrap">
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

      {/* Rankings */}
      <Card className="bg-cream border-l-4 border-clay">
        <h2 className="text-sm font-semibold text-ink mb-4">🏆 Ranking by {metrics.find(m => m.key === selectedMetric)?.label}</h2>
        <div className="space-y-2">
          {rankings.map((rank, idx) => {
            const metricInfo = metrics.find(m => m.key === selectedMetric)
            const value = metricInfo?.format(rank.value) || rank.value
            const badges = ['🥇', '🥈', '🥉', '4️⃣']

            return (
              <div key={rank.platform} className="flex items-center justify-between p-3 bg-white rounded border border-sand">
                <div className="flex items-center gap-3 flex-1">
                  <span className="text-xl">{badges[idx] || '•'}</span>
                  <span className="font-medium text-ink capitalize">{rank.platform}</span>
                </div>
                <span className="text-lg font-bold text-clay">{value}</span>
              </div>
            )
          })}
        </div>
      </Card>

      {/* Ranking chart */}
      <Card>
        <h2 className="text-sm font-semibold text-ink mb-3">{metrics.find(m => m.key === selectedMetric)?.label} by Platform</h2>
        <PlatformBarChart
          data={platformKeys.map((mp) => ({
            platformId: mp,
            label: PLATFORM_LABELS[mp] || mp.replace('_in', ''),
            value: comparison[mp].latest?.[selectedMetric] || 0,
          }))}
          valueFormat={metrics.find(m => m.key === selectedMetric)?.format}
        />
      </Card>

      {/* Detailed Comparison Table */}
      <Card>
        <h2 className="text-sm font-semibold text-ink mb-4">Detailed Metrics</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-sand bg-cream">
                <th className="text-left py-2 px-3 text-stone">Platform</th>
                {metrics.map((m) => (
                  <th key={m.key} className="text-right py-2 px-3 text-stone">
                    {m.label}
                  </th>
                ))}
                <th className="text-right py-2 px-3 text-stone">30d Change</th>
              </tr>
            </thead>
            <tbody>
              {platformKeys.map((mp) => (
                <tr key={mp} className="border-b border-sand hover:bg-cream/50">
                  <td className="py-3 px-3 font-medium text-ink capitalize">{mp.replace('_in', '')}</td>
                  {metrics.map((m) => {
                    const metricKey = m.key as keyof typeof comparison[string]['latest']
                    const value = comparison[mp].latest?.[metricKey]
                    return (
                      <td key={m.key} className="text-right py-3 px-3 text-stone">
                        {value !== undefined && value !== null ? m.format(value) : '—'}
                      </td>
                    )
                  })}
                  <td className="text-right py-3 px-3">
                    <div className="flex items-center justify-end gap-1">
                      {comparison[mp].change_30d?.revenue_delta !== undefined ? (
                        <>
                          {comparison[mp].change_30d.revenue_delta > 0 ? (
                            <TrendingUp size={14} className="text-green-600" />
                          ) : (
                            <TrendingDown size={14} className="text-brick" />
                          )}
                          <span
                            className={`font-bold ${
                              comparison[mp].change_30d.revenue_delta > 0 ? 'text-green-600' : 'text-brick'
                            }`}
                          >
                            ₹{Math.abs(comparison[mp].change_30d.revenue_delta).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                          </span>
                        </>
                      ) : (
                        '—'
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Trend Chart — one overlay instead of a separate mini-chart per platform */}
      {comparison && (
        <Card>
          <h3 className="text-sm font-semibold text-ink mb-3">{metrics.find(m => m.key === selectedMetric)?.label} — 30-Day Trend</h3>
          {(() => {
            const field = METRIC_FIELD[selectedMetric]
            const byDate: Record<string, Record<string, any>> = {}
            for (const mp of platformKeys) {
              for (const row of comparison[mp]?.trend_data || []) {
                byDate[row.date] = byDate[row.date] || { date: row.date }
                byDate[row.date][mp] = row[field] ?? 0
              }
            }
            const merged = Object.values(byDate).sort((a, b) => String(a.date).localeCompare(String(b.date)))
            return (
              <TrendLineChart
                data={merged}
                series={platformKeys.map((mp) => ({ key: mp, label: PLATFORM_LABELS[mp] || mp, color: PLATFORM_COLORS[mp] || '#c97b52' }))}
                yFormat={metrics.find(m => m.key === selectedMetric)?.format}
              />
            )
          })()}
        </Card>
      )}

      {/* Performance Summary */}
      <Card className="bg-sand">
        <h3 className="font-semibold text-ink text-sm mb-3">📊 Performance Summary</h3>
        <div className="space-y-2 text-sm">
          {platformKeys.map((mp) => (
            <div key={mp} className="flex justify-between items-center p-2 bg-white rounded">
              <span className="font-medium text-ink capitalize">{mp.replace('_in', '')}</span>
              <div className="flex gap-4 text-xs text-stone">
                <span>CTR: {fmtPct(comparison[mp].latest?.ctr_pct)}</span>
                <span>CVR: {fmtPct(comparison[mp].latest?.cvr_pct)}</span>
                <span>Orders: {comparison[mp].latest?.orders?.toLocaleString()}</span>
                <span className="font-bold text-ink">
                  ₹{(comparison[mp].latest?.revenue || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </span>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
