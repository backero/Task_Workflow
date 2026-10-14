import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { platformFromPath, marketplaceId } from '../hooks/platformScope.js'
import Card, { PageHeader } from '../components/Card.js'
import axios from 'axios'
import { Lightbulb, AlertCircle, TrendingUp, Target } from 'lucide-react'
import { StatTile } from '../components/charts/index.js'

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
    { id: 'all', label: '📊 All Platforms' },
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

        const [insightsRes, summaryRes] = await Promise.all([
          axios.get(`/v1/insights/platform-analysis${marketplaceParam}`).catch(() => ({ data: { insights: [] } })),
          axios.get(`/v1/insights/summary${marketplaceParam}`).catch(() => ({ data: {} })),
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

  if (loading) return <Card className="text-stone">Loading AI insights...</Card>

  const typeMap: any = {
    ctr_trends: { label: 'CTR Trends', icon: TrendingUp, color: 'clay' },
    cvr_patterns: { label: 'CVR Patterns', icon: Target, color: 'ember' },
    profitability_gaps: { label: 'Profitability', icon: Lightbulb, color: 'clay' },
    risk_detection: { label: 'Risk Detection', icon: AlertCircle, color: 'brick' },
  }

  const filtered = selectedType ? insights.filter((i) => i.analysis_type === selectedType) : insights

  return (
    <div className="space-y-5">
      <PageHeader
        title="AI Insights & Analysis"
        subtitle="Automated analysis of platform performance, trends, and opportunities across all marketplaces"
      />

      {/* Platform Selector */}
      {!scope && (<Card className="bg-cream border-l-4 border-clay">
        <div className="flex items-center gap-2 flex-wrap">
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
        <Card className="bg-cream">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setSelectedType(null)}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                selectedType === null ? 'bg-clay text-white' : 'bg-sand text-ink hover:bg-clay hover:text-white'
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
                  className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                    selectedType === key ? `bg-${type.color} text-white` : 'bg-sand text-ink hover:bg-clay hover:text-white'
                  }`}
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
              <Card key={insight.id} className="border-l-4 border-clay">
                <div className="flex items-start gap-3">
                  {Icon && <Icon size={20} className="text-clay mt-1 flex-shrink-0" />}
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-semibold text-ink">{typeInfo?.label || insight.analysis_type}</h3>
                      <div className="flex items-center gap-2">
                        <span className="text-xs px-2 py-1 bg-sand rounded">
                          Confidence: {(insight.confidence_score * 100).toFixed(0)}%
                        </span>
                        {insight.marketplace && (
                          <span className="text-xs px-2 py-1 bg-cream rounded capitalize">{insight.marketplace}</span>
                        )}
                      </div>
                    </div>

                    <p className="text-sm text-stone mb-3">{insight.summary}</p>

                    {/* Findings */}
                    {insight.findings_json && typeof insight.findings_json === 'object' && (
                      <div className="bg-white p-3 rounded mb-3 text-xs">
                        <div className="font-medium text-ink mb-2">Key Findings:</div>
                        <pre className="text-stone whitespace-pre-wrap break-words">
                          {JSON.stringify(insight.findings_json, null, 2)}
                        </pre>
                      </div>
                    )}

                    {/* Recommendations */}
                    {insight.recommendations && (
                      <div className="bg-cream p-3 rounded">
                        <div className="font-medium text-ink mb-2 text-sm">Recommendations:</div>
                        <div className="text-xs text-stone whitespace-pre-wrap">{insight.recommendations}</div>
                      </div>
                    )}

                    <div className="text-xs text-stone/60 mt-2">
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
          <p className="text-stone mb-2">No insights yet</p>
          <p className="text-xs text-stone">AI insights will appear after the 4-hour analysis cycle runs</p>
        </Card>
      )}

      <Card className="text-xs text-stone bg-cream">
        Updated: {new Date().toLocaleString()}
      </Card>
    </div>
  )
}
