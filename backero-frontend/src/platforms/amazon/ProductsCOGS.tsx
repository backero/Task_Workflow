import { useState, useEffect } from 'react'
import Card, { PageHeader } from '../../components/Card.tsx'
import api from '../../api/axios.js'
import { saveCogs } from '../../api.ts'
import { Package, Check, Lightbulb, TriangleAlert } from 'lucide-react'

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
      const res = await api.get('/marketflow/v1/products')
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

  const saveEdit = async (sku: string) => {
    // Only `cogs` actually persists server-side — the backend's bulk-save endpoint's
    // schema only accepts {asin, cogs}, so fee_per_unit stays a client-only/cosmetic
    // edit (lost on refresh) until the backend grows a field for it.
    const product = products.find(p => p.sku === sku)
    if (product?.asin && editValues.cogs != null) {
      await saveCogs([{ asin: product.asin, cogs: editValues.cogs }])
    }
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
          className="w-20 px-2 py-1 border border-orange-500 rounded text-gray-900"
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

  if (loading) return <Card className="text-gray-400">Loading Treyfa products...</Card>
  if (products.length === 0) {
    return (
      <Card className="text-center py-8">
        <p className="text-gray-400 mb-2">No products found</p>
        <p className="text-xs text-gray-400">Sync your Amazon inventory</p>
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
        <Card className="bg-orange-500 text-white">
          <div className="text-xs opacity-80">Total Revenue</div>
          <div className="mt-2 text-2xl font-bold">₹{totalRevenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
          <div className="text-xs mt-1 opacity-70">{products.length} products</div>
        </Card>
        <Card className="bg-orange-50">
          <div className="text-xs text-gray-400">Total COGS</div>
          <div className="mt-2 text-2xl font-bold text-gray-900">₹{totalCOGS.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
          <div className="text-xs mt-1 text-gray-400">With fees</div>
        </Card>
        <Card className="bg-gray-50">
          <div className="text-xs text-gray-900">Total Profit</div>
          <div className="mt-2 text-2xl font-bold text-gray-900">₹{totalProfit.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
          <div className="text-xs mt-1 text-gray-400">Revenue minus costs</div>
        </Card>
        <Card className="bg-orange-50">
          <div className="text-xs text-gray-400">Overall Margin</div>
          <div className="mt-2 text-2xl font-bold text-gray-900">{overallMargin}%</div>
          <div className="text-xs mt-1 text-gray-400">Profit/Revenue</div>
        </Card>
      </div>

      {/* Products Table */}
      <Card>
        <h2 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-1.5"><Package className="w-4 h-4 text-orange-500" />Treyfa Inventory</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b-2 border-orange-500 bg-orange-50">
                <th className="text-left py-2 px-3 text-gray-400">SKU</th>
                <th className="text-left py-2 px-3 text-gray-400">Product Name</th>
                <th className="text-left py-2 px-3 text-gray-400">Category</th>
                <th className="text-right py-2 px-3 text-gray-400">Price</th>
                <th className="text-right py-2 px-3 text-gray-400">COGS</th>
                <th className="text-right py-2 px-3 text-gray-400">Fees</th>
                <th className="text-right py-2 px-3 text-gray-400">Profit</th>
                <th className="text-right py-2 px-3 text-gray-400">Margin %</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product, idx) => (
                <tr key={idx} className={`border-b border-gray-200 ${editingSKU === product.sku ? 'bg-yellow-50' : 'hover:bg-orange-50'}`}>
                  <td className="py-2 px-3 text-gray-900 font-medium">{product.sku}</td>
                  <td className="py-2 px-3 text-gray-900">{product.name}</td>
                  <td className="py-2 px-3 text-gray-400 capitalize">{product.category || '-'}</td>
                  <td className="text-right py-2 px-3 text-gray-400">₹{(product.price || 0).toLocaleString()}</td>
                  <td className="text-right py-2 px-3 text-gray-400">
                    <EditableCell sku={product.sku} type="cogs" value={product.cogs ?? undefined} />
                  </td>
                  <td className="text-right py-2 px-3 text-gray-400">
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
                        className="bg-green-600 text-white text-xs px-2 py-1 rounded hover:bg-green-700 inline-flex items-center gap-1"
                      >
                        <Check className="w-3 h-3" />Save
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
      <Card className="bg-orange-50 border-l-4 border-orange-500">
        <h3 className="font-semibold text-gray-900 text-sm mb-2 flex items-center gap-1.5"><Lightbulb className="w-4 h-4 text-orange-500" />COGS Status</h3>
        <p className="text-xs text-gray-400">
          {products.filter(p => p.cogs).length} of {products.length} products have COGS set.
          {products.filter(p => !p.cogs).length > 0 && (
            <span className="flex items-center gap-1 mt-1 text-amber-600">
              <TriangleAlert className="w-3.5 h-3.5" />{products.filter(p => !p.cogs).length} products need COGS data. Add COGS to get profit calculations.
            </span>
          )}
        </p>
      </Card>
    </div>
  )
}
