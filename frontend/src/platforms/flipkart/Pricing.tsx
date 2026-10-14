import { useState } from 'react'
import Card, { PageHeader } from '../../components/Card.js'
import { useAutoRefresh } from '../../hooks/useAutoRefresh.js'
import { getFlipkartPricing, type FlipkartPricing } from './api.js'

export default function FlipkartPricingPage() {
  const [data, setData] = useState<FlipkartPricing | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [price, setPrice] = useState(999)
  useAutoRefresh(() => { getFlipkartPricing().then(setData).catch((e) => setError(String(e))) }, [], 60_000)

  if (error) return <Card className="text-brick">Could not reach FK-Pulse's API on port 8600 — is it running? ({error})</Card>
  if (!data) return <Card className="text-stone">Loading…</Card>

  const { cliff_price, commission_below, commission_above } = data.cliff
  const rate = price > cliff_price ? commission_above : commission_below
  const netPayout = price * (1 - rate)

  return (
    <div className="space-y-4">
      <PageHeader title="Flipkart — Pricing & Fees" subtitle={`Flags listings priced more than ${data.threshold_pct.toFixed(0)}% above the SERP median.`} />
      <Card>
        <h2 className="mb-2 text-sm font-semibold text-ink">Price vs SERP median</h2>
        <table className="w-full text-xs">
          <thead className="text-left text-stone"><tr><th className="pb-1 pr-3">FSN</th><th className="pb-1 pr-3">Title</th><th className="pb-1 pr-3">Price</th><th className="pb-1 pr-3">SERP median</th><th className="pb-1 pr-3">vs median %</th><th className="pb-1">Flag</th></tr></thead>
          <tbody>
            {data.price_vs_median.map((r) => (
              <tr key={r.fsn} className="border-t border-sand">
                <td className="py-1.5 pr-3 text-stone">{r.fsn}</td>
                <td className="py-1.5 pr-3 font-medium text-ink">{r.title}</td>
                <td className="py-1.5 pr-3">₹{r.price}</td>
                <td className="py-1.5 pr-3">₹{r.serp_median_price}</td>
                <td className="py-1.5 pr-3">{r.vs_median_pct.toFixed(1)}%</td>
                <td className={`py-1.5 ${r.flag === 'ABOVE LIMIT' ? 'font-semibold text-brick' : ''}`}>{r.flag}</td>
              </tr>
            ))}
            {data.price_vs_median.length === 0 && <tr><td className="py-2 text-sm text-stone" colSpan={6}>No listings with SERP median data yet.</td></tr>}
          </tbody>
        </table>
      </Card>
      <Card>
        <h2 className="mb-1 text-sm font-semibold text-ink">Commission-cliff advisor</h2>
        <p className="mb-3 text-xs text-stone">
          Assumptions: commission {(commission_below * 100).toFixed(0)}% at or below ₹{cliff_price.toLocaleString('en-IN')}, {(commission_above * 100).toFixed(0)}% above it —
          excludes fixed/collection/shipping fees and GST. Estimate only, verify current rate card in Seller Hub.
        </p>
        <div className="flex items-center gap-3">
          <label className="text-sm text-stone">Price ₹</label>
          <input
            type="number" value={price} onChange={(e) => setPrice(Number(e.target.value))}
            className="w-28 rounded-lg border border-sand px-2 py-1 text-sm"
          />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
          <div><span className="text-stone">Commission rate:</span> <span className="font-semibold text-ink">{(rate * 100).toFixed(0)}%</span></div>
          <div><span className="text-stone">Est. net payout:</span> <span className="font-semibold text-ink">₹{netPayout.toFixed(2)}</span></div>
          <div><span className="text-stone">vs ₹{data.cliff.reposition_target}:</span> <span className="font-semibold text-ink">{price > cliff_price ? 'above cliff' : 'below cliff'}</span></div>
        </div>
      </Card>
    </div>
  )
}
