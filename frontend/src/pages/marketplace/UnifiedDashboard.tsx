import { useState, useEffect } from 'react'
import Card, { PageHeader } from '../../components/Card'
import axios from 'axios'
import { TrendingUp, TrendingDown, AlertCircle, CheckCircle } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { fmtPct } from '../../utils/metricFormat'
import { platformFromPath, marketplaceId } from '../../hooks/platformScope'
import { StatTile, PlatformBarChart, QualityGaugeBar } from '../../components/charts/index'
import { platformColor, PLATFORM_LABELS } from '../../theme/colors'

type DashboardData = {
  timestamp: string
  snapshot_date: string
  platforms: Record<string, any>
  comparison: any
  total_revenue: number
  total_orders: number
  total_impressions: number
  avg_margin: string
  status?: string
}

export default function UnifiedDashboard() {
  const location = useLocation()
  const scope = platformFromPath(location.pathname)
  const key = scope ? marketplaceId(scope) : null
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [dataQuality, setDataQuality] = useState<any>(null)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        const [dashboardRes, qualityRes] = await Promise.all([
          axios.get('/v1/dashboard/unified'),
          axios.get('/v1/data-quality/all'),
        ])
        setData(dashboardRes.data)
        setDataQuality(qualityRes.data)
      } catch (err) {
        console.error('Error fetching dashboard:', err)
      }
      setLoading(false)
    }

    fetchData()
    const interval = setInterval(fetchData, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  if (loading) return <Card className="text-stone">Loading unified dashboard...</Card>

  const marketplaceLabel = scope ? scope.charAt(0).toUpperCase() + scope.slice(1) : 'All Platforms'

  if (!data || data.status === 'no_data_yet') {
    return (
      <div className="space-y-5">
        <PageHeader
          title="Unified Dashboard"
          subtitle="Real-time analytics from all 4 platforms in one place"
        />
        <Card className="text-center py-8">
          <p className="text-stone mb-2">No data yet</p>
          <p className="text-xs text-stone">Waiting for first data collection cycle...</p>
          <p className="text-xs text-stone mt-2">Data will appear after the 4-hour collection runs</p>
        </Card>
      </div>
    )
  }

  const plat = key ? data.platforms[key] : null
  const totals = plat
    ? { revenue: plat.revenue || 0, orders: plat.orders || 0, impressions: plat.impressions || 0, margin: plat.margin_pct != null ? Number(plat.margin_pct).toFixed(1) : '0.0' }
    : { revenue: data.total_revenue || 0, orders: data.total_orders || 0, impressions: data.total_impressions || 0, margin: data.avg_margin }
  const platformEntries = Object.entries(data.platforms).filter(([k]) => !key || k === key)
  const scopeText = scope ? marketplaceLabel : 'All platforms'

  return (
    <div className="space-y-5">
      <PageHeader
        title={`${marketplaceLabel} Dashboard`}
        subtitle={scope ? `${marketplaceLabel} at a glance • Real-time analytics` : "All platforms at a glance • Real-time analytics from Amazon, Meesho, Snapdeal, Flipkart"}
      />

      {/* Top KPIs */}
      {(() => {
        const accent = key ? platformColor(key) : '#c97b52'
        const trend = plat?.wow_change_pct ?? null
        return (
          <div className="grid grid-cols-4 gap-3">
            <StatTile label={`Total Revenue · ${scopeText}`} value={totals.revenue} format="currency" accentColor={accent} trendPct={trend} goodDirection="up" />
            <StatTile label={`Total Orders · ${scopeText}`} value={totals.orders} format="number" accentColor={accent} />
            <StatTile label={`Total Impressions · ${scopeText}`} value={totals.impressions} format="number" accentColor={accent} />
            <StatTile label={`Avg Margin · ${scopeText}`} value={Number(totals.margin)} format="percent" accentColor={accent} />
          </div>
        )
      })()}

      {/* Platform Revenue Comparison */}
      {!scope && (
        <Card>
          <h2 className="text-sm font-semibold text-ink mb-3">Revenue by Platform</h2>
          <PlatformBarChart
            data={Object.entries(data.platforms).map(([mp, p]: [string, any]) => ({
              platformId: mp,
              label: PLATFORM_LABELS[mp] || mp.replace('_in', ''),
              value: p.revenue || 0,
            }))}
            valueFormat={(v) => `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
          />
        </Card>
      )}

      {/* Platform Winners */}
      {!scope && data.comparison && (
        <Card className="bg-cream border-l-4 border-clay">
          <h2 className="text-sm font-semibold text-ink mb-3">🏆 Platform Winners</h2>
          <div className="grid grid-cols-5 gap-3 text-sm">
            <div className="bg-white p-2 rounded">
              <div className="text-xs text-stone">Highest CTR</div>
              <div className="font-bold text-clay mt-1">{data.comparison.highest_ctr?.platform || '—'}</div>
              <div className="text-xs text-stone">{data.comparison.highest_ctr?.value?.toFixed(2)}%</div>
            </div>
            <div className="bg-white p-2 rounded">
              <div className="text-xs text-stone">Highest CVR</div>
              <div className="font-bold text-clay mt-1">{data.comparison.highest_cvr?.platform || '—'}</div>
              <div className="text-xs text-stone">{data.comparison.highest_cvr?.value?.toFixed(2)}%</div>
            </div>
            <div className="bg-white p-2 rounded">
              <div className="text-xs text-stone">Most Orders</div>
              <div className="font-bold text-clay mt-1">{data.comparison.most_orders?.platform || '—'}</div>
              <div className="text-xs text-stone">{data.comparison.most_orders?.value?.toLocaleString()}</div>
            </div>
            <div className="bg-white p-2 rounded">
              <div className="text-xs text-stone">Highest Revenue</div>
              <div className="font-bold text-clay mt-1">{data.comparison.highest_revenue?.platform || '—'}</div>
              <div className="text-xs text-stone">₹{(data.comparison.highest_revenue?.value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
            </div>
            <div className="bg-white p-2 rounded">
              <div className="text-xs text-stone">Highest Margin</div>
              <div className="font-bold text-clay mt-1">{data.comparison.highest_margin?.platform || '—'}</div>
              <div className="text-xs text-stone">{data.comparison.highest_margin?.value?.toFixed(1)}%</div>
            </div>
          </div>
        </Card>
      )}

      {/* Platform Details */}
      <Card>
        <h2 className="text-sm font-semibold text-ink mb-4">Platform Breakdown</h2>
        <div className={`grid gap-4 ${scope ? "grid-cols-1" : "grid-cols-2"}`}>
          {platformEntries.map(([marketplace, platform]: [string, any]) => (
            <div key={marketplace} className="border border-sand rounded p-3">
              <div className="font-medium text-ink capitalize mb-3">{marketplace.replace('_in', '')}</div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <span className="text-stone">Impressions:</span>
                  <div className="font-bold text-ink">{(platform.impressions || 0).toLocaleString()}</div>
                </div>
                <div>
                  <span className="text-stone">Clicks:</span>
                  <div className="font-bold text-ink">{(platform.clicks || 0).toLocaleString()}</div>
                </div>
                <div>
                  <span className="text-stone">CTR:</span>
                  <div className="font-bold text-clay">{fmtPct(platform.ctr_pct)}</div>
                </div>
                <div>
                  <span className="text-stone">CVR:</span>
                  <div className="font-bold text-clay">{fmtPct(platform.cvr_pct)}</div>
                </div>
                <div>
                  <span className="text-stone">Orders:</span>
                  <div className="font-bold text-ink">{(platform.orders || 0).toLocaleString()}</div>
                </div>
                <div>
                  <span className="text-stone">Revenue:</span>
                  <div className="font-bold text-ink">₹{(platform.revenue || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                </div>
              </div>
              <div className="mt-2 pt-2 border-t border-sand text-xs space-y-1">
                <div>
                  <span className="text-stone">Margin:</span>
                  <span className="ml-2 font-bold text-ink">{platform.margin_pct?.toFixed(1)}%</span>
                </div>
                <div>
                  <span className="text-stone">Alerts:</span>
                  <span className="ml-2 font-bold">{platform.open_alerts > 0 ? <span className="text-brick">{platform.open_alerts} open</span> : <span className="text-green-600">Clean</span>}</span>
                </div>
                <div className="text-[11px] leading-snug text-stone/70">
                  <div>CTR: {platform.ctr_basis || 'n/a'}</div>
                  <div>CVR: {platform.cvr_basis || 'n/a'}</div>
                  {platform.traffic_basis && <div>Traffic: {platform.traffic_basis}</div>}
                </div>
                <div>
                  <span className="text-stone">Trend:</span>
                  {platform.wow_change_pct !== null ? (
                    <span className={`ml-2 font-bold ${platform.wow_change_pct > 0 ? 'text-green-600' : 'text-brick'}`}>
                      {platform.wow_change_pct > 0 ? '+' : ''}{platform.wow_change_pct?.toFixed(1)}% WoW
                    </span>
                  ) : (
                    <span className="ml-2 text-stone text-xs">—</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Data Quality */}
      {dataQuality && (
        <Card className="bg-sand border-l-4 border-clay">
          <h3 className="font-semibold text-ink text-sm mb-3">📊 Data Collection Status</h3>
          <div className="grid grid-cols-4 gap-3">
            {Object.entries(dataQuality.platforms).filter(([k]) => !key || k === key).map(([marketplace, quality]: [string, any]) => (
              <div key={marketplace} className="bg-white p-3 rounded">
                <div className="font-medium text-ink capitalize mb-2">{PLATFORM_LABELS[marketplace] || marketplace.replace('_in', '')}</div>
                <QualityGaugeBar
                  value={quality.collection_success_rate ?? (quality.status === 'HEALTHY' ? 100 : quality.status === 'UNKNOWN' ? 0 : 50)}
                  label="Collection success"
                  sublabel={quality.data_freshness_hours !== undefined ? `Fresh: ${quality.data_freshness_hours?.toFixed(1)}h old` : undefined}
                />
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="text-xs text-stone bg-cream">
        Last updated: {data.timestamp ? new Date(data.timestamp).toLocaleString() : '—'}
      </Card>
    </div>
  )
}
