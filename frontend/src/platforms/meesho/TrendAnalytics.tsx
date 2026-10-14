import { useState, useEffect } from 'react'
import Card, { PageHeader } from '../../components/Card.js'
import axios from 'axios'
import { StatTile, TrendLineChart } from '../../components/charts/index.js'
import { PLATFORM_COLORS } from '../../theme/colors.js'

export default function MeeshoTrends() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        const res = await axios.get('/v1/trends/meesho?days=30')
        setData(res.data)
      } catch (err) {
        console.error('Error:', err)
      }
      setLoading(false)
    }
    fetchData()
    const interval = setInterval(fetchData, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  if (loading) return <Card className="text-stone">Loading trends...</Card>

  return (
    <div className="space-y-5">
      <PageHeader title="Meesho 30-Day Trends" subtitle="Historical performance analysis" />

      {data?.latest ? (
        <>
          <div className="grid grid-cols-4 gap-3">
            <StatTile label="CTR" value={data.latest.ctr_pct || 0} format="percent" trendPct={data.change?.ctr_pct != null ? Number(data.change.ctr_pct) : null} accentColor={PLATFORM_COLORS.meesho} />
            <StatTile label="CVR" value={data.latest.cvr_pct || 0} format="percent" trendPct={data.change?.cvr_pct != null ? Number(data.change.cvr_pct) : null} accentColor={PLATFORM_COLORS.meesho} />
            <StatTile label="Orders" value={data.latest.orders || 0} format="number" accentColor={PLATFORM_COLORS.meesho} />
            <StatTile label="Revenue" value={data.latest.revenue || 0} format="currency" accentColor={PLATFORM_COLORS.meesho} />
          </div>

          <Card>
            <h2 className="text-sm font-semibold text-ink mb-3">Revenue Trend</h2>
            <TrendLineChart
              data={data.data || []}
              series={[{ key: 'revenue', label: 'Revenue', color: PLATFORM_COLORS.meesho }]}
              yFormat={(v) => `₹${v.toLocaleString('en-IN')}`}
            />
          </Card>

          <Card>
            <h2 className="text-sm font-semibold text-ink mb-3">30-Day Timeline</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-sand">
                    <th className="text-left py-2 text-stone">Date</th>
                    <th className="text-right py-2 text-stone">CTR %</th>
                    <th className="text-right py-2 text-stone">Orders</th>
                    <th className="text-right py-2 text-stone">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {data.data?.slice().reverse().map((row: any, idx: number) => (
                    <tr key={idx} className="border-b border-sand hover:bg-cream">
                      <td className="py-2 text-ink">{row.date}</td>
                      <td className="text-right py-2 text-stone">{row.ctr_pct?.toFixed(2)}%</td>
                      <td className="text-right py-2 text-stone">{row.orders}</td>
                      <td className="text-right py-2 text-stone">₹{(row.revenue || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : (
        <Card className="text-center py-8 text-stone">No trend data yet</Card>
      )}
    </div>
  )
}
