import { useState, useEffect } from 'react'
import Card, { PageHeader } from '../../components/Card.js'
import axios from 'axios'

export default function MeeshoInsights() {
  const [insights, setInsights] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        const res = await axios.get('/v1/insights/platform-analysis?marketplace=meesho')
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

  if (loading) return <Card className="text-stone">Loading Meesho insights...</Card>

  return (
    <div className="space-y-5">
      <PageHeader title="Meesho Insights" subtitle="AI-powered analysis and recommendations" />

      {insights.length > 0 ? (
        insights.map((insight, idx) => (
          <Card key={idx} className="border-l-4 border-clay">
            <h3 className="font-semibold text-ink capitalize">{insight.analysis_type?.replace('_', ' ')}</h3>
            <p className="text-sm text-stone mt-2">{insight.summary}</p>
            {insight.recommendations && (
              <div className="mt-3 p-3 bg-cream rounded text-xs text-ink whitespace-pre-wrap">{insight.recommendations}</div>
            )}
          </Card>
        ))
      ) : (
        <Card className="text-center py-8 text-stone">No insights generated yet</Card>
      )}
    </div>
  )
}
