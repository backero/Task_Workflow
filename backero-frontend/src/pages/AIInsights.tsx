import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { platformFromPath, marketplaceId } from '../hooks/platformScope.ts'
import Card, { PageHeader } from '../components/Card.tsx'
import api from '../api/axios.js'
import { Lightbulb, AlertCircle, TrendingUp, Target, LayoutGrid } from 'lucide-react'
import { StatTile } from '../components/charts/index.ts'

type Insight = {
  id: number
  analysis_type: string
  marketplace: string | null
  summary: string
  findings_json: any
  recommendations: string
  confidence_score: number
  generated_at: string
}

export default function AIInsights() {
  const location = useLocation()
  const [insights, setInsights] = useState<Insight[]>([])
  const [summary, setSummary] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [selectedType, setSelectedType] = useState<string | null>(null)
  const scope = platformFromPath(location.pathname)
  const [selectedMarketplace, setSelectedMarketplace] = useState<string>(scope ? marketplaceId(scope) : 'all')

  const marketplaces = [
    { id: 'all', label: 'All Platforms' },
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

        const [insightsRes, summaryRes] = await Promise.all([
          api.get(`/marketflow/v1/insights/platform-analysis${marketplaceParam}`).catch(() => ({ data: { insights: [] } })),
          api.get(`/marketflow/v1/insights/summary${marketplaceParam}`).catch(() => ({ data: {} })),
        ])
        setInsights(insightsRes.data.insights || [])
        setSummary(summaryRes.data)
      } catch (err) {
        console.error('Error fetching insights:', err)
      }
      setLoading(false)
    }

    fetchData()
    const interval = setInterval(fetchData, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [selectedMarketplace])

  if (loading) return <Card className="text-gray-400">Loading AI insights...</Card>

  const typeMap: any = {
    ctr_trends: { label: 'CTR Trends', icon: TrendingUp, color: '#f97316' },
    cvr_patterns: { label: 'CVR Patterns', icon: Target, color: '#ea580c' },
    profitability_gaps: { label: 'Profitability', icon: Lightbulb, color: '#f97316' },
    risk_detection: { label: 'Risk Detection', icon: AlertCircle, color: '#ef4444' },
  }

  const filtered = selectedType ? insights.filter((i) => i.analysis_type === selectedType) : insights

  return (
    <div className="space-y-5">
      <PageHeader
        title="AI Insights & Analysis"
        subtitle="Automated analysis of platform performance, trends, and opportunities across all marketplaces"
      />

      {/* Platform Selector */}
      {!scope && (<Card className="bg-orange-50 border-l-4 border-orange-500">
        <div className="flex items-center gap-2 flex-wrap">
          {marketplaces.map((mp) => (
            <button
              key={mp.id}
              onClick={() => setSelectedMarketplace(mp.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                selectedMarketplace === mp.id ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-400'
              }`}
            >
              {mp.color
                ? <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: mp.color }} />
                : <LayoutGrid className="w-3.5 h-3.5" />}
              {mp.label}
            </button>
          ))}
        </div>
      </Card>)}

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-4 gap-3">
          <StatTile label="High Priority" value={summary.recommendations_summary?.high_priority || 0} format="number" accentColor="#c05a3d" />
          <StatTile label="In Progress" value={summary.recommendations_summary?.in_progress || 0} format="number" />
          <StatTile label="Completed" value={summary.recommendations_summary?.completed || 0} format="number" accentColor="#6b8f5a" />
          <StatTile
            label="Avg Confidence"
            value={insights.length > 0 ? insights.reduce((sum: number, i) => sum + (i.confidence_score || 0), 0) / insights.length * 100 : 0}
            format="percent"
          />
        </div>
      )}

      {/* Type Filter */}
      {insights.length > 0 && (
        <Card className="bg-gray-50">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setSelectedType(null)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                selectedType === null ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-400'
              }`}
            >
              All Insights ({insights.length})
            </button>
            {Object.entries(typeMap).map(([key, type]: [string, any]) => {
              const count = insights.filter((i) => i.analysis_type === key).length
              if (count === 0) return null
              return (
                <button
                  key={key}
                  onClick={() => setSelectedType(key)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border"
                  style={selectedType === key ? { background: type.color, borderColor: type.color, color: 'white' } : { background: 'white', borderColor: '#e5e7eb', color: '#4b5563' }}
                >
                  {type.label} ({count})
                </button>
              )
            })}
          </div>
        </Card>
      )}

      {/* Insights List */}
      {filtered.length > 0 ? (
        <div className="space-y-3">
          {filtered.map((insight) => {
            const typeInfo = typeMap[insight.analysis_type]
            const Icon = typeInfo?.icon

            return (
              <Card key={insight.id} className="border-l-4" style={{ borderLeftColor: typeInfo?.color || '#f97316' }}>
                <div className="flex items-start gap-3">
                  {Icon && <Icon size={20} className="mt-1 flex-shrink-0" style={{ color: typeInfo?.color || '#f97316' }} />}
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-bold text-sm text-gray-900">{typeInfo?.label || insight.analysis_type}</h3>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-semibold px-2 py-1 bg-gray-100 text-gray-600 rounded-full">
                          Confidence: {(insight.confidence_score * 100).toFixed(0)}%
                        </span>
                        {insight.marketplace && (
                          <span className="text-[10px] font-semibold px-2 py-1 bg-orange-50 text-orange-600 rounded-full capitalize">{insight.marketplace}</span>
                        )}
                      </div>
                    </div>

                    <p className="text-xs text-gray-600 mb-3">{insight.summary}</p>

                    {/* Findings */}
                    {insight.findings_json && typeof insight.findings_json === 'object' && (
                      <div className="bg-gray-50 border border-gray-100 p-3 rounded-lg mb-3 text-xs">
                        <div className="font-bold text-gray-900 mb-2">Key Findings:</div>
                        <pre className="text-gray-500 whitespace-pre-wrap break-words">
                          {JSON.stringify(insight.findings_json, null, 2)}
                        </pre>
                      </div>
                    )}

                    {/* Recommendations */}
                    {insight.recommendations && (
                      <div className="bg-orange-50/60 border border-orange-100 p-3 rounded-lg">
                        <div className="font-bold text-gray-900 mb-2 text-xs">Recommendations:</div>
                        <div className="text-xs text-gray-600 whitespace-pre-wrap">{insight.recommendations}</div>
                      </div>
                    )}

                    <div className="text-[10px] text-gray-400 mt-2">
                      Generated: {new Date(insight.generated_at).toLocaleString()}
                    </div>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      ) : (
        <Card className="text-center py-8">
          <p className="text-gray-500 mb-2 text-sm">No insights yet</p>
          <p className="text-xs text-gray-400">AI insights will appear after the 4-hour analysis cycle runs</p>
        </Card>
      )}

      <Card className="text-[10px] text-gray-400 bg-gray-50">
        Updated: {new Date().toLocaleString()}
      </Card>
    </div>
  )
}
