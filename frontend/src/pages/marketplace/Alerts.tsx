import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { platformFromPath, marketplaceId } from '../hooks/platformScope'
import Card, { PageHeader } from '../components/Card'
import StatusDot from '../components/StatusDot'
import axios from 'axios'
import { useAutoRefresh } from '../hooks/useAutoRefresh'
import { AlertTriangle, CheckCircle2, Clock, Lightbulb } from 'lucide-react'
import { StatTile, SeverityBreakdownChart } from '../components/charts/index'
import { PLATFORM_LABELS } from '../theme/colors'

type Alert = {
  id: string
  rule_id: string
  title: string
  message: string
  suggested_action: string
  severity: 'red' | 'amber' | 'green'
  fired_at: string
  scope_id: string
}

type AlertStats = {
  totalOpen: number
  critical: number
  warnings: number
  info: number
  mostRecent?: string
}

type Insight = {
  generatedAt: string
  insight: string
  confidence: number
}

export default function AlertsPage() {
  const location = useLocation()
  const getInitialMarketplace = () => {
    const referer = location.state?.from || document.referrer || ''
    if (referer.includes('/meesho')) return 'meesho'
    if (referer.includes('/snapdeal')) return 'snapdeal'
    if (referer.includes('/flipkart')) return 'flipkart'
    return 'amazon'
  }

  const scope = platformFromPath(location.pathname)
  const [marketplace, setMarketplace] = useState(scope ? marketplaceId(scope) : getInitialMarketplace())
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [stats, setStats] = useState<AlertStats | null>(null)
  const [insights, setInsights] = useState<Insight[]>([])
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null)
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
      axios.get(`/v1/alerts?marketplace=${marketplace}`).then(r => {
        setAlerts(r.data.alerts || [])
      }).catch(() => {}),
      axios.get(`/v1/alerts/stats?marketplace=${marketplace}`).then(r => {
        setStats(r.data.stats)
      }).catch(() => {}),
      axios.get(`/v1/insights?marketplace=${marketplace}`).then(r => {
        if (r.data.insights) {
          setInsights(r.data.insights)
        }
      }).catch(() => {}),
    ]).finally(() => setLoading(false))
  }, [marketplace], 60_000)

  const handleAcknowledge = async (alertId: string) => {
    try {
      await axios.patch(`/v1/alerts/${alertId}/acknowledge`)
      setAlerts(alerts.filter(a => a.id !== alertId))
      setSelectedAlert(null)
    } catch (e) {
      console.error('Failed to acknowledge alert:', e)
    }
  }

  const handleResolve = async (alertId: string) => {
    try {
      await axios.patch(`/v1/alerts/${alertId}/resolve`)
      setAlerts(alerts.filter(a => a.id !== alertId))
      setSelectedAlert(null)
    } catch (e) {
      console.error('Failed to resolve alert:', e)
    }
  }

  const getSeverityColor = (severity: string) => {
    if (severity === 'red') return 'red'
    if (severity === 'amber') return 'amber'
    return 'green'
  }

  const getSeverityLabel = (severity: string) => {
    if (severity === 'red') return 'Critical'
    if (severity === 'amber') return 'Warning'
    return 'Info'
  }

  if (loading && alerts.length === 0) return <Card className="text-stone">Loading alerts…</Card>

  return (
    <div className="space-y-5">
      <PageHeader
        title="Alerts & AI Insights"
        subtitle="Real-time automated alerts on profitability, quality, and operational issues. AI-generated recommendations for optimization."
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

      {/* Alert Summary Stats */}
      {stats && (
        <>
          <div className="grid grid-cols-4 gap-3">
            <StatTile label="Open Alerts" value={stats.totalOpen} format="number" />
            <StatTile label="Critical" value={stats.critical} format="number" accentColor="#c05a3d" />
            <StatTile label="Warnings" value={stats.warnings} format="number" accentColor="#d9a441" />
            <StatTile label="Info" value={stats.info} format="number" accentColor="#6b8f5a" />
          </div>
          <Card>
            <h2 className="mb-3 text-sm font-semibold text-ink">Severity Breakdown</h2>
            <SeverityBreakdownChart
              data={[{ label: PLATFORM_LABELS[marketplace] || marketplace, critical: stats.critical, warning: stats.warnings, info: stats.info }]}
              height={90}
            />
          </Card>
        </>
      )}

      <div className="grid grid-cols-3 gap-5">
        {/* Alerts List */}
        <div className="col-span-2 space-y-3">
          <Card>
            <h2 className="mb-3 text-sm font-semibold text-ink">Active Alerts ({alerts.length})</h2>
            {alerts.length === 0 ? (
              <p className="text-sm text-stone py-4 text-center">✓ All systems healthy - no alerts</p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {alerts.map(alert => (
                  <div
                    key={alert.id}
                    onClick={() => setSelectedAlert(alert)}
                    className={`p-3 rounded-lg border-l-4 cursor-pointer transition-colors ${
                      alert.severity === 'red'
                        ? 'bg-red-50 border-brick hover:bg-red-100'
                        : alert.severity === 'amber'
                        ? 'bg-amber-50 border-amber hover:bg-amber-100'
                        : 'bg-cream border-clay hover:bg-sand'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-2 flex-1">
                        <StatusDot status={getSeverityColor(alert.severity)} />
                        <div className="flex-1">
                          <h3 className="font-medium text-ink text-sm">{alert.title}</h3>
                          <p className="text-xs text-stone mt-0.5">{alert.message}</p>
                          {alert.scope_id && alert.scope_id !== 'all' && (
                            <p className="text-xs text-clay font-mono mt-1">SKU: {alert.scope_id}</p>
                          )}
                        </div>
                      </div>
                      <span className="text-xs text-stone whitespace-nowrap ml-2">
                        {new Date(alert.fired_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Alert Detail & AI Insights */}
        <div className="space-y-3">
          {/* Selected Alert Detail */}
          {selectedAlert && (
            <Card className="border-l-4 border-clay">
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-semibold text-ink text-sm">Alert Details</h3>
                <button
                  onClick={() => setSelectedAlert(null)}
                  className="text-stone hover:text-ink text-lg"
                >
                  ×
                </button>
              </div>
              <div className="space-y-2 text-sm mb-4">
                <div>
                  <span className="text-xs text-stone uppercase tracking-wide">Severity:</span>
                  <div className="mt-1 flex items-center gap-2">
                    <StatusDot status={getSeverityColor(selectedAlert.severity)} />
                    <span className="font-semibold text-ink">{getSeverityLabel(selectedAlert.severity)}</span>
                  </div>
                </div>
                <div>
                  <span className="text-xs text-stone uppercase tracking-wide">Rule:</span>
                  <p className="mt-1 text-ink font-mono text-xs">{selectedAlert.rule_id}</p>
                </div>
                <div>
                  <span className="text-xs text-stone uppercase tracking-wide">Suggested Action:</span>
                  <p className="mt-1 text-ink">{selectedAlert.suggested_action}</p>
                </div>
              </div>
              <div className="flex gap-2 pt-3 border-t border-sand">
                <button
                  onClick={() => handleAcknowledge(selectedAlert.id)}
                  className="flex-1 px-3 py-1.5 bg-cream hover:bg-sand text-ink text-xs font-medium rounded transition-colors"
                >
                  <Clock size={13} className="inline mr-1" /> Acknowledge
                </button>
                <button
                  onClick={() => handleResolve(selectedAlert.id)}
                  className="flex-1 px-3 py-1.5 bg-clay hover:bg-ember text-white text-xs font-medium rounded transition-colors"
                >
                  <CheckCircle2 size={13} className="inline mr-1" /> Resolved
                </button>
              </div>
            </Card>
          )}

          {/* AI Insights */}
          {insights.length > 0 && (
            <Card className="bg-cream">
              <div className="flex items-center gap-2 mb-2">
                <Lightbulb size={16} className="text-clay" />
                <h3 className="font-semibold text-ink text-sm">AI Insights</h3>
              </div>
              <div className="text-xs text-stone mb-2">
                {insights[0]?.generatedAt && new Date(insights[0].generatedAt).toLocaleString()}
              </div>
              <div className="text-sm text-ink leading-relaxed line-clamp-6 max-h-48 overflow-y-auto">
                {insights[0]?.insight || 'Generating insights...'}
              </div>
              <div className="mt-2 text-xs text-stone">
                Confidence: {((insights[0]?.confidence || 0) * 100).toFixed(0)}%
              </div>
            </Card>
          )}

          {/* No Alerts */}
          {alerts.length === 0 && insights.length === 0 && !loading && (
            <Card className="text-center py-6">
              <p className="text-sm text-stone">👍 All systems healthy</p>
              <p className="text-xs text-stone mt-1">AI insights will appear as data is analyzed</p>
            </Card>
          )}
        </div>
      </div>

      {/* Alert Rules Reference */}
      <Card>
        <h2 className="mb-3 text-sm font-semibold text-ink">Alert Rules Reference</h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <h3 className="font-medium text-ink mb-2">🔴 Critical Alerts</h3>
            <ul className="space-y-1 text-stone text-xs">
              <li>• Negative margin products</li>
              <li>• High return rate ({'>'})10%)</li>
              <li>• Quality issues detected</li>
            </ul>
          </div>
          <div>
            <h3 className="font-medium text-ink mb-2">🟠 Warnings</h3>
            <ul className="space-y-1 text-stone text-xs">
              <li>• Low margin products (&lt;10%)</li>
              <li>• Slow-moving inventory</li>
              <li>• High fee ratio ({'>'}35%)</li>
            </ul>
          </div>
        </div>
      </Card>
    </div>
  )
}
