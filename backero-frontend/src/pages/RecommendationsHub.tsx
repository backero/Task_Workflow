import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { platformFromPath, marketplaceId } from '../hooks/platformScope.ts'
import Card, { PageHeader } from '../components/Card.tsx'
import axios from 'axios'
import { ChevronDown, ChevronUp, CheckCircle, Clock, AlertCircle } from 'lucide-react'
import { StatTile, PriorityBarChart } from '../components/charts/index.ts'

type Recommendation = {
  id: number
  marketplace: string
  category: string
  title: string
  description: string
  action_steps: string[]
  priority: 'high' | 'medium' | 'low'
  estimated_impact: number
  implementation_effort: 'easy' | 'moderate' | 'complex'
  success_metrics: any[]
  status: string
  priority_score: number
}

export default function RecommendationsHub() {
  const location = useLocation()
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [summary, setSummary] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [filterPriority, setFilterPriority] = useState<string | null>(null)
  const scope = platformFromPath(location.pathname)
  const [selectedMarketplace, setSelectedMarketplace] = useState<string>(scope ? marketplaceId(scope) : 'all')

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
        const marketplaceParam = selectedMarketplace === 'all' ? '' : `?marketplace=${selectedMarketplace}`

        const [recsRes, summaryRes] = await Promise.all([
          axios.get(`/v1/recommendations/action-plan${marketplaceParam}`).catch(() => ({ data: { recommendations: [] } })),
          axios.get(`/v1/insights/summary${marketplaceParam}`).catch(() => ({ data: {} })),
        ])
        setRecommendations(recsRes.data.recommendations || [])
        setSummary(summaryRes.data)
      } catch (err) {
        console.error('Error fetching recommendations:', err)
        setRecommendations([])
      }
      setLoading(false)
    }

    fetchData()
    const interval = setInterval(fetchData, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [selectedMarketplace])

  if (loading) return <Card className="text-stone">Loading recommendations...</Card>

  const filtered = recommendations.filter((rec) => {
    if (filterPriority && rec.priority !== filterPriority) return false
    return true
  })

  const categoryColors: any = {
    pricing: 'bg-amber-100 text-amber-700',
    inventory: 'bg-blue-100 text-blue-700',
    marketing: 'bg-purple-100 text-purple-700',
    quality: 'bg-red-100 text-red-700',
    platform_strategy: 'bg-green-100 text-green-700',
    operations: 'bg-indigo-100 text-indigo-700',
  }

  const priorityColors: any = {
    high: 'bg-brick text-white',
    medium: 'bg-amber-500 text-white',
    low: 'bg-stone text-white',
  }

  const effortMap: any = {
    easy: '⚡ Easy',
    moderate: '⚙️ Moderate',
    complex: '🔧 Complex',
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Recommendations Hub"
        subtitle="Prioritized action plans to optimize your marketplace performance"
      />

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-4 gap-3">
          <StatTile label="High Priority" value={summary.recommendations_summary?.high_priority || 0} format="number" accentColor="#c05a3d" />
          <StatTile label="Medium Priority" value={summary.recommendations_summary?.medium_priority || 0} format="number" accentColor="#d9a441" />
          <StatTile label="Total Impact" value={summary.recommendations_summary?.total_estimated_impact || 0} format="percent" />
          <StatTile label="Platforms" value={summary.recommendations_summary?.platforms_with_recommendations || 0} format="number" />
        </div>
      )}

      {/* Priority skim chart */}
      {recommendations.length > 0 && (
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-ink">Top Recommendations by Priority Score</h2>
          <PriorityBarChart
            data={recommendations.map((r) => ({ id: r.id, label: r.title, score: r.priority_score || 0, priority: r.priority }))}
          />
        </Card>
      )}

      {/* Platform & Priority Filters */}
      <Card className="bg-cream border-l-4 border-clay">
        <div className="space-y-3">
          {!scope && (<div>
            <div className="text-xs font-medium text-ink mb-2">Select Marketplace:</div>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setSelectedMarketplace('all')}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  selectedMarketplace === 'all' ? 'bg-clay text-white' : 'bg-sand text-ink hover:bg-clay hover:text-white'
                }`}
              >
                📊 All Platforms
              </button>
              {marketplaces.map((mp) => (
                <button
                  key={mp.id}
                  onClick={() => setSelectedMarketplace(mp.id)}
                  className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                    selectedMarketplace === mp.id ? 'bg-clay text-white' : 'bg-sand text-ink hover:bg-clay hover:text-white'
                  }`}
                >
                  {mp.label}
                </button>
              ))}
            </div>
          </div>)}

          {recommendations.length > 0 && (
            <div>
              <div className="text-xs font-medium text-ink mb-2">Filter by Priority:</div>
              <div className="flex gap-2">
                <button
                  onClick={() => setFilterPriority(null)}
                  className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                    filterPriority === null ? 'bg-clay text-white' : 'bg-sand text-ink hover:bg-clay hover:text-white'
                  }`}
                >
                  All
                </button>
                {['high', 'medium', 'low'].map((p) => {
                  const count = recommendations.filter((r) => r.priority === p).length
                  if (count === 0) return null
                  return (
                    <button
                      key={p}
                      onClick={() => setFilterPriority(p)}
                      className={`px-3 py-1.5 rounded text-sm font-medium transition-colors capitalize ${
                        filterPriority === p ? `${priorityColors[p]}` : 'bg-sand text-ink hover:bg-clay hover:text-white'
                      }`}
                    >
                      {p} ({count})
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Recommendations List */}
      {filtered.length > 0 ? (
        <div className="space-y-3">
          {filtered.map((rec) => (
            <div key={rec.id} className="border border-sand rounded-lg overflow-hidden">
              <button
                onClick={() => setExpandedId(expandedId === rec.id ? null : rec.id)}
                className="w-full p-4 bg-white hover:bg-cream/50 transition-colors text-left flex items-start justify-between gap-3"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-xs font-bold px-2 py-1 rounded ${priorityColors[rec.priority]}`}>
                      {rec.priority.toUpperCase()}
                    </span>
                    <span className={`text-xs px-2 py-1 rounded capitalize ${categoryColors[rec.category] || 'bg-gray-100'}`}>
                      {rec.category}
                    </span>
                    <span className="text-xs text-stone capitalize">{rec.marketplace}</span>
                  </div>
                  <h3 className="font-semibold text-ink">{rec.title}</h3>
                  <p className="text-sm text-stone mt-1">{rec.description}</p>
                  <div className="flex gap-4 mt-2 text-xs text-stone/60">
                    <span>Impact: {rec.estimated_impact}%</span>
                    <span>Effort: {effortMap[rec.implementation_effort]}</span>
                    <span>Score: {rec.priority_score?.toFixed(1)}</span>
                  </div>
                </div>
                {expandedId === rec.id ? <ChevronUp size={20} className="text-clay" /> : <ChevronDown size={20} className="text-stone" />}
              </button>

              {expandedId === rec.id && (
                <div className="border-t border-sand p-4 bg-cream/30 space-y-4">
                  {/* Action Steps */}
                  {rec.action_steps && rec.action_steps.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-ink text-sm mb-2">📋 Action Steps:</h4>
                      <ol className="space-y-2">
                        {rec.action_steps.map((step: string, idx: number) => (
                          <li key={idx} className="flex gap-3 text-sm text-stone">
                            <span className="font-bold text-clay flex-shrink-0">{idx + 1}.</span>
                            <span>{step}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}

                  {/* Success Metrics */}
                  {rec.success_metrics && rec.success_metrics.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-ink text-sm mb-2">✅ Success Metrics:</h4>
                      <div className="space-y-1">
                        {rec.success_metrics.map((metric: any, idx: number) => (
                          <div key={idx} className="text-sm text-stone">
                            {metric.metric}: Target <span className="font-bold text-ink">{metric.target}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Status Buttons */}
                  <div className="flex gap-2">
                    <button className="px-3 py-1.5 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700 transition-colors flex items-center gap-1">
                      <CheckCircle size={14} />
                      Mark Done
                    </button>
                    <button className="px-3 py-1.5 bg-amber-500 text-white rounded text-xs font-medium hover:bg-amber-600 transition-colors flex items-center gap-1">
                      <Clock size={14} />
                      In Progress
                    </button>
                    <button className="px-3 py-1.5 bg-stone text-white rounded text-xs font-medium hover:bg-stone/80 transition-colors flex items-center gap-1">
                      <AlertCircle size={14} />
                      Dismiss
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <Card className="text-center py-8">
          <p className="text-stone mb-2">No recommendations yet</p>
          <p className="text-xs text-stone">Recommendations will appear after the 4-hour analysis cycle runs</p>
        </Card>
      )}

      <Card className="text-xs text-stone bg-cream">
        Updated: {new Date().toLocaleString()}
      </Card>
    </div>
  )
}
