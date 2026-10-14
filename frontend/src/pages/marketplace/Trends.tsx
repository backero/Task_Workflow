import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { fmtPct } from '../utils/metricFormat'
import { platformFromPath, marketplaceId } from '../hooks/platformScope'
import Card, { PageHeader } from '../components/Card'
import axios from 'axios'
import { useAutoRefresh } from '../hooks/useAutoRefresh'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { StatTile, TrendLineChart } from '../components/charts/index'
import { PLATFORM_COLORS, PLATFORM_LABELS, platformColor } from '../theme/colors'

type TrendData = {
  date: string
  ctr_pct: number
  cvr_pct: number
  impressions: number
  clicks: number
  orders: number
  revenue: number
  alerts_open: number
  alerts_critical: number
  avg_rating?: number
}

type TrendResponse = {
  marketplace: string
  period_days: number
  data: TrendData[]
  latest: TrendData | null
  change: any
}

export default function TrendsPage() {
  const location = useLocation()
  const getInitialMarketplace = () => {
    const referer = location.state?.from || document.referrer || ''
    if (referer.includes('/meesho')) return 'meesho'
    if (referer.includes('/snapdeal')) return 'snapdeal'
    if (referer.includes('/flipkart')) return 'flipkart'
    return 'amazon_in'
  }

  const scope = platformFromPath(location.pathname)
  const [marketplace, setMarketplace] = useState(scope ? marketplaceId(scope) : getInitialMarketplace())
  const [trendData, setTrendData] = useState<TrendResponse | null>(null)
  const [comparison, setComparison] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [selectedMetric, setSelectedMetric] = useState<'ctr_pct' | 'cvr_pct' | 'orders' | 'revenue'>('revenue')

  const marketplaces = [
    { id: 'amazon_in', label: 'Amazon' },
    { id: 'meesho', label: 'Meesho' },
    { id: 'snapdeal', label: 'Snapdeal' },
    { id: 'flipkart', label: 'Flipkart' },
  ]

  useAutoRefresh(() => {
    setLoading(true)
    Promise.all([
      axios.get(`/v1/trends/${marketplace}?days=30`).catch(() => ({ data: null })),
      axios.get(`/v1/trends/compare/all?days=30`).catch(() => ({ data: { platforms: {} } })),
    ])
      .then(([trendRes, compRes]) => {
        setTrendData(trendRes.data)
        setComparison(compRes.data)
      })
      .catch(err => {
        console.error('Error fetching trends:', err)
        setTrendData(null)
      })
      .finally(() => setLoading(false))
  }, [marketplace], 240000) // 4-minute refresh for demo

  if (loading) return <Card className="text-stone">Loading trends...</Card>

  const hasData = trendData?.data && trendData.data.length > 0

  return (
    <div className="space-y-5">
      <PageHeader
        title="Trends & Timeline"
        subtitle="30-day historical trends showing platform performance, CTR, CVR, orders, and alerts over time"
      />

      {/* Marketplace Selector */}
      {!scope && (<Card className="bg-cream">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-ink">Platform:</label>
          <div className="flex gap-2">
            {marketplaces.map(mp => (
              <button
                key={mp.id}
                onClick={() => setMarketplace(mp.id)}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  marketplace === mp.id
                    ? 'bg-clay text-white'
                    : 'bg-sand text-ink hover:bg-clay hover:text-white'
                }`}
              >
                {mp.label}
              </button>
            ))}
          </div>
        </div>
      </Card>)}

      {/* Metric Selector */}
      <Card className="bg-sand">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-ink">View Metric:</label>
          <div className="flex gap-2">
            <button
              onClick={() => setSelectedMetric('ctr_pct')}
              className={`px-2 py-1 text-xs font-medium rounded ${
                selectedMetric === 'ctr_pct' ? 'bg-clay text-white' : 'bg-white text-ink border border-clay'
              }`}
            >
              CTR %
            </button>
            <button
              onClick={() => setSelectedMetric('cvr_pct')}
              className={`px-2 py-1 text-xs font-medium rounded ${
                selectedMetric === 'cvr_pct' ? 'bg-clay text-white' : 'bg-white text-ink border border-clay'
              }`}
            >
              CVR %
            </button>
            <button
              onClick={() => setSelectedMetric('orders')}
              className={`px-2 py-1 text-xs font-medium rounded ${
                selectedMetric === 'orders' ? 'bg-clay text-white' : 'bg-white text-ink border border-clay'
              }`}
            >
              Orders
            </button>
            <button
              onClick={() => setSelectedMetric('revenue')}
              className={`px-2 py-1 text-xs font-medium rounded ${
                selectedMetric === 'revenue' ? 'bg-clay text-white' : 'bg-white text-ink border border-clay'
              }`}
            >
              Revenue
            </button>
          </div>
        </div>
      </Card>

      {hasData ? (
        <>
          {/* Latest + 30-Day Change, combined into trend-aware tiles */}
          {trendData?.latest && (
            <div className="grid grid-cols-4 gap-3">
              <StatTile
                label={`CTR · ${trendData.latest.date}`}
                value={trendData.latest.ctr_pct || 0}
                format="percent"
                trendPct={trendData.change?.ctr_pct != null ? Number(trendData.change.ctr_pct) : null}
                accentColor={platformColor(marketplace)}
              />
              <StatTile
                label={`CVR · ${trendData.latest.date}`}
                value={trendData.latest.cvr_pct || 0}
                format="percent"
                trendPct={trendData.change?.cvr_pct != null ? Number(trendData.change.cvr_pct) : null}
                accentColor={platformColor(marketplace)}
              />
              <StatTile
                label="Orders"
                value={trendData.latest.orders || 0}
                format="number"
                accentColor={platformColor(marketplace)}
              />
              <StatTile
                label="Open Alerts"
                value={trendData.latest.alerts_open || 0}
                format="number"
                accentColor={trendData.latest.alerts_open > 0 ? '#c05a3d' : platformColor(marketplace)}
              />
            </div>
          )}

          {/* Timeline Table */}
          <Card>
            <h2 className="mb-3 text-sm font-semibold text-ink">30-Day Timeline</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-sand">
                    <th className="text-left py-2 text-stone">Date</th>
                    <th className="text-right py-2 text-stone">CTR %</th>
                    <th className="text-right py-2 text-stone">CVR %</th>
                    <th className="text-right py-2 text-stone">Impressions</th>
                    <th className="text-right py-2 text-stone">Orders</th>
                    <th className="text-right py-2 text-stone">Revenue</th>
                    <th className="text-right py-2 text-stone">Alerts</th>
                  </tr>
                </thead>
                <tbody>
                  {trendData.data
                    .slice()
                    .reverse()
                    .map((row, idx) => (
                      <tr key={idx} className="border-b border-sand hover:bg-cream">
                        <td className="py-2 text-ink font-medium">{row.date}</td>
                        <td className="text-right py-2 text-stone">{fmtPct(row.ctr_pct)}</td>
                        <td className="text-right py-2 text-stone">{fmtPct(row.cvr_pct)}</td>
                        <td className="text-right py-2 text-stone">{row.impressions?.toLocaleString() || '—'}</td>
                        <td className="text-right py-2 text-stone font-medium">{row.orders}</td>
                        <td className="text-right py-2 text-stone">₹{row.revenue?.toFixed(0) || '—'}</td>
                        <td className="text-right py-2">
                          <span
                            className={`px-2 py-1 rounded text-xs font-bold ${
                              row.alerts_critical > 0 ? 'bg-red-100 text-brick' : 'bg-amber-100 text-amber-700'
                            }`}
                          >
                            {row.alerts_open}
                          </span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Trend line */}
          <Card>
            <h2 className="mb-3 text-sm font-semibold text-ink">
              {selectedMetric === 'ctr_pct' && 'CTR Trend'}
              {selectedMetric === 'cvr_pct' && 'CVR Trend'}
              {selectedMetric === 'orders' && 'Orders Trend'}
              {selectedMetric === 'revenue' && 'Revenue Trend'}
            </h2>
            <TrendLineChart
              data={trendData.data}
              series={[{ key: selectedMetric, label: marketplaces.find(m => m.id === marketplace)?.label || marketplace, color: platformColor(marketplace) }]}
              yFormat={(v) => (selectedMetric === 'ctr_pct' || selectedMetric === 'cvr_pct' ? `${v.toFixed(1)}%` : selectedMetric === 'revenue' ? `₹${v.toLocaleString('en-IN')}` : v.toLocaleString('en-IN'))}
            />
          </Card>
        </>
      ) : (
        <Card className="text-center py-8">
          <p className="text-stone mb-2">No trend data yet for {marketplace}</p>
          <p className="text-xs text-stone">Trends will populate as the 4-hour collection cycle runs</p>
          <p className="text-xs text-stone mt-2">Current data is being collected now and will appear here shortly</p>
        </Card>
      )}

      {/* All Platforms Comparison */}
      {!scope && comparison && (
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-ink">📊 All Platforms Comparison</h2>
          {(() => {
            const platformIds = Object.keys(comparison.platforms || {})
            const byDate: Record<string, Record<string, any>> = {}
            for (const mp of platformIds) {
              for (const row of comparison.platforms[mp]?.data || []) {
                byDate[row.date] = byDate[row.date] || { date: row.date }
                byDate[row.date][mp] = row[selectedMetric] ?? 0
              }
            }
            const merged = Object.values(byDate).sort((a, b) => String(a.date).localeCompare(String(b.date)))
            if (merged.length === 0) return null
            return (
              <TrendLineChart
                data={merged}
                series={platformIds.map(mp => ({ key: mp, label: PLATFORM_LABELS[mp] || mp, color: PLATFORM_COLORS[mp] || '#c97b52' }))}
                yFormat={(v) => (selectedMetric === 'ctr_pct' || selectedMetric === 'cvr_pct' ? `${v.toFixed(1)}%` : selectedMetric === 'revenue' ? `₹${v.toLocaleString('en-IN')}` : v.toLocaleString('en-IN'))}
              />
            )
          })()}
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b-2 border-clay bg-cream">
                  <th className="text-left py-2 px-3 text-stone">Platform</th>
                  <th className="text-right py-2 px-3 text-stone">CTR %</th>
                  <th className="text-right py-2 px-3 text-stone">CVR %</th>
                  <th className="text-right py-2 px-3 text-stone">Total Orders</th>
                  <th className="text-right py-2 px-3 text-stone">Total Revenue</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(comparison.platforms || {}).map(([platform, data]: [string, any]) => (
                  <tr key={platform} className="border-b border-sand hover:bg-cream/50">
                    <td className="py-2 px-3 font-medium text-ink capitalize">{platform.replace('_in', '')}</td>
                    <td className="text-right py-2 px-3 text-stone">{data.latest?.ctr_pct?.toFixed(2) || '—'}%</td>
                    <td className="text-right py-2 px-3 text-stone">{data.latest?.cvr_pct?.toFixed(2) || '—'}%</td>
                    <td className="text-right py-2 px-3 font-bold text-ink">
                      {data.data?.reduce((sum: number, d: any) => sum + (d.orders || 0), 0).toLocaleString() || '—'}
                    </td>
                    <td className="text-right py-2 px-3 text-stone">
                      ₹{data.data?.reduce((sum: number, d: any) => sum + (d.revenue || 0), 0).toFixed(0) || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card className="bg-sand border-l-4 border-clay">
        <h3 className="font-semibold text-ink text-sm mb-2">📊 Data Collection Status</h3>
        <p className="text-xs text-stone">
          ✓ Real-time data collection every 4 hours<br/>
          ✓ Current data being processed NOW<br/>
          ✓ Trends populate as snapshots are captured<br/>
          ✓ 30-day historical data ready for analysis
        </p>
      </Card>
    </div>
  )
}
