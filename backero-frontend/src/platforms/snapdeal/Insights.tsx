import { useState, useEffect } from 'react'
import Card, { PageHeader } from '../../components/Card.tsx'
import axios from 'axios'

export default function SnapdealInsights() {
  const [insights, setInsights] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        const res = await axios.get('/v1/insights/platform-analysis?marketplace=snapdeal')
        setInsights(res.data?.insights || [])
      } catch (err) {
        console.error('Error:', err)
      }
      setLoading(false)
    }
    fetchData()
    const interval = setInterval(fetchData, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  if (loading) return <Card className="text-stone">Loading insights...</Card>

  return (
    <div className="space-y-5">
      <PageHeader title="Snapdeal Insights" subtitle="AI-powered analysis" />
      {insights.length > 0 ? insights.map((i, idx) => (
        <Card key={idx} className="border-l-4 border-clay">
          <h3 className="font-semibold text-ink capitalize">{i.analysis_type?.replace('_', ' ')}</h3>
          <p className="text-sm text-stone mt-2">{i.summary}</p>
          {i.recommendations && <div className="mt-3 p-3 bg-cream rounded text-xs">{i.recommendations}</div>}
        </Card>
      )) : <Card className="text-center py-8 text-stone">No insights yet</Card>}
    </div>
  )
}
