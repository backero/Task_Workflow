import { useState } from 'react'
import { PageHeader } from '../../components/Card.tsx'
import { useAutoRefresh } from '../../hooks/useAutoRefresh.ts'
import { getSnapdealListings, type SnapdealListing } from './api.ts'

export default function SnapdealListingsPage() {
  const [rows, setRows] = useState<SnapdealListing[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useAutoRefresh(() => { getSnapdealListings().then(setRows).catch((e) => setError(String(e))) }, [], 60_000)

  if (error) return <div className="text-brick">Could not reach Snapdeal's app on port 8300 — is it running? ({error})</div>
  if (!rows) return <div className="text-stone">Loading…</div>

  return (
    <div>
      <PageHeader title="Snapdeal — Listings" subtitle={`${rows.length} products, from real Seller Panel reads.`} />
      <div className="overflow-x-auto rounded-xl border border-sand bg-white">
        <table className="w-full text-sm">
          <thead className="bg-sand/50 text-left text-xs uppercase text-stone">
            <tr>
              <th className="px-3 py-2">SKU</th><th className="px-3 py-2">Title</th><th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Price / MRP</th><th className="px-3 py-2">Discount%</th><th className="px-3 py-2">Stock</th>
              <th className="px-3 py-2">Product rating%</th><th className="px-3 py-2">MSP</th><th className="px-3 py-2">Audit</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.sku} className="border-t border-sand">
                <td className="px-3 py-2 text-stone">{r.sku}</td>
                <td className="px-3 py-2 font-medium text-ink">{r.title}</td>
                <td className="px-3 py-2">{r.status}</td>
                <td className="px-3 py-2">₹{r.price} / ₹{r.mrp}</td>
                <td className="px-3 py-2">{r.discount_pct}%</td>
                <td className="px-3 py-2">{r.stock === 0 ? <b className="text-brick">OOS</b> : r.stock}</td>
                <td className="px-3 py-2">{r.panel?.product_rating_pct ?? '—'}</td>
                <td className="px-3 py-2">{r.panel?.msp ?? '—'}</td>
                <td className="px-3 py-2">{r.audit_score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
