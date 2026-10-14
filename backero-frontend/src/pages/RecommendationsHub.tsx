import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { platformFromPath, marketplaceId } from '../hooks/platformScope.ts'
import Card, { PageHeader } from '../components/Card.tsx'
import api from '../api/axios.js'
import { ChevronDown, ChevronUp, CheckCircle, Clock, AlertCircle, LayoutGrid, ListOrdered, CircleCheck, Zap, Settings, Wrench } from 'lucide-react'
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
    { id: 'amazon_in', label: 'Amazon', color: '#FF9900' },
    { id: 'meesho', label: 'Meesho', color: '#f43397' },
    { id: 'snapdeal', label: 'Snapdeal', color: '#e40046' },
    { id: 'flipkart', label: 'Flipkart', color: '#2874f0' },
  ]

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        const marketplaceParam = selectedMarketplace === 'all' ? '' : `?marketplace=${selectedMarketplace}`

        const [recsRes, summaryRes] = await Promise.all([
          api.get(`/marketflow/v1/recommendations/action-plan${marketplaceParam}`).catch(() => ({ data: { recommendations: [] } })),
          api.get(`/marketflow/v1/insights/summary${marketplaceParam}`).catch(() => ({ data: {} })),
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

  if (loading) return <Card className="text-gray-400">Loading recommendations...</Card>

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
    high: 'bg-red-500 text-white',
    medium: 'bg-amber-500 text-white',
    low: 'bg-gray-400 text-white',
  }

  const effortMap: any = {
    easy: { icon: Zap, label: 'Easy' },
    moderate: { icon: Settings, label: 'Moderate' },
    complex: { icon: Wrench, label: 'Complex' },
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
          <h2 className="mb-3 text-sm font-bold text-gray-900">Top Recommendations by Priority Score</h2>
          <PriorityBarChart
            data={recommendations.map((r) => ({ id: r.id, label: r.title, score: r.priority_score || 0, priority: r.priority }))}
          />
        </Card>
      )}

      {/* Platform & Priority Filters */}
      <Card className="bg-orange-50 border-l-4 border-orange-500">
        <div className="space-y-3">
          {!scope && (<div>
            <div className="text-xs font-bold text-gray-700 mb-2">Select Marketplace:</div>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setSelectedMarketplace('all')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  selectedMarketplace === 'all' ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-400'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />All Platforms
              </button>
              {marketplaces.map((mp) => (
                <button
                  key={mp.id}
                  onClick={() => setSelectedMarketplace(mp.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    selectedMarketplace === mp.id ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-400'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: mp.color }} />
                  {mp.label}
                </button>
              ))}
            </div>
          </div>)}

          {recommendations.length > 0 && (
            <div>
              <div className="text-xs font-bold text-gray-700 mb-2">Filter by Priority:</div>
              <div className="flex gap-2">
                <button
                  onClick={() => setFilterPriority(null)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    filterPriority === null ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-400'
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
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors capitalize ${
                        filterPriority === p ? `${priorityColors[p]}` : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-400'
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
          {filtered.map((rec) => {
            const EffortIcon = effortMap[rec.implementation_effort]?.icon
            return (
            <div key={rec.id} className="border border-gray-200 rounded-xl overflow-hidden">
              <button
                onClick={() => setExpandedId(expandedId === rec.id ? null : rec.id)}
                className="w-full p-4 bg-white hover:bg-gray-50 transition-colors text-left flex items-start justify-between gap-3"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${priorityColors[rec.priority]}`}>
                      {rec.priority.toUpperCase()}
                    </span>
                    <span className={`text-[10px] font-semibold px-2 py-1 rounded-full capitalize ${categoryColors[rec.category] || 'bg-gray-100'}`}>
                      {rec.category}
                    </span>
                    <span className="text-[10px] text-gray-400 capitalize">{rec.marketplace}</span>
                  </div>
                  <h3 className="font-bold text-sm text-gray-900">{rec.title}</h3>
                  <p className="text-xs text-gray-600 mt-1">{rec.description}</p>
                  <div className="flex gap-4 mt-2 text-[10px] text-gray-400">
                    <span>Impact: {rec.estimated_impact}%</span>
                    <span className="inline-flex items-center gap-1">
                      Effort: {EffortIcon && <EffortIcon size={11} />}{effortMap[rec.implementation_effort]?.label}
                    </span>
                    <span>Score: {rec.priority_score?.toFixed(1)}</span>
                  </div>
                </div>
                {expandedId === rec.id ? <ChevronUp size={20} className="text-orange-500" /> : <ChevronDown size={20} className="text-gray-400" />}
              </button>

              {expandedId === rec.id && (
                <div className="border-t border-gray-200 p-4 bg-gray-50/60 space-y-4">
                  {/* Action Steps */}
                  {rec.action_steps && rec.action_steps.length > 0 && (
                    <div>
                      <h4 className="font-bold text-gray-900 text-xs mb-2 flex items-center gap-1.5"><ListOrdered className="w-3.5 h-3.5 text-orange-500" />Action Steps:</h4>
                      <ol className="space-y-2">
                        {rec.action_steps.map((step: string, idx: number) => (
                          <li key={idx} className="flex gap-3 text-xs text-gray-600">
                            <span className="font-bold text-orange-500 flex-shrink-0">{idx + 1}.</span>
                            <span>{step}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}

                  {/* Success Metrics */}
                  {rec.success_metrics && rec.success_metrics.length > 0 && (
                    <div>
                      <h4 className="font-bold text-gray-900 text-xs mb-2 flex items-center gap-1.5"><CircleCheck className="w-3.5 h-3.5 text-green-600" />Success Metrics:</h4>
                      <div className="space-y-1">
                        {rec.success_metrics.map((metric: any, idx: number) => (
                          <div key={idx} className="text-xs text-gray-600">
                            {metric.metric}: Target <span className="font-bold text-gray-900">{metric.target}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Status Buttons */}
                  <div className="flex gap-2">
                    <button className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-bold hover:bg-green-700 transition-colors flex items-center gap-1">
                      <CheckCircle size={14} />
                      Mark Done
                    </button>
                    <button className="px-3 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-bold hover:bg-amber-600 transition-colors flex items-center gap-1">
                      <Clock size={14} />
                      In Progress
                    </button>
                    <button className="px-3 py-1.5 bg-gray-400 text-white rounded-lg text-xs font-bold hover:bg-gray-500 transition-colors flex items-center gap-1">
                      <AlertCircle size={14} />
                      Dismiss
                    </button>
                  </div>
                </div>
              )}
            </div>
            )
          })}
        </div>
      ) : (
        <Card className="text-center py-8">
          <p className="text-gray-500 mb-2 text-sm">No recommendations yet</p>
          <p className="text-xs text-gray-400">Recommendations will appear after the 4-hour analysis cycle runs</p>
        </Card>
      )}

      <Card className="text-[10px] text-gray-400 bg-gray-50">
        Updated: {new Date().toLocaleString()}
      </Card>
    </div>
  )
}
