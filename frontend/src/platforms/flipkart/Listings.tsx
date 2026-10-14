import { useState } from 'react'
import Card, { PageHeader } from '../../components/Card.js'
import { useAutoRefresh } from '../../hooks/useAutoRefresh.js'
import { getFlipkartListings, type FlipkartListing } from './api.js'

export default function FlipkartListingsPage() {
  const [listings, setListings] = useState<FlipkartListing[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useAutoRefresh(() => { getFlipkartListings().then(setListings).catch((e) => setError(String(e))) }, [], 60_000)

  if (error) return <Card className="text-brick">Could not reach FK-Pulse's API on port 8600 — is it running? ({error})</Card>
  if (!listings) return <Card className="text-stone">Loading…</Card>

  if (listings.length === 0) {
    return (
      <Card className="text-center py-8">
        <p className="text-stone mb-2">No listings found</p>
        <p className="text-xs text-stone">FK-Pulse hasn't read any listings yet</p>
      </Card>
    )
  }

  const activeCount = listings.filter((l) => l.status === 'ACTIVE').length
  const totalStockValue = listings.reduce((sum, l) => sum + (l.price || 0) * (l.stock || 0), 0)
  const ratedListings = listings.filter((l) => l.rating_avg != null)
  const avgRating = ratedListings.length > 0 ? ratedListings.reduce((s, l) => s + (l.rating_avg || 0), 0) / ratedListings.length : null

  return (
    <div className="space-y-5">
      <PageHeader title="Flipkart — Listings" subtitle={`${listings.length} products from FK-Pulse, ${activeCount} active`} />

      <div className="grid grid-cols-4 gap-3">
        <Card className="bg-clay text-white">
          <div className="text-xs opacity-80">Total Listings</div>
          <div className="mt-2 text-2xl font-bold">{listings.length}</div>
          <div className="text-xs mt-1 opacity-70">From fk_pulse.db</div>
        </Card>
        <Card className="bg-cream">
          <div className="text-xs text-stone">Active</div>
          <div className="mt-2 text-2xl font-bold text-ink">{activeCount}</div>
          <div className="text-xs mt-1 text-stone/60">Status = ACTIVE</div>
        </Card>
        <Card className="bg-sand">
          <div className="text-xs text-ink">Total Stock Value</div>
          <div className="mt-2 text-2xl font-bold text-ink">₹{totalStockValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
          <div className="text-xs mt-1 text-stone/60">Price × stock</div>
        </Card>
        <Card className="bg-cream">
          <div className="text-xs text-stone">Avg Rating</div>
          <div className="mt-2 text-2xl font-bold text-ink">{avgRating != null ? `${avgRating.toFixed(1)} ⭐` : '—'}</div>
          <div className="text-xs mt-1 text-stone/60">{ratedListings.length} rated</div>
        </Card>
      </div>

      <Card>
        <h2 className="mb-2 text-sm font-semibold text-ink">Listings (real, from FK-Pulse)</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-left text-stone border-b-2 border-clay bg-cream">
              <tr>
                <th className="py-2 pr-3">SKU</th>
                <th className="py-2 pr-3">Title</th>
                <th className="py-2 pr-3 text-right">Price</th>
                <th className="py-2 pr-3 text-right">Stock</th>
                <th className="py-2 pr-3 text-center">Rating</th>
                <th className="py-2 pr-3 text-right">Return %</th>
                <th className="py-2 text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {listings.map((l) => (
                <tr key={l.fsn} className="border-t border-sand hover:bg-cream/50">
                  <td className="py-1.5 pr-3 font-medium text-ink">{l.sku}</td>
                  <td className="py-1.5 pr-3 text-ink">{l.title}</td>
                  <td className="py-1.5 pr-3 text-right text-stone">₹{l.price}</td>
                  <td className="py-1.5 pr-3 text-right font-bold">{l.stock}</td>
                  <td className="py-1.5 pr-3 text-center">{l.rating_avg != null ? `${l.rating_avg} ⭐` : '—'}</td>
                  <td className="py-1.5 pr-3 text-right text-stone">{l.hub?.return_rate_pct != null ? `${l.hub.return_rate_pct}%` : '—'}</td>
                  <td className="py-1.5 text-center">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${l.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {l.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
