import { useState, useEffect } from 'react'
import Card, { PageHeader } from '../../components/Card.js'
import axios from 'axios'
import { StatTile } from '../../components/charts/index.js'
import { PLATFORM_COLORS } from '../../theme/colors.js'

export default function FlipkartAnalytics() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        const res = await axios.get('/v1/profitability/traffic?marketplace=flipkart')
        setData(res.data?.traffic)
      } catch (err) {
        console.error('Error:', err)
      }
      setLoading(false)
    }
    fetchData()
    const interval = setInterval(fetchData, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  if (loading) return <Card className="text-stone">Loading Flipkart analytics...</Card>

  return (
    <div className="space-y-5">
      <PageHeader title="Flipkart Analytics" subtitle="Detailed performance metrics" />
      <div className="grid grid-cols-4 gap-3">
        <StatTile label="Impressions" value={data?.impressions || 0} format="number" accentColor={PLATFORM_COLORS.flipkart} />
        <StatTile label="Clicks" value={data?.clicks || 0} format="number" accentColor={PLATFORM_COLORS.flipkart} />
        <StatTile label="CTR" value={data?.ctr_pct || 0} format="percent" accentColor={PLATFORM_COLORS.flipkart} />
        <StatTile label="CVR" value={data?.cvr_pct || 0} format="percent" accentColor={PLATFORM_COLORS.flipkart} />
      </div>
      <Card>
        <h2 className="text-sm font-semibold text-ink mb-4">Key Metrics</h2>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div className="p-3 bg-cream rounded">
            <span className="text-stone">Total Sales</span>
            <div className="font-bold text-ink mt-1">₹{(data?.total_sales || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
          </div>
          <div className="p-3 bg-cream rounded">
            <span className="text-stone">Avg Order Value</span>
            <div className="font-bold text-ink mt-1">₹{(data?.avg_order_value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
          </div>
          <div className="p-3 bg-cream rounded">
            <span className="text-stone">Products</span>
            <div className="font-bold text-ink mt-1">{(data?.unique_products || 0).toLocaleString()}</div>
          </div>
        </div>
      </Card>
    </div>
  )
}
