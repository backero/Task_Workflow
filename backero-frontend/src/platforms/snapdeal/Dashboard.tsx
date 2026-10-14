import { useState, useEffect } from 'react'
import Card, { PageHeader } from '../../components/Card.tsx'
import axios from 'axios'

export default function SnapdealDashboard() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        const res = await axios.get('/v1/dashboard/unified')
        setData(res.data?.platforms?.snapdeal || null)
      } catch (err) {
        console.error('Error fetching Snapdeal data:', err)
      }
      setLoading(false)
    }
    fetchData()
    const interval = setInterval(fetchData, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  if (loading) return <Card className="text-stone">Loading Snapdeal dashboard...</Card>

  if (!data || (data.impressions === 0 && data.orders === 0)) {
    return (
      <div className="space-y-5">
        <PageHeader title="Snapdeal Unified Dashboard" subtitle="Real-time analytics and insights" />
        <Card className="text-center py-8">
          <p className="text-stone mb-2">No Snapdeal data collected yet</p>
          <p className="text-xs text-stone">Add Snapdeal API credentials to start collecting data</p>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Snapdeal Unified Dashboard" subtitle="Real-time analytics for Snapdeal marketplace" />

      <div className="grid grid-cols-4 gap-3">
        <Card className="bg-clay text-white">
          <div className="text-xs opacity-80">Impressions</div>
          <div className="mt-2 text-3xl font-bold">{(data.impressions || 0).toLocaleString()}</div>
        </Card>
        <Card className="bg-cream">
          <div className="text-xs text-stone">Orders</div>
          <div className="mt-2 text-3xl font-bold text-ink">{(data.orders || 0).toLocaleString()}</div>
        </Card>
        <Card className="bg-sand">
          <div className="text-xs text-ink">CTR</div>
          <div className="mt-2 text-3xl font-bold text-ink">{(data.ctr_pct || 0).toFixed(2)}%</div>
        </Card>
        <Card className="bg-cream">
          <div className="text-xs text-stone">Revenue</div>
          <div className="mt-2 text-3xl font-bold text-ink">₹{(data.revenue || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
        </Card>
      </div>

      <Card className="bg-cream border-l-4 border-clay">
        <h2 className="text-sm font-semibold text-ink mb-3">Performance Metrics</h2>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-stone">CVR:</span>
            <div className="font-bold text-ink mt-1">{(data.cvr_pct || 0).toFixed(2)}%</div>
          </div>
          <div>
            <span className="text-stone">Avg Order Value:</span>
            <div className="font-bold text-ink mt-1">₹{(data.avg_order_value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
          </div>
          <div>
            <span className="text-stone">Open Alerts:</span>
            <div className={`font-bold mt-1 ${data.open_alerts > 0 ? 'text-brick' : 'text-green-600'}`}>{data.open_alerts || 0}</div>
          </div>
        </div>
      </Card>
    </div>
  )
}
