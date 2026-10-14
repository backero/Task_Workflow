import { useState } from 'react'
import Card, { PageHeader } from '../../components/Card.js'
import { useAutoRefresh } from '../../hooks/useAutoRefresh.js'
import { getFlipkartSellerHub, type FlipkartSellerHub } from './api.js'

export default function FlipkartSellerHubPage() {
  const [data, setData] = useState<FlipkartSellerHub | null>(null)
  const [error, setError] = useState<string | null>(null)
  useAutoRefresh(() => { getFlipkartSellerHub().then(setData).catch((e) => setError(String(e))) }, [], 60_000)

  if (error) return <Card className="text-brick">Could not reach FK-Pulse's API on port 8600 — is it running? ({error})</Card>
  if (!data) return <Card className="text-stone">Loading…</Card>

  return (
    <div className="space-y-4">
      <PageHeader title="Flipkart — Seller Hub" subtitle="Flipkart's own figures — Business Health, traffic, ads, orders and listing quality." />

      <Card>
        <h2 className="mb-2 text-sm font-semibold text-ink">Listings losing the most impressions</h2>
        <table className="w-full text-xs">
          <thead className="text-left text-stone"><tr><th className="pb-1 pr-3">SKU</th><th className="pb-1 pr-3">Impressions lost</th><th className="pb-1">Units lost</th></tr></thead>
          <tbody>
            {data.traffic_drops.map((d, i) => (
              <tr key={i} className="border-t border-sand">
                <td className="py-1.5 pr-3 font-medium text-ink">{d.sku}</td>
                <td className="py-1.5 pr-3">{d.impressions_drop}</td>
                <td className="py-1.5">{d.units_lost}</td>
              </tr>
            ))}
            {data.traffic_drops.length === 0 && <tr><td className="py-2 text-sm text-stone" colSpan={3}>No traffic-drop data read yet.</td></tr>}
          </tbody>
        </table>
      </Card>

      <Card>
        <h2 className="mb-2 text-sm font-semibold text-ink">Ad campaigns</h2>
        <table className="w-full text-xs">
          <thead className="text-left text-stone"><tr><th className="pb-1 pr-3">Campaign</th><th className="pb-1 pr-3">Status</th><th className="pb-1 pr-3">Type</th><th className="pb-1 pr-3">Spend</th><th className="pb-1 pr-3">Views</th><th className="pb-1 pr-3">Clicks</th><th className="pb-1 pr-3">Units</th><th className="pb-1 pr-3">Revenue</th><th className="pb-1">ROI</th></tr></thead>
          <tbody>
            {data.ads_campaigns.map((c, i) => (
              <tr key={i} className="border-t border-sand">
                <td className="py-1.5 pr-3 font-medium text-ink">{c.name}</td>
                <td className="py-1.5 pr-3">{c.status}</td>
                <td className="py-1.5 pr-3">{c.kind}</td>
                <td className="py-1.5 pr-3">₹{c.spend}</td>
                <td className="py-1.5 pr-3">{c.views}</td>
                <td className="py-1.5 pr-3">{c.clicks}</td>
                <td className="py-1.5 pr-3">{c.units}</td>
                <td className="py-1.5 pr-3">₹{c.revenue}</td>
                <td className="py-1.5">{c.roi}</td>
              </tr>
            ))}
            {data.ads_campaigns.length === 0 && <tr><td className="py-2 text-sm text-stone" colSpan={9}>No campaigns read yet.</td></tr>}
          </tbody>
        </table>
      </Card>

      <Card>
        <h2 className="mb-1 text-sm font-semibold text-ink">Orders waiting to be packed ("To Accept" queue, by SKU)</h2>
        <p className="mb-2 text-xs text-stone">No order ID, buyer or date here — just what needs packing right now.</p>
        <table className="w-full text-xs">
          <thead className="text-left text-stone"><tr><th className="pb-1 pr-3">SKU</th><th className="pb-1 pr-3">Title</th><th className="pb-1 pr-3">Qty</th><th className="pb-1 pr-3">Orders in group</th><th className="pb-1">Price</th></tr></thead>
          <tbody>
            {data.pending_order_groups.map((p, i) => (
              <tr key={i} className="border-t border-sand">
                <td className="py-1.5 pr-3 font-medium text-ink">{p.sku}</td>
                <td className="py-1.5 pr-3">{p.title}</td>
                <td className="py-1.5 pr-3">{p.qty}</td>
                <td className="py-1.5 pr-3">{p.orders}</td>
                <td className="py-1.5">{p.price_low === p.price_high ? `₹${p.price_low}` : `₹${p.price_low} – ₹${p.price_high}`}</td>
              </tr>
            ))}
            {data.pending_order_groups.length === 0 && <tr><td className="py-2 text-sm text-stone" colSpan={5}>Nothing pending right now.</td></tr>}
          </tbody>
        </table>
      </Card>

      <Card>
        <h2 className="mb-2 text-sm font-semibold text-ink">Listing quality (Flipkart's own label)</h2>
        <table className="w-full text-xs">
          <thead className="text-left text-stone"><tr><th className="pb-1 pr-3">SKU</th><th className="pb-1 pr-3">Category</th><th className="pb-1 pr-3">Quality</th><th className="pb-1 pr-3">Rating</th><th className="pb-1 pr-3">Price</th><th className="pb-1 pr-3">Customer pays</th><th className="pb-1 pr-3">Stock</th><th className="pb-1">Return %</th></tr></thead>
          <tbody>
            {data.listing_rows.map((r, i) => (
              <tr key={i} className="border-t border-sand">
                <td className="py-1.5 pr-3 font-medium text-ink">{r.sku}</td>
                <td className="py-1.5 pr-3">{r.category}</td>
                <td className="py-1.5 pr-3">{r.quality}</td>
                <td className="py-1.5 pr-3">{r.rating ?? '—'}</td>
                <td className="py-1.5 pr-3">₹{r.price}</td>
                <td className="py-1.5 pr-3">₹{r.final_price}</td>
                <td className="py-1.5 pr-3">{r.stock}</td>
                <td className="py-1.5">{r.return_rate_pct ?? '—'}</td>
              </tr>
            ))}
            {data.listing_rows.length === 0 && <tr><td className="py-2 text-sm text-stone" colSpan={8}>No listing rows read yet.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
