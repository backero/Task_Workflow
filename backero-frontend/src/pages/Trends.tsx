import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import Card, { PageHeader } from '../components/Card.tsx'
import api from '../api/axios.js'
import { useAutoRefresh } from '../hooks/useAutoRefresh.ts'
import { StatTile, TrendLineChart } from '../components/charts/index.ts'
import { platformColor } from '../theme/colors.ts'

type Metric = { key: string; label: string }
type Point = { date: string; capturedAt: string; metrics: Record<string, number> }
type Trend = { platform: string; periodDays: number; points: Point[]; availableMetrics: Metric[]; note?: string }
const platforms = [{ id: 'amazon', label: 'Amazon' }, { id: 'flipkart', label: 'Flipkart' }, { id: 'meesho', label: 'Meesho' }, { id: 'snapdeal', label: 'Snapdeal' }]
const asPlatform = (value?: string) => value === 'amazon_in' ? 'amazon' : value || 'amazon'
const format = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 })
const isMoney = (key: string) => /sales|revenue|balance|price|payable|amount|net_sales/i.test(key)
const display = (value: number | undefined, key: string) => value == null ? '—' : isMoney(key) ? `₹${format.format(value)}` : format.format(value)

export default function TrendsPage() {
  const location = useLocation()
  const scope = location.pathname.split('/').find((part) => platforms.some((item) => item.id === asPlatform(part)))
  const [platform, setPlatform] = useState(asPlatform(scope))
  const [all, setAll] = useState<Record<string, Trend>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [metric, setMetric] = useState('')
  useAutoRefresh(() => {
    setLoading(true); setError(null)
    Promise.all(platforms.map(async ({ id }) => [id, (await api.get(`/marketflow/${id}/seller-trends`, { params: { days: 90 } })).data] as const))
      .then((rows) => setAll(Object.fromEntries(rows)))
      .catch(() => setError('Saved marketplace history could not be loaded. Please retry.'))
      .finally(() => setLoading(false))
  }, [], 240000)
  const trend = all[platform]
  const metrics = trend?.availableMetrics || []
  useEffect(() => { if (!metrics.some((item) => item.key === metric)) setMetric(metrics[0]?.key || '') }, [platform, metrics, metric])
  const selected = metrics.find((item) => item.key === metric)
  const chart = useMemo(() => (trend?.points || []).map((point) => ({ date: point.date, value: point.metrics[metric] })), [trend, metric])
  const latest = trend?.points.at(-1)
  if (loading) return <Card className="text-stone">Loading saved marketplace history…</Card>
  return <div className="space-y-5">
    <PageHeader title="Trends & Timeline" subtitle="Real seller snapshots saved by platform and business date. Missing days are never estimated." />
    {error && <Card className="border-l-4 border-brick text-brick">{error}</Card>}
    {!scope && <Card className="bg-cream"><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-medium text-ink mr-1">Platform:</span>{platforms.map((item) => <button key={item.id} onClick={() => setPlatform(item.id)} className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${platform === item.id ? 'bg-clay text-white' : 'bg-sand text-ink hover:bg-clay hover:text-white'}`}>{item.label}</button>)}</div></Card>}
    <Card className="bg-sand"><div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">{platforms.map((item) => <div key={item.id}><span className="font-medium text-ink">{item.label}: </span><span className="text-stone">{all[item.id]?.points?.length || 0} saved day{all[item.id]?.points?.length === 1 ? '' : 's'}</span></div>)}</div></Card>
    {trend?.note && <Card className="bg-cream border-l-4 border-clay text-sm text-ink">{trend.note}</Card>}
    {metrics.length ? <>
      <Card className="bg-sand"><label className="text-sm font-medium text-ink mr-3">View saved metric:</label><select value={metric} onChange={(event) => setMetric(event.target.value)} className="bg-white border border-clay rounded px-3 py-1.5 text-sm text-ink max-w-full">{metrics.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></Card>
      {latest && selected && <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3"><StatTile label={`${selected.label} · latest`} value={latest.metrics[metric] || 0} format="number" accentColor={platformColor(platform)} /><StatTile label="Last captured" value={latest.date} format="text" accentColor={platformColor(platform)} /><StatTile label="Recorded days" value={trend.points.length} format="number" accentColor={platformColor(platform)} /><StatTile label="Window" value={`${trend.periodDays} days`} format="text" accentColor={platformColor(platform)} /></div>}
      <Card><h2 className="mb-3 text-sm font-semibold text-ink">{selected?.label} trend</h2><TrendLineChart data={chart} series={[{ key: 'value', label: selected?.label || 'Value', color: platformColor(platform) }]} yFormat={(value) => display(value, metric)} /></Card>
      <Card><h2 className="mb-3 text-sm font-semibold text-ink">Saved daily readings</h2><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-sand"><th className="text-left py-2 text-stone">Date</th><th className="text-right py-2 text-stone">{selected?.label}</th></tr></thead><tbody>{trend.points.slice().reverse().map((point) => <tr key={point.date} className="border-b border-sand hover:bg-cream"><td className="py-2 font-medium text-ink">{point.date}</td><td className="py-2 text-right text-stone">{display(point.metrics[metric], metric)}</td></tr>)}</tbody></table></div></Card>
    </> : <Card className="text-center py-8"><p className="text-stone mb-2">No saved real data yet for {platforms.find((item) => item.id === platform)?.label}</p><p className="text-xs text-stone">A reading appears after a successful seller sync. No estimates or placeholder history are shown.</p></Card>}
    <Card className="bg-sand border-l-4 border-clay"><h3 className="font-semibold text-ink text-sm mb-2">Data integrity</h3><p className="text-xs text-stone">Each point belongs only to the signed-in organization and seller platform. The archive keeps real daily mirror snapshots for future analysis.</p></Card>
  </div>
}
