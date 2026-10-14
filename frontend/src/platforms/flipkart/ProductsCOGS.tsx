import { useState } from 'react'
import Card, { PageHeader } from '../../components/Card.js'
import { useAutoRefresh } from '../../hooks/useAutoRefresh.js'
import { getFlipkartListings, type FlipkartListing } from './api.js'

export default function FlipkartProductsCOGSPage() {
  const [listings, setListings] = useState<FlipkartListing[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editingSKU, setEditingSKU] = useState<string | null>(null)
  const [cogsMap, setCogsMap] = useState<Record<string, number>>({})
  const [editValue, setEditValue] = useState<number | ''>('')

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

  const commissionRate = 0.18 // Flipkart's typical category commission — COGS itself isn't tracked by FK-Pulse, entered manually here
  const calcFee = (price: number) => price * commissionRate
  const calcProfit = (price: number, cogs: number) => price - cogs - calcFee(price)
  const calcMargin = (price: number, cogs: number) => (price > 0 ? (calcProfit(price, cogs) / price) * 100 : 0)

  const startEdit = (sku: string) => { setEditingSKU(sku); setEditValue(cogsMap[sku] ?? '') }
  const saveEdit = (sku: string) => {
    if (editValue !== '') setCogsMap({ ...cogsMap, [sku]: Number(editValue) })
    setEditingSKU(null)
  }

  const totalRevenue = listings.reduce((s, l) => s + (l.price || 0), 0)
  const totalCogs = listings.reduce((s, l) => s + (cogsMap[l.sku] || 0), 0)
  const totalFees = listings.reduce((s, l) => s + calcFee(l.price || 0), 0)
  const totalProfit = totalRevenue - totalCogs - totalFees
  const overallMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0

  return (
    <div className="space-y-5">
      <PageHeader title="Flipkart — Products & COGS" subtitle="Real FK-Pulse listings; COGS entered manually (not tracked by Flipkart)" />

      <div className="grid grid-cols-4 gap-3">
        <Card className="bg-clay text-white">
          <div className="text-xs opacity-80">Total Revenue (price sum)</div>
          <div className="mt-2 text-2xl font-bold">₹{totalRevenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
          <div className="text-xs mt-1 opacity-70">{listings.length} listings</div>
        </Card>
        <Card className="bg-cream">
          <div className="text-xs text-stone">Total COGS entered</div>
          <div className="mt-2 text-2xl font-bold text-ink">₹{totalCogs.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
          <div className="text-xs mt-1 text-stone/60">{Object.keys(cogsMap).length} of {listings.length} set</div>
        </Card>
        <Card className="bg-sand">
          <div className="text-xs text-ink">Est. Profit (18% commission)</div>
          <div className="mt-2 text-2xl font-bold text-ink">₹{totalProfit.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
          <div className="text-xs mt-1 text-stone/60">Revenue − COGS − fees</div>
        </Card>
        <Card className="bg-cream">
          <div className="text-xs text-stone">Overall Margin</div>
          <div className="mt-2 text-2xl font-bold text-ink">{overallMargin.toFixed(1)}%</div>
          <div className="text-xs mt-1 text-stone/60">Profit / revenue</div>
        </Card>
      </div>

      <Card>
        <h2 className="mb-2 text-sm font-semibold text-ink">📦 Listings (real price/stock from FK-Pulse)</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-left text-stone border-b-2 border-clay bg-cream">
              <tr>
                <th className="py-2 pr-3">SKU</th>
                <th className="py-2 pr-3">Title</th>
                <th className="py-2 pr-3 text-right">Price</th>
                <th className="py-2 pr-3 text-right">COGS (manual)</th>
                <th className="py-2 pr-3 text-right">Commission (18%)</th>
                <th className="py-2 pr-3 text-right">Profit</th>
                <th className="py-2 text-right">Margin %</th>
              </tr>
            </thead>
            <tbody>
              {listings.map((l) => {
                const cogs = cogsMap[l.sku] || 0
                const fee = calcFee(l.price || 0)
                const profit = calcProfit(l.price || 0, cogs)
                const margin = calcMargin(l.price || 0, cogs)
                const isEditing = editingSKU === l.sku
                return (
                  <tr key={l.fsn} className={`border-t border-sand ${isEditing ? 'bg-yellow-50' : 'hover:bg-cream/50'}`}>
                    <td className="py-1.5 pr-3 font-medium text-ink">{l.sku}</td>
                    <td className="py-1.5 pr-3 text-ink">{l.title}</td>
                    <td className="py-1.5 pr-3 text-right text-stone">₹{l.price}</td>
                    <td className="py-1.5 pr-3 text-right">
                      {isEditing ? (
                        <input
                          type="number" autoFocus value={editValue}
                          onChange={(e) => setEditValue(e.target.value === '' ? '' : Number(e.target.value))}
                          onBlur={() => saveEdit(l.sku)}
                          onKeyDown={(e) => e.key === 'Enter' && saveEdit(l.sku)}
                          className="w-20 px-1 py-0.5 border border-clay rounded text-ink"
                        />
                      ) : (
                        <span onClick={() => startEdit(l.sku)} className="cursor-pointer hover:bg-yellow-100 px-2 py-1 rounded" title="Click to set COGS">
                          {cogsMap[l.sku] ? `₹${cogsMap[l.sku]}` : 'Set COGS'}
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 pr-3 text-right text-stone">₹{fee.toFixed(0)}</td>
                    <td className={`py-1.5 pr-3 text-right font-bold ${profit > 0 ? 'text-green-600' : 'text-brick'}`}>₹{profit.toFixed(0)}</td>
                    <td className={`py-1.5 text-right font-bold ${margin > 20 ? 'text-green-600' : 'text-amber-600'}`}>{margin.toFixed(1)}%</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="bg-cream border-l-4 border-clay">
        <h3 className="font-semibold text-ink text-sm mb-2">💡 Note</h3>
        <p className="text-xs text-stone">
          Price and stock are real, read by FK-Pulse from your live Seller Hub. COGS is not exposed by Flipkart's Seller Hub,
          so it must be entered manually per SKU (click a cell above) — commission is estimated at a flat 18%; verify your actual
          category rate card on Pricing &amp; Fees.
        </p>
      </Card>
    </div>
  )
}
