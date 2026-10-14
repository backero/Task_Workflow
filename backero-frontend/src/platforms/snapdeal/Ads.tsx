import { useState } from 'react'
import Card, { PageHeader } from '../../components/Card.tsx'
import { useAutoRefresh } from '../../hooks/useAutoRefresh.ts'
import { getSnapdealAds, type SnapdealAds } from './api.ts'

function Tile({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <div className="text-xs font-medium uppercase tracking-wide text-stone">{label}</div>
      <div className="mt-1 text-xl font-bold text-ink">{value}</div>
    </Card>
  )
}

export default function SnapdealAdsPage() {
  const [data, setData] = useState<SnapdealAds | null>(null)
  const [error, setError] = useState<string | null>(null)
  useAutoRefresh(() => { getSnapdealAds().then(setData).catch((e) => setError(String(e))) }, [], 60_000)

  if (error) return <Card className="text-brick">Could not reach Snapdeal's app on port 8300 — is it running? ({error})</Card>
  if (!data) return <Card className="text-stone">Loading…</Card>

  const s = data.summary
  return (
    <div className="space-y-4">
      <PageHeader title="Snapdeal — Ads" subtitle="Last 30 days of sponsored campaign performance." />
      <div className="grid grid-cols-5 gap-3">
        <Tile label="Spend ₹" value={s.spend} />
        <Tile label="Impressions" value={s.impressions} />
        <Tile label="Clicks" value={s.clicks} />
        <Tile label="Orders" value={s.orders} />
        <Tile label="Revenue ₹" value={s.revenue} />
        <Tile label="CPC ₹" value={s.cpc} />
        <Tile label="CTR %" value={s.ctr} />
        <Tile label="CVR %" value={s.cvr} />
        <Tile label="ACOS %" value={s.acos} />
        <Tile label="ROAS" value={s.roas} />
      </div>
      <Card>
        <h2 className="mb-2 text-sm font-semibold text-ink">Campaigns</h2>
        <table className="w-full text-xs">
          <thead className="text-left text-stone">
            <tr><th className="pb-1 pr-3">Campaign</th><th className="pb-1 pr-3">Spend</th><th className="pb-1 pr-3">Impr.</th><th className="pb-1 pr-3">Clicks</th><th className="pb-1 pr-3">Orders</th><th className="pb-1 pr-3">Revenue</th><th className="pb-1 pr-3">CPC</th><th className="pb-1 pr-3">ACOS</th><th className="pb-1">ROAS</th></tr>
          </thead>
          <tbody>
            {data.campaigns.map((c, i) => (
              <tr key={i} className="border-t border-sand">
                <td className="py-1.5 pr-3 font-medium text-ink">{c.campaign}</td>
                <td className="py-1.5 pr-3">₹{c.spend}</td>
                <td className="py-1.5 pr-3">{c.impressions}</td>
                <td className="py-1.5 pr-3">{c.clicks}</td>
                <td className="py-1.5 pr-3">{c.orders}</td>
                <td className="py-1.5 pr-3">₹{c.revenue}</td>
                <td className="py-1.5 pr-3">₹{c.cpc}</td>
                <td className="py-1.5 pr-3">{c.acos}%</td>
                <td className="py-1.5">{c.roas}</td>
              </tr>
            ))}
            {data.campaigns.length === 0 && <tr><td className="py-2 text-sm text-stone" colSpan={9}>No campaigns read yet.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
