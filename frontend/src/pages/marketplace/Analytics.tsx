import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { fmtPct } from '../utils/metricFormat.js'
import { platformFromPath, marketplaceId } from '../hooks/platformScope.js'
import Card, { PageHeader } from '../components/Card.js'
import axios from 'axios'
import { useAutoRefresh } from '../hooks/useAutoRefresh.js'
import { StatTile } from '../components/charts/index.js'

type ProfitabilityData = {
  summary?: any
  topProducts?: any[]
  bottomProducts?: any[]
  period?: string
}

type RegionalData = {
  regions?: any[]
  lastUpdated?: string
}

type LtvData = {
  cohortRetention?: any[]
  title?: string
}

function MetricCard({ label, value, unit = '' }: { label: string; value: any; unit?: string }) {
  const formatted = typeof value === 'number' ? value.toLocaleString('en-IN') : value ?? '—'
  return <StatTile label={label} value={`${formatted}${unit ? ' ' + unit : ''}`} format="raw" />
}

type AdsPerformance = {
  summary?: any
  topKeywords?: any[]
  period?: string
  traffic?: any
  marketplace?: string
}

export default function AnalyticsPage() {
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
  const [profitability, setProfitability] = useState<ProfitabilityData | null>(null)
  const [regional, setRegional] = useState<RegionalData | null>(null)
  const [ltv, setLtv] = useState<LtvData | null>(null)
  const [ads, setAds] = useState<AdsPerformance | null>(null)
  const [loading, setLoading] = useState(true)

  const marketplaces = [
    { id: 'amazon_in', label: 'Amazon' },
    { id: 'meesho', label: 'Meesho' },
    { id: 'snapdeal', label: 'Snapdeal' },
    { id: 'flipkart', label: 'Flipkart' },
  ]

  useAutoRefresh(() => {
    setLoading(true)
    Promise.all([
      axios.get(`/v1/profitability/summary?marketplace=${marketplace}`).then(r => setProfitability(r.data)).catch(() => {}),
      axios.get(`/v1/profitability/regional?marketplace=${marketplace}`).then(r => setRegional(r.data)).catch(() => {}),
      axios.get(`/v1/profitability/customer-ltv?marketplace=${marketplace}`).then(r => setLtv(r.data)).catch(() => {}),
      axios.get(`/v1/profitability/traffic?marketplace=${marketplace}`).then(r => setAds(r.data)).catch(() => {}),
    ]).finally(() => setLoading(false))
  }, [marketplace], 300_000)

  if (loading && !profitability) return <Card className="text-stone">Loading analytics…</Card>

  const s = profitability?.summary

  return (
    <div className="space-y-5">
      <PageHeader
        title="Cross-Platform Analytics"
        subtitle={scope ? "Profitability, customer LTV, regional performance and operational insights for this platform." : "Unified profitability, customer LTV, regional performance, and operational insights across all marketplaces (Amazon, Meesho, Snapdeal, Flipkart)."}
      />

      {/* Marketplace Selector */}
      {!scope && (<Card className="bg-cream">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-ink">Select Marketplace:</label>
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

      {/* Profitability Summary */}
      {s && (
        <>
          <Card className="bg-cream border-l-4 border-clay">
            <h2 className="mb-3 text-sm font-semibold text-ink">30-Day Profitability Summary</h2>
            <div className="grid grid-cols-4 gap-3">
              <MetricCard label="Total Products" value={s.product_count} />
              <MetricCard label="Units Sold" value={s.total_units} />
              <MetricCard label="Gross Revenue" value={`₹${(s.total_revenue || 0).toFixed(0)}`} />
              <MetricCard label="Total COGS" value={`₹${(s.total_cogs || 0).toFixed(0)}`} />
              <MetricCard label="Total Fees" value={`₹${(s.total_fees || 0).toFixed(0)}`} />
              <MetricCard label="Ad Spend" value={`₹${(s.total_ad_spend || 0).toFixed(0)}`} />
              <MetricCard label="Net Profit" value={`₹${(s.total_profit || 0).toFixed(0)}`} />
              <MetricCard label="Avg Margin" value={s.avg_margin_pct} unit="%" />
            </div>
          </Card>

          {/* Traffic Performance - CTR & CVR */}
          {ads?.traffic && (
            <Card className="bg-sand border-l-4 border-clay">
              <h2 className="mb-3 text-sm font-semibold text-ink">📊 Traffic Metrics (CTR & CVR)</h2>
              <div className="grid grid-cols-5 gap-3">
                <MetricCard label="Impressions" value={(ads.traffic.impressions || 0).toLocaleString()} />
                <MetricCard label="Clicks" value={(ads.traffic.clicks || 0).toLocaleString()} />
                <MetricCard label="CTR" value={fmtPct(ads.traffic.ctr_pct)} />
                <MetricCard label="CVR" value={fmtPct(ads.traffic.cvr_pct)} />
                {ads.traffic.unique_products > 0 && <MetricCard label="Active Products" value={ads.traffic.unique_products} />}
              </div>
              <div className="grid grid-cols-4 gap-3 mt-3">
                {ads.traffic.buy_box_pct !== null && <MetricCard label="Buy Box %" value={ads.traffic.buy_box_pct} unit="%" />}
                {ads.traffic.pages_per_session && <MetricCard label="Pages/Session" value={ads.traffic.pages_per_session} />}
                {ads.traffic.avg_order_value && <MetricCard label="Avg Order Value" value={`₹${(ads.traffic.avg_order_value || 0).toFixed(0)}`} />}
                {ads.traffic.total_sales > 0 && <MetricCard label="Total Sales" value={`₹${(ads.traffic.total_sales || 0).toFixed(0)}`} />}
              </div>
              <div className="mt-3 space-y-0.5 text-[11px] text-stone">
                <div>CTR: {ads.traffic.ctr_basis || 'n/a'}</div>
                <div>CVR: {ads.traffic.cvr_basis || 'n/a'}</div>
                {ads.traffic.traffic_basis && <div>Impressions: {ads.traffic.traffic_basis}</div>}
              </div>
              <div className="mt-3 pt-3 border-t border-clay">
                <p className="text-xs text-stone">📍 {(ads.marketplace || 'all').toUpperCase()} • {ads.period}</p>
                <p className="text-xs text-stone mt-1">CTR = Clicks ÷ Impressions | CVR = Orders ÷ Clicks</p>
              </div>
            </Card>
          )}

          {/* Top Performers */}
          <div className="grid grid-cols-2 gap-3">
            <Card>
              <h3 className="mb-2 text-sm font-semibold text-ink">🏆 Top 5 Products (by Profit)</h3>
              <div className="space-y-2 text-sm">
                {profitability.topProducts?.slice(0, 5).map((p) => (
                  <div key={p.sku} className="flex justify-between border-b border-sand pb-1">
                    <span className="text-ink font-medium">{p.sku}</span>
                    <span className="text-stone">₹{(p.net_profit || 0).toFixed(0)}</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <h3 className="mb-2 text-sm font-semibold text-brick">⚠️ Bottom Products (by Profit)</h3>
              <div className="space-y-2 text-sm">
                {profitability.bottomProducts?.slice(0, 5).map((p) => (
                  <div key={p.sku} className="flex justify-between border-b border-sand pb-1">
                    <span className="text-ink font-medium">{p.sku}</span>
                    <span className={p.net_profit < 0 ? 'text-brick' : 'text-stone'}>
                      ₹{(p.net_profit || 0).toFixed(0)}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </>
      )}

      {/* Regional Performance */}
      {regional?.regions && regional.regions.length > 0 && (
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-ink">Regional Performance</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-sand">
                  <th className="text-left py-2 text-stone">Region</th>
                  <th className="text-right py-2 text-stone">Orders</th>
                  <th className="text-right py-2 text-stone">Revenue</th>
                  <th className="text-right py-2 text-stone">Return %</th>
                  <th className="text-left py-2 text-stone">Top Category</th>
                </tr>
              </thead>
              <tbody>
                {regional.regions.map((r) => (
                  <tr key={r.region} className="border-b border-sand hover:bg-cream">
                    <td className="py-2 font-medium text-ink">{r.region}</td>
                    <td className="text-right py-2 text-stone">{(r.total_orders || 0).toLocaleString()}</td>
                    <td className="text-right py-2 text-stone">₹{(r.total_revenue || 0).toFixed(0)}</td>
                    <td className="text-right py-2 text-stone">{((r.return_rate || 0) * 100).toFixed(1)}%</td>
                    <td className="py-2 text-stone text-xs">{r.top_category ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Customer LTV & Retention */}
      {ltv?.cohortRetention && ltv.cohortRetention.length > 0 && (
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-ink">{ltv.title}</h2>
          <p className="mb-3 text-xs text-stone">Shows repeat customer rate and revenue by cohort month</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-sand">
                  <th className="text-left py-2 text-stone">Cohort</th>
                  <th className="text-left py-2 text-stone">Period</th>
                  <th className="text-right py-2 text-stone">Customers</th>
                  <th className="text-right py-2 text-stone">Repeat %</th>
                  <th className="text-right py-2 text-stone">Avg Revenue</th>
                </tr>
              </thead>
              <tbody>
                {ltv.cohortRetention.map((row) => (
                  <tr key={`${row.cohort_month}-${row.period}`} className="border-b border-sand">
                    <td className="py-2 text-ink font-medium">{row.cohort_month}</td>
                    <td className="py-2 text-stone text-xs">{row.period}</td>
                    <td className="text-right py-2 text-stone">{(row.customer_count || 0).toLocaleString()}</td>
                    <td className="text-right py-2 text-ink font-medium">{(row.repeat_rate || 0).toFixed(1)}%</td>
                    <td className="text-right py-2 text-stone">₹{(row.avg_revenue_per_customer || 0).toFixed(0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* No Data Message */}
      {!profitability && !loading && (
        <Card className="text-stone">
          Analytics data is being populated. Platform robots are collecting profitability data across all marketplaces. Check back in a few hours once collection cycles complete.
        </Card>
      )}
    </div>
  )
}
