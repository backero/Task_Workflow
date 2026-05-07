import { useState, useEffect, useCallback } from 'react'
import api from '../api/axios'
import Layout from '../components/Layout'
import { useAuth } from '../context/AuthContext'
import { useSocket } from '../context/SocketContext'

const STATUS_STYLE = {
  draft:       { badge: 'bg-gray-100 text-gray-600',    label: 'Draft' },
  in_progress: { badge: 'bg-amber-100 text-amber-700',  label: 'In Progress' },
  completed:   { badge: 'bg-green-100 text-green-700',  label: 'Completed' },
  cancelled:   { badge: 'bg-red-100 text-red-500',      label: 'Cancelled' },
}

/* ─── OrderModal ────────────────────────────────────────────────────────────── */

const EMPTY_MAT = { product: '', quantityRequired: 1, unit: 'pcs' }

const OrderModal = ({ onClose, onSave, products }) => {
  const [form, setForm] = useState({
    name: '', outputProduct: '', outputQuantity: 1, outputUnit: 'pcs',
    materials: [], notes: '',
  })
  const [busy, setBusy] = useState(false)
  const [err,  setErr]  = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const setMat = (i, k, v) => setForm(f => {
    const mats = [...f.materials]; mats[i] = { ...mats[i], [k]: v }; return { ...f, materials: mats }
  })
  const addMat    = () => setForm(f => ({ ...f, materials: [...f.materials, { ...EMPTY_MAT }] }))
  const removeMat = (i) => setForm(f => ({ ...f, materials: f.materials.filter((_, idx) => idx !== i) }))

  const handleSubmit = async (e) => {
    e.preventDefault(); setErr('')
    if (!form.name.trim()) { setErr('Order name is required'); return }
    if (form.materials.length === 0) { setErr('Add at least one raw material'); return }
    const invalidMat = form.materials.find(m => !m.product || Number(m.quantityRequired) <= 0)
    if (invalidMat) { setErr('All materials must have a product and valid quantity'); return }
    setBusy(true)
    try {
      const payload = {
        name: form.name,
        outputProduct:  form.outputProduct  || undefined,
        outputQuantity: Number(form.outputQuantity),
        outputUnit:     form.outputUnit,
        notes:          form.notes || undefined,
        materials: form.materials.map(m => ({
          product: m.product, quantityRequired: Number(m.quantityRequired), unit: m.unit,
        })),
      }
      await onSave(payload); onClose()
    } catch (ex) { setErr(ex.response?.data?.message || 'Something went wrong') }
    finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg my-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl z-10">
          <h2 className="text-lg font-semibold text-gray-900">New Production Order</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Basic info */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Order Name *</label>
            <input className="input-field text-sm py-2.5" placeholder="e.g. Batch A — Widget Assembly" value={form.name}
              onChange={e => set('name', e.target.value)} required autoFocus />
          </div>

          {/* Output product */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Finished Output</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="text-xs font-medium text-gray-600 block mb-1">Output Product (from inventory)</label>
                <select className="input-field text-sm py-2.5" value={form.outputProduct} onChange={e => set('outputProduct', e.target.value)}>
                  <option value="">— Not linked to inventory —</option>
                  {products.map(p => <option key={p._id} value={p._id}>{p.name} (Stock: {p.quantity})</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Qty to Produce *</label>
                <input type="number" min="0.01" step="any" className="input-field text-sm py-2.5" value={form.outputQuantity}
                  onChange={e => set('outputQuantity', e.target.value)} required />
              </div>
            </div>
          </div>

          {/* Raw materials */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Raw Materials *</p>
              <button type="button" onClick={addMat}
                className="text-xs text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1">
                <span className="text-base leading-none">+</span> Add Material
              </button>
            </div>
            {form.materials.length === 0 && (
              <div className="border border-dashed border-gray-200 rounded-xl py-6 text-center text-sm text-gray-400">
                No materials yet — click "+ Add Material"
              </div>
            )}
            <div className="space-y-2">
              {form.materials.map((mat, i) => (
                <div key={i} className="grid grid-cols-[2fr_1fr_0.8fr_auto] gap-2 items-center">
                  <select className="input-field text-sm py-2" value={mat.product} onChange={e => setMat(i,'product',e.target.value)} required>
                    <option value="">Select product</option>
                    {products.map(p => <option key={p._id} value={p._id}>{p.name} (Avail: {p.quantity})</option>)}
                  </select>
                  <input type="number" min="0.01" step="any" className="input-field text-sm py-2" placeholder="Qty" value={mat.quantityRequired}
                    onChange={e => setMat(i,'quantityRequired',e.target.value)} required />
                  <input className="input-field text-sm py-2" placeholder="unit" value={mat.unit}
                    onChange={e => setMat(i,'unit',e.target.value)} />
                  <button type="button" onClick={() => removeMat(i)}
                    className="w-7 h-7 flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg">×</button>
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Notes</label>
            <textarea className="input-field text-sm py-2 h-16 resize-none" placeholder="Production notes…" value={form.notes}
              onChange={e => set('notes', e.target.value)} />
          </div>

          {err && <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{err}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={busy} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
              {busy ? 'Creating…' : 'Create Order'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ─── CompleteModal ─────────────────────────────────────────────────────────── */

const CompleteModal = ({ order, onClose, onConfirm }) => {
  const [qty,  setQty]  = useState(order.outputQuantity)
  const [busy, setBusy] = useState(false)

  const confirm = async () => {
    setBusy(true)
    await onConfirm(Number(qty))
    setBusy(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Complete Production</h2>
        <p className="text-sm text-gray-400 mb-5">{order.name}</p>

        <div className="mb-5">
          <label className="text-sm font-medium text-gray-700 block mb-1.5">Actual Quantity Produced</label>
          <input type="number" min="0.01" step="any" className="input-field text-sm py-2.5 w-full" value={qty}
            onChange={e => setQty(e.target.value)} autoFocus />
          {order.outputProduct && (
            <p className="text-xs text-gray-400 mt-1.5">
              Will add {qty} {order.outputUnit} of <span className="font-medium">{order.outputProduct.name}</span> to inventory.
            </p>
          )}
        </div>

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={confirm} disabled={busy || !qty || Number(qty) <= 0}
            className="flex-1 py-2.5 rounded-xl bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50">
            {busy ? 'Completing…' : 'Mark Complete'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─── QualityTestModal ──────────────────────────────────────────────────────── */

const QualityTestModal = ({ products, onClose, onDone }) => {
  const [form, setForm] = useState({ productId: '', quantity: 1, notes: '' })
  const [busy, setBusy] = useState(false)
  const [err,  setErr]  = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault(); setErr('')
    if (!form.productId) { setErr('Select a product'); return }
    if (Number(form.quantity) <= 0) { setErr('Enter a valid quantity'); return }
    setBusy(true)
    try {
      await api.post('/production/quality-test', { ...form, quantity: Number(form.quantity) })
      onDone()
      onClose()
    } catch (ex) { setErr(ex.response?.data?.message || 'Failed') }
    finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-900">Record Quality Test</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Product *</label>
            <select className="input-field text-sm py-2.5" value={form.productId}
              onChange={e => setForm(f => ({ ...f, productId: e.target.value }))} required>
              <option value="">Select product</option>
              {products.map(p => <option key={p._id} value={p._id}>{p.name} — Stock: {p.quantity}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Quantity to Take *</label>
            <input type="number" min="0.01" step="any" className="input-field text-sm py-2.5" value={form.quantity}
              onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} required autoFocus />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Notes</label>
            <input className="input-field text-sm py-2.5" placeholder="Test batch #, reason…" value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
          {err && <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{err}</p>}
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={busy}
              className="flex-1 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 disabled:opacity-50">
              {busy ? 'Recording…' : 'Record Test'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ─── Production Page ───────────────────────────────────────────────────────── */

export default function Production() {
  const { user } = useAuth()
  const { socket } = useSocket() || {}

  const canWrite = ['MANAGER', 'ADMIN', 'ORG_ADMIN'].includes(user?.role)

  const [orders, setOrders]       = useState([])
  const [stats, setStats]         = useState(null)
  const [products, setProducts]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [statusFilter, setFilter] = useState('')
  const [modal, setModal]         = useState(null)
  const [expanded, setExpanded]   = useState(null)
  const [actionBusy, setActionBusy] = useState(null)

  const fetchOrders = useCallback(async () => {
    try {
      const params = statusFilter ? `?status=${statusFilter}` : ''
      const res = await api.get(`/production${params}`)
      setOrders(res.data.data.orders || [])
    } catch {}
  }, [statusFilter])

  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get('/production/stats')
      setStats(res.data.data)
    } catch {}
  }, [])

  const fetchProducts = useCallback(async () => {
    try {
      const res = await api.get('/inventory?limit=200')
      setProducts(res.data.data?.products || [])
    } catch {}
  }, [])

  useEffect(() => {
    Promise.all([fetchOrders(), fetchStats(), fetchProducts()]).finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchOrders() }, [statusFilter])

  useEffect(() => {
    if (!socket) return
    const refresh = () => { fetchOrders(); fetchStats() }
    const events = ['production:order_created', 'production:order_updated', 'inventory:stock_updated']
    events.forEach(e => socket.on(e, refresh))
    return () => events.forEach(e => socket.off(e, refresh))
  }, [socket, fetchOrders, fetchStats])

  const handleStart = async (order) => {
    if (!window.confirm(`Start production for "${order.name}"? This will deduct raw materials from inventory.`)) return
    setActionBusy(order._id)
    try {
      await api.patch(`/production/${order._id}/start`)
      fetchOrders(); fetchStats()
    } catch (err) { alert(err.response?.data?.message || 'Failed to start') }
    finally { setActionBusy(null) }
  }

  const handleComplete = async (order, actualQty) => {
    setActionBusy(order._id)
    try {
      await api.patch(`/production/${order._id}/complete`, { actualQuantity: actualQty })
      setModal(null); fetchOrders(); fetchStats()
    } catch (err) { alert(err.response?.data?.message || 'Failed to complete'); throw err }
    finally { setActionBusy(null) }
  }

  const handleCancel = async (order) => {
    if (!window.confirm(`Cancel order "${order.name}"?`)) return
    setActionBusy(order._id)
    try {
      await api.patch(`/production/${order._id}/cancel`)
      fetchOrders(); fetchStats()
    } catch (err) { alert(err.response?.data?.message || 'Failed') }
    finally { setActionBusy(null) }
  }

  const STAT_CARDS = [
    { label: 'Total Orders', value: stats?.total   ?? '—', color: 'bg-indigo-50 text-indigo-600' },
    { label: 'Draft',        value: stats?.draft    ?? '—', color: 'bg-gray-100 text-gray-600' },
    { label: 'In Progress',  value: stats?.in_progress ?? '—', color: 'bg-amber-50 text-amber-600' },
    { label: 'Completed',    value: stats?.completed ?? '—', color: 'bg-green-50 text-green-600' },
  ]

  return (
    <Layout>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Production</h1>
          <p className="text-sm text-gray-400 mt-0.5">Manage production orders, materials, and quality tests</p>
        </div>
        {canWrite && (
          <div className="flex gap-2">
            <button onClick={() => setModal('qualityTest')}
              className="border border-amber-200 text-amber-700 bg-amber-50 px-3 py-2.5 rounded-xl text-sm font-medium hover:bg-amber-100 transition-colors">
              Quality Test
            </button>
            <button onClick={() => setModal('create')}
              className="bg-indigo-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors">
              + New Order
            </button>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {STAT_CARDS.map(c => (
          <div key={c.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
            <div className={`${c.color} w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold flex-shrink-0`}>
              {c.value}
            </div>
            <p className="text-xs text-gray-400 uppercase font-semibold tracking-wide">{c.label}</p>
          </div>
        ))}
      </div>

      {/* Status filter */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {[['', 'All'], ['draft', 'Draft'], ['in_progress', 'In Progress'], ['completed', 'Completed'], ['cancelled', 'Cancelled']].map(([v, l]) => (
          <button key={v} onClick={() => setFilter(v)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${statusFilter === v ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
            {l}
          </button>
        ))}
      </div>

      {/* Orders list */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-sm text-gray-400">Loading…</div>
        ) : orders.length === 0 ? (
          <div className="py-16 text-center">
            <div className="text-5xl mb-3">🏭</div>
            <p className="text-gray-500 font-medium">No production orders</p>
            {canWrite && <p className="text-sm text-gray-400 mt-1">Click "+ New Order" to create one</p>}
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {orders.map(order => {
              const s = STATUS_STYLE[order.status] || STATUS_STYLE.draft
              const isExpanded = expanded === order._id
              return (
                <div key={order._id}>
                  {/* Row */}
                  <div className="flex items-center gap-3 px-5 py-4 hover:bg-gray-50/50 cursor-pointer"
                    onClick={() => setExpanded(isExpanded ? null : order._id)}>
                    {/* Status dot */}
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      order.status === 'in_progress' ? 'bg-amber-400 animate-pulse' :
                      order.status === 'completed'   ? 'bg-green-400' :
                      order.status === 'cancelled'   ? 'bg-red-400' : 'bg-gray-300'
                    }`} />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-mono text-gray-400">{order.orderNumber}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.badge}`}>{s.label}</span>
                      </div>
                      <p className="text-sm font-medium text-gray-800 truncate">{order.name}</p>
                      <p className="text-xs text-gray-400">
                        Output: <span className="font-medium">{order.outputQuantity} {order.outputUnit}</span>
                        {order.outputProduct && <span> of {order.outputProduct.name}</span>}
                        {' · '}{order.materials?.length || 0} material{order.materials?.length !== 1 ? 's' : ''}
                      </p>
                    </div>

                    <div className="text-right flex-shrink-0">
                      {order.startedAt && <p className="text-xs text-gray-400">Started {new Date(order.startedAt).toLocaleDateString('en-IN')}</p>}
                      {order.completedAt && <p className="text-xs text-green-600">Done {new Date(order.completedAt).toLocaleDateString('en-IN')}</p>}
                    </div>

                    {/* Actions */}
                    {canWrite && (
                      <div className="flex gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                        {order.status === 'draft' && (
                          <button onClick={() => handleStart(order)} disabled={actionBusy === order._id}
                            className="text-xs px-2.5 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 font-medium disabled:opacity-40">
                            Start
                          </button>
                        )}
                        {order.status === 'in_progress' && (
                          <button onClick={() => setModal({ type: 'complete', order })} disabled={actionBusy === order._id}
                            className="text-xs px-2.5 py-1.5 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 font-medium disabled:opacity-40">
                            Complete
                          </button>
                        )}
                        {['draft', 'in_progress'].includes(order.status) && (
                          <button onClick={() => handleCancel(order)} disabled={actionBusy === order._id}
                            className="text-xs px-2 py-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-40">
                            Cancel
                          </button>
                        )}
                      </div>
                    )}

                    <svg className={`w-4 h-4 text-gray-300 flex-shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
                  </div>

                  {/* Expanded materials */}
                  {isExpanded && (
                    <div className="bg-gray-50 px-5 py-4 border-t border-gray-100">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Raw Materials</p>
                      {(order.materials || []).length === 0 ? (
                        <p className="text-xs text-gray-400">No materials listed</p>
                      ) : (
                        <div className="space-y-1.5">
                          {order.materials.map((mat, i) => (
                            <div key={i} className="flex items-center gap-2 text-sm">
                              <span className="font-medium text-gray-700">{mat.product?.name || 'Unknown'}</span>
                              <span className="text-gray-400">·</span>
                              <span className="text-gray-600">Need {mat.quantityRequired} {mat.unit}</span>
                              {mat.quantityUsed > 0 && <span className="text-indigo-500 text-xs">(used: {mat.quantityUsed})</span>}
                              {mat.product && (
                                <span className={`text-xs ml-auto ${mat.product.quantity < mat.quantityRequired ? 'text-red-500 font-medium' : 'text-green-600'}`}>
                                  Stock: {mat.product.quantity}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {order.notes && (
                        <p className="text-xs text-gray-400 mt-3 border-t border-gray-200 pt-2">Notes: {order.notes}</p>
                      )}
                      <p className="text-xs text-gray-400 mt-2">Created by {order.createdBy?.name || '—'}</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modals */}
      {modal === 'create' && (
        <OrderModal
          products={products}
          onClose={() => setModal(null)}
          onSave={async (payload) => {
            await api.post('/production', payload)
            fetchOrders(); fetchStats()
          }}
        />
      )}

      {modal?.type === 'complete' && (
        <CompleteModal
          order={modal.order}
          onClose={() => setModal(null)}
          onConfirm={(qty) => handleComplete(modal.order, qty)}
        />
      )}

      {modal === 'qualityTest' && (
        <QualityTestModal
          products={products}
          onClose={() => setModal(null)}
          onDone={() => { fetchProducts() }}
        />
      )}
    </Layout>
  )
}
