import { useState, useEffect, useCallback } from 'react'
import api from '../api/axios'
import Layout from '../components/Layout'
import ImportModal from '../components/ImportModal'
import { useAuth } from '../context/AuthContext'
import { useSocket } from '../context/SocketContext'

/* ─── helpers ────────────────────────────────────────────────────────────────── */

const fmt = (n) => Number(n || 0).toLocaleString('en-IN')
const fmtCurrency = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/* ─── ProductModal ───────────────────────────────────────────────────────────── */

const EMPTY_PRODUCT = {
  name: '', sku: '', category: '', department: '',
  quantity: 0, unitPrice: 0, minStockThreshold: 0,
  supplier: '', description: '',
}

const ProductModal = ({ mode, initial, categories, onClose, onSave }) => {
  const [form, setForm]   = useState(initial || EMPTY_PRODUCT)
  const [busy, setBusy]   = useState(false)
  const [err, setErr]     = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault(); setErr('')
    setBusy(true)
    try {
      const payload = { ...form }
      if (!payload.category)   delete payload.category
      if (!payload.department) delete payload.department
      if (!payload.supplier)   delete payload.supplier
      if (!payload.description) delete payload.description
      await onSave(payload)
      onClose()
    } catch (ex) { setErr(ex.response?.data?.message || 'Something went wrong') }
    finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg my-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">{mode === 'add' ? 'Add Product' : 'Edit Product'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-600 block mb-1">Product Name *</label>
              <input className="input-field text-sm py-2.5" placeholder="e.g. A4 Paper Ream" value={form.name} onChange={e => set('name', e.target.value)} required />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">SKU *</label>
              <input className="input-field text-sm py-2.5 uppercase" placeholder="e.g. PAPER-A4-500" value={form.sku} onChange={e => set('sku', e.target.value.toUpperCase())} required />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Category</label>
              <input className="input-field text-sm py-2.5" list="cat-list" placeholder="e.g. Stationery" value={form.category} onChange={e => set('category', e.target.value)} />
              <datalist id="cat-list">{categories.map(c => <option key={c} value={c} />)}</datalist>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">
                {mode === 'add' ? 'Initial Quantity *' : 'Quantity (use Stock In/Out to change)'}
              </label>
              <input
                type="number" min="0"
                className={`input-field text-sm py-2.5 ${mode === 'edit' ? 'bg-gray-50 text-gray-400' : ''}`}
                value={form.quantity}
                onChange={e => set('quantity', e.target.value)}
                readOnly={mode === 'edit'}
                required={mode === 'add'}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Unit Price (₹)</label>
              <input type="number" min="0" step="0.01" className="input-field text-sm py-2.5" placeholder="0.00" value={form.unitPrice} onChange={e => set('unitPrice', e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Low Stock Threshold</label>
              <input type="number" min="0" className="input-field text-sm py-2.5" placeholder="0" value={form.minStockThreshold} onChange={e => set('minStockThreshold', e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Department</label>
              <input className="input-field text-sm py-2.5" placeholder="e.g. Operations" value={form.department} onChange={e => set('department', e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Supplier</label>
              <input className="input-field text-sm py-2.5" placeholder="Supplier name" value={form.supplier} onChange={e => set('supplier', e.target.value)} />
            </div>
          </div>
          {err && <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{err}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
            <button type="submit" disabled={busy} className="flex-1 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors">
              {busy ? 'Saving…' : (mode === 'add' ? 'Add Product' : 'Save Changes')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ─── StockModal ─────────────────────────────────────────────────────────────── */

const StockModal = ({ type, product, onClose, onSave }) => {
  const [qty, setQty]   = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr]   = useState('')
  const isOut = type === 'OUT'

  const handleSubmit = async (e) => {
    e.preventDefault(); setErr('')
    if (!qty || Number(qty) < 1) { setErr('Enter a valid quantity (min 1)'); return }
    if (isOut && Number(qty) > product.quantity) {
      setErr(`Cannot remove more than available stock (${product.quantity})`)
      return
    }
    setBusy(true)
    try { await onSave(Number(qty), note); onClose() }
    catch (ex) { setErr(ex.response?.data?.message || 'Failed') }
    finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            {isOut ? '📤 Stock Out' : '📥 Stock In'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="bg-gray-50 rounded-xl p-3 text-sm">
            <p className="font-medium text-gray-800">{product.name}</p>
            <p className="text-gray-400 text-xs mt-0.5">SKU: {product.sku} · Current stock: <span className="font-semibold text-gray-700">{product.quantity}</span></p>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Quantity *</label>
            <input
              type="number" min="1" max={isOut ? product.quantity : undefined}
              className="input-field text-sm py-2.5"
              placeholder={`Units to ${isOut ? 'remove' : 'add'}`}
              value={qty}
              onChange={e => setQty(e.target.value)}
              autoFocus required
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Note</label>
            <input className="input-field text-sm py-2.5" placeholder={isOut ? 'e.g. Issued to Design dept' : 'e.g. Received from supplier'} value={note} onChange={e => setNote(e.target.value)} />
          </div>
          {err && <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{err}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            <button
              type="submit" disabled={busy}
              className={`flex-1 py-2.5 rounded-xl text-white text-sm font-medium disabled:opacity-50 transition-colors ${isOut ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'}`}
            >
              {busy ? '…' : (isOut ? 'Remove Stock' : 'Add Stock')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ─── MovementsModal ─────────────────────────────────────────────────────────── */

const MovementsModal = ({ product, movements, onClose }) => {
  const TYPE_STYLE = {
    IN:         'bg-green-100 text-green-700',
    OUT:        'bg-red-100 text-red-600',
    ADJUSTMENT: 'bg-amber-100 text-amber-700',
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Stock History</h2>
            <p className="text-xs text-gray-400 mt-0.5">{product.name} · {product.sku}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>
        <div className="overflow-y-auto max-h-96">
          {movements.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-10">No movements recorded yet</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {movements.map(m => (
                <div key={m._id} className="flex items-center gap-3 px-6 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${TYPE_STYLE[m.type]}`}>
                    {m.type === 'IN' ? '+' : m.type === 'OUT' ? '-' : '~'}{m.quantity}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700">
                      {m.quantityBefore} → <span className="font-semibold">{m.quantityAfter}</span>
                    </p>
                    {m.note && <p className="text-xs text-gray-400 truncate">{m.note}</p>}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs text-gray-500">{m.performedBy?.name || m.performedBy?.phone || '—'}</p>
                    <p className="text-xs text-gray-400">
                      {new Date(m.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="px-6 py-3 border-t border-gray-50">
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700">Close</button>
        </div>
      </div>
    </div>
  )
}

/* ─── Inventory Page ─────────────────────────────────────────────────────────── */

export default function Inventory() {
  const { user } = useAuth()
  const { socket } = useSocket() || {}

  const canWrite  = ['MANAGER', 'HR', 'ADMIN', 'ORG_ADMIN'].includes(user?.role)
  const canDelete = ['ADMIN', 'ORG_ADMIN'].includes(user?.role)

  const [products, setProducts]     = useState([])
  const [stats, setStats]           = useState(null)
  const [categories, setCategories] = useState([])
  const [total, setTotal]           = useState(0)
  const [pages, setPages]           = useState(1)
  const [page, setPage]             = useState(1)
  const [loading, setLoading]       = useState(true)

  const [search,      setSearch]      = useState('')
  const [catFilter,   setCatFilter]   = useState('')
  const [lowStockOnly, setLowOnly]    = useState(false)

  const [modal, setModal]           = useState(null)
  const [showImport, setShowImport] = useState(false)
  // modal: null | { type: 'add'|'edit'|'stock_in'|'stock_out'|'history', product? }
  const [actionBusy, setActionBusy] = useState(null)

  const fetchProducts = useCallback(async (pg = page) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: pg, limit: 20 })
      if (search)      params.set('search',   search)
      if (catFilter)   params.set('category', catFilter)
      if (lowStockOnly) params.set('lowStock', 'true')
      const res = await api.get(`/inventory?${params}`)
      const d = res.data.data
      setProducts(d.products)
      setTotal(d.total)
      setPages(d.pages)
    } catch {} finally { setLoading(false) }
  }, [page, search, catFilter, lowStockOnly])

  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get('/inventory/stats')
      setStats(res.data.data)
    } catch {}
  }, [])

  const fetchCategories = useCallback(async () => {
    try {
      const res = await api.get('/inventory/categories')
      setCategories(res.data.data.categories || [])
    } catch {}
  }, [])

  useEffect(() => { fetchProducts(page) }, [page])
  useEffect(() => { setPage(1); fetchProducts(1) }, [search, catFilter, lowStockOnly])
  useEffect(() => { fetchStats(); fetchCategories() }, [])

  // Real-time
  useEffect(() => {
    if (!socket) return
    const refresh = () => { fetchProducts(page); fetchStats(); fetchCategories() }
    const events = ['inventory:product_created', 'inventory:product_updated', 'inventory:product_deleted', 'inventory:stock_changed']
    events.forEach(e => socket.on(e, refresh))
    return () => events.forEach(e => socket.off(e, refresh))
  }, [socket, fetchProducts, fetchStats, fetchCategories, page])

  const handleSaveProduct = async (payload) => {
    if (modal.type === 'add') {
      await api.post('/inventory', payload)
    } else {
      await api.patch(`/inventory/${modal.product._id}`, payload)
    }
    fetchStats(); fetchCategories()
  }

  const handleStockIn = async (qty, note) => {
    await api.post(`/inventory/${modal.product._id}/stock-in`, { quantity: qty, note })
  }

  const handleStockOut = async (qty, note) => {
    await api.post(`/inventory/${modal.product._id}/stock-out`, { quantity: qty, note })
  }

  const handleDelete = async (product) => {
    if (!window.confirm(`Delete "${product.name}"? This cannot be undone.`)) return
    setActionBusy(product._id)
    try { await api.delete(`/inventory/${product._id}`); fetchStats(); fetchCategories() }
    catch (err) { alert(err.response?.data?.message || 'Failed to delete') }
    finally { setActionBusy(null) }
  }

  const [historyData, setHistoryData] = useState([])
  const openHistory = async (product) => {
    try {
      const res = await api.get(`/inventory/${product._id}`)
      setHistoryData(res.data.data.movements || [])
      setModal({ type: 'history', product })
    } catch {}
  }

  const lowStockItems = stats?.lowStockItems || []

  return (
    <Layout>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inventory</h1>
          <p className="text-sm text-gray-400 mt-0.5">{total} products · {stats?.lowStockCount || 0} low stock</p>
        </div>
        {canWrite && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowImport(true)}
              className="border border-gray-200 text-gray-600 px-3 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
              Import
            </button>
            <button
              onClick={() => setModal({ type: 'add' })}
              className="bg-brand-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-brand-700 transition-colors flex items-center gap-2"
            >
              <span className="text-lg leading-none">+</span> Add Product
            </button>
          </div>
        )}
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Products', value: fmt(stats?.totalProducts), icon: '📦', color: 'bg-brand-50 text-brand-600 border-brand-100' },
          { label: 'Total Stock',    value: fmt(stats?.totalStock),    icon: '📊', color: 'bg-blue-50 text-blue-600 border-blue-100' },
          { label: 'Total Value',    value: fmtCurrency(stats?.totalValue), icon: '💰', color: 'bg-green-50 text-green-600 border-green-100' },
          { label: 'Low Stock',      value: fmt(stats?.lowStockCount), icon: '⚠️', color: 'bg-red-50 text-red-600 border-red-100' },
        ].map(c => (
          <div key={c.label} className={`bg-white rounded-2xl border ${c.color.split(' ')[2]} shadow-sm p-4 flex items-center gap-3`}>
            <div className={`${c.color.split(' ').slice(0, 2).join(' ')} w-11 h-11 rounded-xl flex items-center justify-center text-lg flex-shrink-0`}>{c.icon}</div>
            <div>
              <p className="text-xs text-gray-400 uppercase font-semibold tracking-wide">{c.label}</p>
              <p className={`text-xl font-bold mt-0.5 ${c.color.split(' ')[1]}`}>{c.value ?? '—'}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Low-stock alerts */}
      {lowStockItems.length > 0 && (
        <div className="bg-red-50 border border-red-100 rounded-2xl p-4 mb-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-red-500 text-lg">⚠️</span>
            <h3 className="font-semibold text-red-700 text-sm">Low Stock Alerts ({lowStockItems.length})</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {lowStockItems.map(item => (
              <div key={item._id} className="bg-white rounded-xl border border-red-100 px-3 py-2 flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{item.name}</p>
                  <p className="text-xs text-gray-400">{item.sku}</p>
                </div>
                <div className="text-right flex-shrink-0 ml-2">
                  <p className="text-sm font-bold text-red-600">{item.quantity}</p>
                  <p className="text-xs text-gray-400">/ {item.minStockThreshold} min</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input
            className="input-field text-sm py-2.5"
            placeholder="Search name, SKU, supplier…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select
            className="input-field text-sm py-2.5"
            value={catFilter}
            onChange={e => setCatFilter(e.target.value)}
          >
            <option value="">All Categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <label className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50 transition-colors">
            <input
              type="checkbox"
              checked={lowStockOnly}
              onChange={e => setLowOnly(e.target.checked)}
              className="w-4 h-4 accent-red-500"
            />
            <span className="text-sm text-gray-600">Low stock only</span>
          </label>
        </div>
      </div>

      {/* Product table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="hidden md:grid grid-cols-[2.5fr_1fr_1fr_1fr_1fr_1fr_auto] gap-3 px-6 py-3 border-b border-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-400">
          <span>Product</span>
          <span>SKU</span>
          <span>Category</span>
          <span className="text-right">Stock</span>
          <span className="text-right">Unit Price</span>
          <span className="text-right">Value</span>
          <span>Actions</span>
        </div>

        {loading ? (
          <div className="divide-y divide-gray-50">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="px-6 py-4 animate-pulse flex gap-4 items-center">
                <div className="w-8 h-8 bg-gray-100 rounded-lg flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-gray-100 rounded w-36" />
                  <div className="h-2.5 bg-gray-100 rounded w-20" />
                </div>
              </div>
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-3">📦</div>
            <p className="text-gray-500 font-medium">No products found</p>
            <p className="text-sm text-gray-400 mt-1">
              {canWrite ? 'Click "Add Product" to get started' : 'No inventory items in your organisation yet'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {products.map(p => {
              const isLow = p.quantity <= p.minStockThreshold
              return (
                <div
                  key={p._id}
                  className={`grid grid-cols-1 md:grid-cols-[2.5fr_1fr_1fr_1fr_1fr_1fr_auto] gap-2 md:gap-3 px-4 md:px-6 py-4 hover:bg-gray-50/50 transition-colors items-center ${isLow ? 'bg-red-50/30' : ''}`}
                >
                  {/* Product info */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0 ${isLow ? 'bg-red-100 text-red-600' : 'bg-brand-50 text-brand-600'}`}>
                      {p.name[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{p.name}</p>
                      {p.supplier && <p className="text-xs text-gray-400 truncate">{p.supplier}</p>}
                    </div>
                    {isLow && <span className="flex-shrink-0 text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-medium">⚠ Low</span>}
                  </div>

                  <div><span className="text-xs font-mono bg-gray-100 px-2 py-1 rounded text-gray-600">{p.sku}</span></div>
                  <div><span className="text-sm text-gray-500">{p.category || <span className="text-gray-300">—</span>}</span></div>
                  <div className="text-right">
                    <p className={`text-sm font-semibold ${isLow ? 'text-red-600' : 'text-gray-800'}`}>{fmt(p.quantity)}</p>
                    {p.minStockThreshold > 0 && <p className="text-xs text-gray-400">min {fmt(p.minStockThreshold)}</p>}
                  </div>
                  <div className="text-right"><span className="text-sm text-gray-600">{fmtCurrency(p.unitPrice)}</span></div>
                  <div className="text-right"><span className="text-sm font-medium text-gray-700">{fmtCurrency(p.quantity * p.unitPrice)}</span></div>

                  {/* Actions */}
                  <div className="flex flex-wrap gap-1.5">
                    {canWrite && (
                      <>
                        <button
                          onClick={() => setModal({ type: 'stock_in', product: p })}
                          className="text-xs text-green-600 hover:text-green-700 px-2 py-1 rounded-lg hover:bg-green-50 transition-colors font-medium"
                          title="Stock In"
                        >
                          +IN
                        </button>
                        <button
                          onClick={() => setModal({ type: 'stock_out', product: p })}
                          disabled={p.quantity === 0}
                          className="text-xs text-red-500 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors font-medium disabled:opacity-30"
                          title="Stock Out"
                        >
                          -OUT
                        </button>
                        <button
                          onClick={() => setModal({
                            type: 'edit',
                            product: p,
                            initial: { name: p.name, sku: p.sku, category: p.category || '', department: p.department || '', quantity: p.quantity, unitPrice: p.unitPrice, minStockThreshold: p.minStockThreshold, supplier: p.supplier || '', description: p.description || '' },
                          })}
                          className="text-xs text-gray-400 hover:text-amber-600 px-2 py-1 rounded-lg hover:bg-amber-50 transition-colors"
                        >
                          Edit
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => openHistory(p)}
                      className="text-xs text-gray-400 hover:text-brand-600 px-2 py-1 rounded-lg hover:bg-brand-50 transition-colors"
                    >
                      History
                    </button>
                    {canDelete && (
                      <button
                        onClick={() => handleDelete(p)}
                        disabled={actionBusy === p._id}
                        className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-40"
                      >
                        Del
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between mt-5">
          <p className="text-sm text-gray-400">Showing {((page - 1) * 20) + 1}–{Math.min(page * 20, total)} of {total}</p>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors">← Prev</button>
            {[...Array(Math.min(pages, 7))].map((_, i) => (
              <button key={i} onClick={() => setPage(i + 1)} className={`w-8 h-8 text-sm rounded-lg transition-colors ${i + 1 === page ? 'bg-brand-600 text-white' : 'hover:bg-gray-100 text-gray-600'}`}>{i + 1}</button>
            ))}
            <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages} className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors">Next →</button>
          </div>
        </div>
      )}

      {/* Modals */}
      {(modal?.type === 'add' || modal?.type === 'edit') && (
        <ProductModal
          mode={modal.type === 'add' ? 'add' : 'edit'}
          initial={modal.initial}
          categories={categories}
          onClose={() => setModal(null)}
          onSave={handleSaveProduct}
        />
      )}
      {modal?.type === 'stock_in' && (
        <StockModal type="IN" product={modal.product} onClose={() => setModal(null)} onSave={handleStockIn} />
      )}
      {modal?.type === 'stock_out' && (
        <StockModal type="OUT" product={modal.product} onClose={() => setModal(null)} onSave={handleStockOut} />
      )}
      {modal?.type === 'history' && (
        <MovementsModal product={modal.product} movements={historyData} onClose={() => setModal(null)} />
      )}
      {showImport && (
        <ImportModal
          type="inventory"
          onClose={() => setShowImport(false)}
          onDone={() => { setShowImport(false); fetchProducts() }}
        />
      )}
    </Layout>
  )
}
