import { useState, useEffect } from 'react'
import Card, { PageHeader } from '../../components/Card.js'
import axios from 'axios'

type Product = {
  asin?: string
  sku: string
  name: string
  price?: number
  cogs?: number | null
  category?: string
  fulfilment?: string
  fee_per_unit?: number | null
  is_hero?: number
}

export default function ProductsCOGSPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [editingSKU, setEditingSKU] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<{ cogs?: number; fee_per_unit?: number }>({})

  useEffect(() => {
    fetchTreyfahProducts()
  }, [])

  const fetchTreyfahProducts = async () => {
    try {
      setLoading(true)
      const res = await axios.get('/v1/products')
      setProducts(res.data.products || [])
    } catch (err) {
      console.error('Error fetching Treyfa products:', err)
      setProducts([])
    } finally {
      setLoading(false)
    }
  }

  const calculateCOGS = (product: Product) => product.cogs || 0
  const calculateFees = (product: Product) => product.fee_per_unit || 0
  const calculateProfit = (product: Product) => (product.price || 0) - calculateCOGS(product) - calculateFees(product)
  const calculateMargin = (product: Product) => {
    const profit = calculateProfit(product)
    const price = product.price || 0
    return price > 0 ? ((profit / price) * 100).toFixed(1) : 'N/A'
  }

  const startEdit = (sku: string, cogs?: number, fees?: number) => {
    setEditingSKU(sku)
    setEditValues({ cogs, fee_per_unit: fees })
  }

  const saveEdit = (sku: string) => {
    setProducts(products.map(p =>
      p.sku === sku ? { ...p, cogs: editValues.cogs, fee_per_unit: editValues.fee_per_unit } : p
    ))
    setEditingSKU(null)
    setEditValues({})
  }

  const EditableCell = ({ sku, type, value }: { sku: string; type: 'cogs' | 'fees'; value?: number }) => {
    const isEditing = editingSKU === sku
    const key = type === 'cogs' ? 'cogs' : 'fee_per_unit'
    const displayValue = isEditing ? editValues[key] : value

    if (isEditing) {
      return (
        <input
          type="number"
          value={displayValue || ''}
          onChange={(e) => setEditValues({ ...editValues, [key]: parseFloat(e.target.value) || 0 })}
          className="w-20 px-2 py-1 border border-clay rounded text-ink"
          placeholder="0"
        />
      )
    }

    return (
      <span
        onClick={() => startEdit(sku, products.find(p => p.sku === sku)?.cogs ?? 0, products.find(p => p.sku === sku)?.fee_per_unit ?? 0)}
        className="cursor-pointer hover:bg-yellow-100 px-2 py-1 rounded transition-colors"
        title="Click to edit"
      >
        {displayValue ? `₹${displayValue}` : 'Click to add'}
      </span>
    )
  }

  if (loading) return <Card className="text-stone">Loading Treyfa products...</Card>
  if (products.length === 0) {
    return (
      <Card className="text-center py-8">
        <p className="text-stone mb-2">No products found</p>
        <p className="text-xs text-stone">Sync your Amazon inventory</p>
      </Card>
    )
  }

  const totalRevenue = products.reduce((sum, p) => sum + (p.price || 0), 0)
  const totalCOGS = products.reduce((sum, p) => sum + (p.cogs || 0), 0)
  const totalFees = products.reduce((sum, p) => sum + (p.fee_per_unit || 0), 0)
  const totalProfit = totalRevenue - totalCOGS - totalFees
  const overallMargin = totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : '0.0'

  return (
    <div className="space-y-5">
      <PageHeader title="Amazon — Treyfa Products & COGS" subtitle="Real inventory with COGS tracking" />

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-3">
        <Card className="bg-clay text-white">
          <div className="text-xs opacity-80">Total Revenue</div>
          <div className="mt-2 text-2xl font-bold">₹{totalRevenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
          <div className="text-xs mt-1 opacity-70">{products.length} products</div>
        </Card>
        <Card className="bg-cream">
          <div className="text-xs text-stone">Total COGS</div>
          <div className="mt-2 text-2xl font-bold text-ink">₹{totalCOGS.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
          <div className="text-xs mt-1 text-stone/60">With fees</div>
        </Card>
        <Card className="bg-sand">
          <div className="text-xs text-ink">Total Profit</div>
          <div className="mt-2 text-2xl font-bold text-ink">₹{totalProfit.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
          <div className="text-xs mt-1 text-stone/60">Revenue minus costs</div>
        </Card>
        <Card className="bg-cream">
          <div className="text-xs text-stone">Overall Margin</div>
          <div className="mt-2 text-2xl font-bold text-ink">{overallMargin}%</div>
          <div className="text-xs mt-1 text-stone/60">Profit/Revenue</div>
        </Card>
      </div>

      {/* Products Table */}
      <Card>
        <h2 className="text-sm font-semibold text-ink mb-4">📦 Treyfa Inventory</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b-2 border-clay bg-cream">
                <th className="text-left py-2 px-3 text-stone">SKU</th>
                <th className="text-left py-2 px-3 text-stone">Product Name</th>
                <th className="text-left py-2 px-3 text-stone">Category</th>
                <th className="text-right py-2 px-3 text-stone">Price</th>
                <th className="text-right py-2 px-3 text-stone">COGS</th>
                <th className="text-right py-2 px-3 text-stone">Fees</th>
                <th className="text-right py-2 px-3 text-stone">Profit</th>
                <th className="text-right py-2 px-3 text-stone">Margin %</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product, idx) => (
                <tr key={idx} className={`border-b border-sand ${editingSKU === product.sku ? 'bg-yellow-50' : 'hover:bg-cream'}`}>
                  <td className="py-2 px-3 text-ink font-medium">{product.sku}</td>
                  <td className="py-2 px-3 text-ink">{product.name}</td>
                  <td className="py-2 px-3 text-stone capitalize">{product.category || '-'}</td>
                  <td className="text-right py-2 px-3 text-stone">₹{(product.price || 0).toLocaleString()}</td>
                  <td className="text-right py-2 px-3 text-stone">
                    <EditableCell sku={product.sku} type="cogs" value={product.cogs ?? undefined} />
                  </td>
                  <td className="text-right py-2 px-3 text-stone">
                    <EditableCell sku={product.sku} type="fees" value={product.fee_per_unit ?? undefined} />
                  </td>
                  <td className={`text-right py-2 px-3 font-bold ${calculateProfit(product) > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    ₹{calculateProfit(product).toFixed(0)}
                  </td>
                  <td className={`text-right py-2 px-3 font-bold ${parseFloat(calculateMargin(product)) > 20 ? 'text-green-600' : 'text-amber-600'}`}>
                    {calculateMargin(product)}%
                  </td>
                  {editingSKU === product.sku && (
                    <td className="py-2 px-3">
                      <button
                        onClick={() => saveEdit(product.sku)}
                        className="bg-green-600 text-white text-xs px-2 py-1 rounded hover:bg-green-700"
                      >
                        ✓ Save
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Add COGS Info */}
      <Card className="bg-cream border-l-4 border-clay">
        <h3 className="font-semibold text-ink text-sm mb-2">💡 COGS Status</h3>
        <p className="text-xs text-stone">
          {products.filter(p => p.cogs).length} of {products.length} products have COGS set.
          {products.filter(p => !p.cogs).length > 0 && (
            <span className="block mt-1 text-amber-600">
              ⚠️ {products.filter(p => !p.cogs).length} products need COGS data. Add COGS to get profit calculations.
            </span>
          )}
        </p>
      </Card>
    </div>
  )
}
