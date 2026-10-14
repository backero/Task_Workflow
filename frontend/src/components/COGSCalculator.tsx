import { useState } from 'react'
import Card from './Card.js'

type COGSData = {
  productCost: number
  procurementCost: number
  packagingCost: number
  fulfillmentCost: number
  shippingCost: number
  platformFees: number
  returnsLoss: number
}

export default function COGSCalculator({ revenue = 0 }: { revenue?: number }) {
  const [cogs, setCogs] = useState<COGSData>({
    productCost: 0,
    procurementCost: 0,
    packagingCost: 0,
    fulfillmentCost: 0,
    shippingCost: 0,
    platformFees: 0,
    returnsLoss: 0,
  })

  const handleChange = (key: keyof COGSData, value: number) => {
    setCogs(prev => ({ ...prev, [key]: value }))
  }

  const totalCOGS = Object.values(cogs).reduce((sum, val) => sum + val, 0)
  const profit = revenue - totalCOGS
  const marginPct = revenue > 0 ? ((profit / revenue) * 100).toFixed(2) : '0.00'

  const items = [
    { key: 'productCost', label: 'Product Cost', icon: '📦' },
    { key: 'procurementCost', label: 'Procurement & Sourcing', icon: '🚚' },
    { key: 'packagingCost', label: 'Packaging & Materials', icon: '📬' },
    { key: 'fulfillmentCost', label: 'Fulfillment & Handling', icon: '⚙️' },
    { key: 'shippingCost', label: 'Shipping & Delivery', icon: '🚁' },
    { key: 'platformFees', label: 'Platform Fees & Commission', icon: '💳' },
    { key: 'returnsLoss', label: 'Returns & Damage Loss', icon: '↩️' },
  ] as const

  return (
    <div className="space-y-4">
      <Card className="bg-cream border-l-4 border-clay">
        <h2 className="text-sm font-semibold text-ink mb-4">💰 COGS Breakdown Calculator</h2>

        <div className="space-y-3">
          {items.map(({ key, label, icon }) => (
            <div key={key} className="flex items-center gap-3 pb-2 border-b border-sand">
              <span className="text-lg w-6">{icon}</span>
              <div className="flex-1">
                <label className="text-xs text-stone font-medium">{label}</label>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-stone">₹</span>
                <input
                  type="number"
                  value={cogs[key] || ''}
                  onChange={(e) => handleChange(key, parseFloat(e.target.value) || 0)}
                  className="w-24 px-2 py-1 text-sm border border-sand rounded bg-white text-ink"
                  placeholder="0"
                />
              </div>
            </div>
          ))}
        </div>

        {/* Summary Section */}
        <div className="mt-4 pt-4 border-t-2 border-clay space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm font-semibold text-ink">Total COGS:</span>
            <span className="text-xl font-bold text-clay">₹{totalCOGS.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
          </div>

          {revenue > 0 && (
            <>
              <div className="flex justify-between items-center">
                <span className="text-sm font-semibold text-ink">Revenue:</span>
                <span className="text-lg font-bold text-ink">₹{revenue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
              </div>

              <div className="flex justify-between items-center bg-green-50 p-2 rounded">
                <span className="text-sm font-semibold text-green-700">Profit:</span>
                <span className={`text-lg font-bold ${profit > 0 ? 'text-green-600' : 'text-red-600'}`}>
                  ₹{profit.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-sm font-semibold text-ink">Margin %:</span>
                <span className={`text-lg font-bold ${parseFloat(marginPct) > 20 ? 'text-green-600' : 'text-amber-600'}`}>
                  {marginPct}%
                </span>
              </div>
            </>
          )}
        </div>
      </Card>
    </div>
  )
}
