import { useState, useEffect, useCallback } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import api from '../api/axios'
import Layout from '../components/Layout'
import ImportModal from '../components/ImportModal'
import { useAuth } from '../context/AuthContext'
import { useSocket } from '../context/SocketContext'

/* ─── helpers ────────────────────────────────────────────────────────────────── */

const fmtCurrency = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtDate     = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const TX_CATEGORIES_INCOME  = ['Sales', 'Service', 'Consulting', 'Rent Income', 'Investment', 'Other Income']
const TX_CATEGORIES_EXPENSE = ['Salaries', 'Rent', 'Utilities', 'Supplies', 'Marketing', 'Travel', 'Equipment', 'Other Expense']
const PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER', 'UPI', 'CHEQUE', 'CARD', 'OTHER']

const STATUS_STYLE = {
  DRAFT:     'bg-gray-100 text-gray-600',
  SENT:      'bg-blue-100 text-blue-700',
  PAID:      'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-500',
}

/* ─── TransactionModal ───────────────────────────────────────────────────────── */

const EMPTY_TX = { type: 'INCOME', amount: '', description: '', category: '', date: new Date().toISOString().split('T')[0], paymentMethod: 'CASH', reference: '' }

const TransactionModal = ({ initial, categories, onClose, onSave }) => {
  const [form, setForm] = useState(initial || EMPTY_TX)
  const [busy, setBusy] = useState(false)
  const [err, setErr]   = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const suggestions = form.type === 'INCOME' ? TX_CATEGORIES_INCOME : TX_CATEGORIES_EXPENSE

  const handleSubmit = async (e) => {
    e.preventDefault(); setErr('')
    if (!form.amount || Number(form.amount) <= 0) { setErr('Enter a valid amount'); return }
    setBusy(true)
    try {
      const payload = { ...form, amount: Number(form.amount) }
      if (!payload.category)  delete payload.category
      if (!payload.reference) delete payload.reference
      await onSave(payload); onClose()
    } catch (ex) { setErr(ex.response?.data?.message || 'Something went wrong') }
    finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">{initial ? 'Edit Transaction' : 'New Transaction'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => set('type','INCOME')}
              className={`py-2.5 rounded-xl text-sm font-medium border transition-colors ${form.type==='INCOME' ? 'bg-green-500 text-white border-green-500' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              ↑ Income
            </button>
            <button type="button" onClick={() => set('type','EXPENSE')}
              className={`py-2.5 rounded-xl text-sm font-medium border transition-colors ${form.type==='EXPENSE' ? 'bg-red-500 text-white border-red-500' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              ↓ Expense
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Amount (₹) *</label>
              <input type="number" min="0.01" step="0.01" className="input-field text-sm py-2.5" placeholder="0.00" value={form.amount} onChange={e => set('amount', e.target.value)} required autoFocus />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Date *</label>
              <input type="date" className="input-field text-sm py-2.5" value={form.date} onChange={e => set('date', e.target.value)} required />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Description *</label>
            <input className="input-field text-sm py-2.5" placeholder="e.g. Software development payment" value={form.description} onChange={e => set('description', e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Category</label>
              <input className="input-field text-sm py-2.5" list="tx-cats" placeholder="Select or type" value={form.category} onChange={e => set('category', e.target.value)} />
              <datalist id="tx-cats">{suggestions.concat(categories).map(c => <option key={c} value={c} />)}</datalist>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Payment Method</label>
              <select className="input-field text-sm py-2.5" value={form.paymentMethod} onChange={e => set('paymentMethod', e.target.value)}>
                {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Reference #</label>
            <input className="input-field text-sm py-2.5" placeholder="Invoice or receipt number" value={form.reference} onChange={e => set('reference', e.target.value)} />
          </div>
          {err && <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{err}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={busy}
              className={`flex-1 py-2.5 rounded-xl text-white text-sm font-medium disabled:opacity-50 transition-colors ${form.type==='INCOME' ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600'}`}>
              {busy ? 'Saving…' : (initial ? 'Save Changes' : 'Record Transaction')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ─── InvoiceModal ───────────────────────────────────────────────────────────── */

const EMPTY_ITEM = { description: '', quantity: 1, unitPrice: 0, taxRate: 18 }
const EMPTY_INV  = {
  customer: { name: '', email: '', phone: '', address: '', gstin: '' },
  items: [{ ...EMPTY_ITEM }],
  notes: '', signature: '',
  issueDate: new Date().toISOString().split('T')[0],
  dueDate: '',
}

const InvoiceModal = ({ initial, onClose, onSave }) => {
  const [form, setForm]   = useState(initial || EMPTY_INV)
  const [busy, setBusy]   = useState(false)
  const [err, setErr]     = useState('')

  const setCustomer = (k, v) => setForm(f => ({ ...f, customer: { ...f.customer, [k]: v } }))
  const setItem     = (i, k, v) => setForm(f => { const items = [...f.items]; items[i] = { ...items[i], [k]: v }; return { ...f, items } })
  const addItem     = () => setForm(f => ({ ...f, items: [...f.items, { ...EMPTY_ITEM }] }))
  const removeItem  = (i) => setForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }))

  const calcLine    = (item) => Number(item.quantity) * Number(item.unitPrice) * (1 + Number(item.taxRate || 0) / 100)
  const subtotal    = form.items.reduce((a, it) => a + Number(it.quantity) * Number(it.unitPrice), 0)
  const tax         = form.items.reduce((a, it) => a + Number(it.quantity) * Number(it.unitPrice) * (Number(it.taxRate || 0) / 100), 0)
  const total       = subtotal + tax

  const handleSubmit = async (e) => {
    e.preventDefault(); setErr('')
    if (!form.customer.name) { setErr('Customer name is required'); return }
    if (form.items.length === 0) { setErr('Add at least one line item'); return }
    setBusy(true)
    try {
      const payload = {
        ...form,
        issueDate: form.issueDate || new Date().toISOString(),
        dueDate:   form.dueDate   || null,
        items: form.items.map(it => ({
          ...it,
          quantity:  Number(it.quantity),
          unitPrice: Number(it.unitPrice),
          taxRate:   Number(it.taxRate || 0),
        })),
      }
      if (!payload.notes)     delete payload.notes
      if (!payload.signature) delete payload.signature
      await onSave(payload); onClose()
    } catch (ex) { setErr(ex.response?.data?.message || 'Something went wrong') }
    finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl my-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl z-10">
          <h2 className="text-lg font-semibold text-gray-900">{initial ? 'Edit Invoice' : 'New Invoice'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Customer */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Customer Details</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs font-medium text-gray-600 block mb-1">Customer Name *</label>
                <input className="input-field text-sm py-2.5" placeholder="Customer or Company name" value={form.customer.name} onChange={e => setCustomer('name', e.target.value)} required />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Email</label>
                <input type="email" className="input-field text-sm py-2.5" placeholder="customer@email.com" value={form.customer.email} onChange={e => setCustomer('email', e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Phone</label>
                <input className="input-field text-sm py-2.5" placeholder="+91 98765 43210" value={form.customer.phone} onChange={e => setCustomer('phone', e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">GSTIN</label>
                <input className="input-field text-sm py-2.5 uppercase" placeholder="27XXXXX" value={form.customer.gstin} onChange={e => setCustomer('gstin', e.target.value.toUpperCase())} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Address</label>
                <input className="input-field text-sm py-2.5" placeholder="Billing address" value={form.customer.address} onChange={e => setCustomer('address', e.target.value)} />
              </div>
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Issue Date</label>
              <input type="date" className="input-field text-sm py-2.5" value={form.issueDate} onChange={e => setForm(f => ({ ...f, issueDate: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Due Date</label>
              <input type="date" className="input-field text-sm py-2.5" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} />
            </div>
          </div>

          {/* Line items */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Line Items</p>
            <div className="space-y-2">
              {/* Column headers */}
              <div className="hidden sm:grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-2 text-xs font-medium text-gray-400 px-1">
                <span>Description</span><span>Qty</span><span>Unit Price</span><span>Tax %</span><span className="w-6" />
              </div>
              {form.items.map((item, i) => (
                <div key={i} className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-2 items-center">
                  <input className="input-field text-sm py-2" placeholder="Service or product" value={item.description} onChange={e => setItem(i,'description',e.target.value)} required />
                  <input type="number" min="0.01" step="any" className="input-field text-sm py-2" placeholder="1" value={item.quantity} onChange={e => setItem(i,'quantity',e.target.value)} required />
                  <input type="number" min="0" step="0.01" className="input-field text-sm py-2" placeholder="0.00" value={item.unitPrice} onChange={e => setItem(i,'unitPrice',e.target.value)} required />
                  <input type="number" min="0" max="100" step="0.5" className="input-field text-sm py-2" placeholder="18" value={item.taxRate} onChange={e => setItem(i,'taxRate',e.target.value)} />
                  {form.items.length > 1 && (
                    <button type="button" onClick={() => removeItem(i)} className="w-7 h-7 flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">×</button>
                  )}
                </div>
              ))}
              <button type="button" onClick={addItem} className="text-sm text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1 mt-1">
                <span className="text-lg leading-none">+</span> Add Item
              </button>
            </div>

            {/* Totals preview */}
            <div className="mt-3 bg-gray-50 rounded-xl p-3 text-sm space-y-1">
              <div className="flex justify-between text-gray-500"><span>Subtotal</span><span>{fmtCurrency(subtotal)}</span></div>
              <div className="flex justify-between text-gray-500"><span>Tax</span><span>{fmtCurrency(tax)}</span></div>
              <div className="flex justify-between font-bold text-gray-900 pt-1 border-t border-gray-200"><span>Total</span><span className="text-brand-600">{fmtCurrency(total)}</span></div>
            </div>
          </div>

          {/* Notes & signature */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Notes</label>
              <textarea className="input-field text-sm py-2 h-20 resize-none" placeholder="Payment terms, thank you note…" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Authorised Signature (name)</label>
              <input className="input-field text-sm py-2.5" placeholder="Signatory name" value={form.signature} onChange={e => setForm(f => ({ ...f, signature: e.target.value }))} />
            </div>
          </div>

          {err && <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{err}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={busy} className="flex-1 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50">
              {busy ? 'Saving…' : (initial ? 'Save Invoice' : 'Create Invoice')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ─── Finance Page ───────────────────────────────────────────────────────────── */

export default function Finance() {
  const { user } = useAuth()
  const { socket } = useSocket() || {}

  const canWrite  = ['MANAGER', 'HR', 'ADMIN', 'ORG_ADMIN'].includes(user?.role)
  const canDelete = ['ADMIN', 'ORG_ADMIN'].includes(user?.role)

  const [tab, setTab]           = useState('overview')
  const [summary, setSummary]   = useState(null)
  const [monthly, setMonthly]   = useState([])
  const [transactions, setTxs]  = useState([])
  const [txTotal, setTxTotal]   = useState(0)
  const [txPages, setTxPages]   = useState(1)
  const [txPage, setTxPage]     = useState(1)
  const [invoices, setInvoices] = useState([])
  const [invTotal, setInvTotal] = useState(0)
  const [categories, setCats]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [modal, setModal]       = useState(null) // null | { type, data? }
  const [showImport, setShowImport] = useState(false)
  const [actionBusy, setActionBusy] = useState(null)

  // Filters
  const [txType,  setTxType]  = useState('')
  const [txFrom,  setTxFrom]  = useState('')
  const [txTo,    setTxTo]    = useState('')
  const [invStatus, setInvStatus] = useState('')

  const fetchSummary = useCallback(async () => {
    try {
      const [sRes, mRes] = await Promise.all([
        api.get('/finance/summary'),
        api.get('/finance/monthly?months=6'),
      ])
      setSummary(sRes.data.data)
      setMonthly(mRes.data.data.data || [])
    } catch {}
  }, [])

  const fetchTransactions = useCallback(async (pg = txPage) => {
    try {
      const params = new URLSearchParams({ page: pg, limit: 20 })
      if (txType) params.set('type', txType)
      if (txFrom) params.set('from', txFrom)
      if (txTo)   params.set('to',   txTo)
      const res = await api.get(`/finance/transactions?${params}`)
      const d = res.data.data
      setTxs(d.transactions); setTxTotal(d.total); setTxPages(d.pages)
    } catch {}
  }, [txPage, txType, txFrom, txTo])

  const fetchInvoices = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: 20 })
      if (invStatus) params.set('status', invStatus)
      const res = await api.get(`/finance/invoices?${params}`)
      const d = res.data.data
      setInvoices(d.invoices); setInvTotal(d.total)
    } catch {}
  }, [invStatus])

  const fetchCategories = useCallback(async () => {
    try { const res = await api.get('/finance/categories'); setCats(res.data.data.categories || []) } catch {}
  }, [])

  useEffect(() => {
    Promise.all([fetchSummary(), fetchTransactions(1), fetchInvoices(), fetchCategories()])
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { setTxPage(1); fetchTransactions(1) }, [txType, txFrom, txTo])
  useEffect(() => { fetchTransactions(txPage) }, [txPage])
  useEffect(() => { fetchInvoices() }, [invStatus])

  // Real-time
  useEffect(() => {
    if (!socket) return
    const refresh = () => { fetchSummary(); fetchTransactions(txPage); fetchInvoices(); fetchCategories() }
    const events = ['finance:transaction_created','finance:transaction_updated','finance:transaction_deleted','finance:invoice_created','finance:invoice_updated','finance:invoice_deleted']
    events.forEach(e => socket.on(e, refresh))
    return () => events.forEach(e => socket.off(e, refresh))
  }, [socket, fetchSummary, fetchTransactions, fetchInvoices, fetchCategories, txPage])

  const handleDeleteTx = async (id) => {
    if (!window.confirm('Delete this transaction?')) return
    setActionBusy(id)
    try { await api.delete(`/finance/transactions/${id}`); fetchSummary(); fetchTransactions(txPage) }
    catch (err) { alert(err.response?.data?.message || 'Failed') }
    finally { setActionBusy(null) }
  }

  const handleInvoiceStatus = async (inv, status) => {
    try { await api.patch(`/finance/invoices/${inv._id}/status`, { status }); fetchInvoices(); fetchSummary() }
    catch (err) { alert(err.response?.data?.message || 'Failed') }
  }

  const handleDeleteInvoice = async (id) => {
    if (!window.confirm('Delete this invoice?')) return
    setActionBusy(id)
    try { await api.delete(`/finance/invoices/${id}`); fetchInvoices(); fetchSummary() }
    catch (err) { alert(err.response?.data?.message || 'Failed') }
    finally { setActionBusy(null) }
  }

  const downloadPDF = async (invoiceId, invoiceNumber) => {
    try {
      const res = await api.get(`/finance/invoices/${invoiceId}/pdf`, { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
      const a   = document.createElement('a')
      a.href     = url
      a.download = `${invoiceNumber}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch { alert('Failed to download PDF') }
  }

  const profit = (summary?.profit || 0)

  return (
    <Layout>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Finance</h1>
          <p className="text-sm text-gray-400 mt-0.5">Revenue, expenses, invoices and transactions</p>
        </div>
        {canWrite && (
          <div className="flex gap-2">
            <button onClick={() => setShowImport(true)}
              className="border border-gray-200 text-gray-600 px-3 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
              Import
            </button>
            <button onClick={() => setModal({ type: 'tx' })}
              className="bg-green-500 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-green-600 transition-colors">
              + Transaction
            </button>
            <button onClick={() => setModal({ type: 'invoice' })}
              className="bg-brand-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-brand-700 transition-colors">
              + Invoice
            </button>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Revenue',  value: fmtCurrency(summary?.revenue),  icon: '↑', color: 'bg-green-50 text-green-600 border-green-100' },
          { label: 'Total Expenses', value: fmtCurrency(summary?.expenses), icon: '↓', color: 'bg-red-50 text-red-600 border-red-100' },
          { label: profit >= 0 ? 'Net Profit' : 'Net Loss', value: fmtCurrency(Math.abs(profit)), icon: profit >= 0 ? '📈' : '📉', color: profit >= 0 ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-orange-50 text-orange-600 border-orange-100' },
          { label: 'Outstanding Inv', value: summary?.outstandingInvoices ?? '—', icon: '🧾', color: 'bg-purple-50 text-purple-600 border-purple-100' },
        ].map(c => (
          <div key={c.label} className={`bg-white rounded-2xl border ${c.color.split(' ')[2]} shadow-sm p-4 flex items-center gap-3`}>
            <div className={`${c.color.split(' ').slice(0,2).join(' ')} w-11 h-11 rounded-xl flex items-center justify-center text-lg font-bold flex-shrink-0`}>{c.icon}</div>
            <div>
              <p className="text-xs text-gray-400 uppercase font-semibold tracking-wide">{c.label}</p>
              <p className={`text-xl font-bold mt-0.5 ${c.color.split(' ')[1]}`}>{c.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-5 w-fit">
        {[['overview','📊 Overview'],['transactions','💳 Transactions'],['invoices','🧾 Invoices']].map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab===t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ── */}
      {tab === 'overview' && (
        <div className="space-y-5">
          {/* Chart */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="font-semibold text-gray-800 text-sm mb-4">Revenue vs Expenses — Last 6 Months</h3>
            {monthly.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={monthly} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => '₹' + (v >= 1000 ? (v/1000).toFixed(0)+'k' : v)} />
                  <Tooltip formatter={(v) => fmtCurrency(v)} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="revenue"  name="Revenue"  fill="#10b981" radius={[4,4,0,0]} maxBarSize={32} />
                  <Bar dataKey="expenses" name="Expenses" fill="#f43f5e" radius={[4,4,0,0]} maxBarSize={32} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-48 flex items-center justify-center text-sm text-gray-400">No finance data yet. Add transactions to see the chart.</div>
            )}
          </div>

          {/* Recent transactions */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-800 text-sm">Recent Transactions</h3>
              <button onClick={() => setTab('transactions')} className="text-xs text-brand-600 hover:text-brand-700">View all →</button>
            </div>
            {(summary?.recentTransactions || []).length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">No transactions yet</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {(summary?.recentTransactions || []).map(tx => (
                  <div key={tx._id} className="flex items-center gap-3 py-3">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0 ${tx.type==='INCOME' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                      {tx.type==='INCOME' ? '↑' : '↓'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{tx.description}</p>
                      <p className="text-xs text-gray-400">{tx.category || tx.paymentMethod} · {fmtDate(tx.date)}</p>
                    </div>
                    <p className={`text-sm font-semibold flex-shrink-0 ${tx.type==='INCOME' ? 'text-green-600' : 'text-red-500'}`}>
                      {tx.type==='INCOME' ? '+' : '-'}{fmtCurrency(tx.amount)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TRANSACTIONS TAB ── */}
      {tab === 'transactions' && (
        <div>
          {/* Filters */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-4">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <select className="input-field text-sm py-2.5" value={txType} onChange={e => setTxType(e.target.value)}>
                <option value="">All Types</option>
                <option value="INCOME">Income</option>
                <option value="EXPENSE">Expense</option>
              </select>
              <div>
                <label className="text-xs text-gray-400 block mb-1">From</label>
                <input type="date" className="input-field text-sm py-2.5" value={txFrom} onChange={e => setTxFrom(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">To</label>
                <input type="date" className="input-field text-sm py-2.5" value={txTo} onChange={e => setTxTo(e.target.value)} />
              </div>
              {(txType||txFrom||txTo) && (
                <button onClick={() => { setTxType(''); setTxFrom(''); setTxTo('') }} className="text-sm text-gray-400 hover:text-gray-600 px-4 py-2.5 border border-gray-200 rounded-xl hover:bg-gray-50">Clear filters</button>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {transactions.length === 0 ? (
              <div className="text-center py-16">
                <div className="text-5xl mb-3">💳</div>
                <p className="text-gray-500 font-medium">No transactions found</p>
                {canWrite && <p className="text-sm text-gray-400 mt-1">Click "+ Transaction" to record income or expenses</p>}
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {transactions.map(tx => (
                  <div key={tx._id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50/50">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold flex-shrink-0 ${tx.type==='INCOME' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                      {tx.type==='INCOME' ? '↑' : '↓'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{tx.description}</p>
                      <p className="text-xs text-gray-400">
                        {tx.category && <span>{tx.category} · </span>}
                        {tx.paymentMethod.replace('_',' ')} · {fmtDate(tx.date)}
                        {tx.reference && <span> · Ref: {tx.reference}</span>}
                      </p>
                    </div>
                    <p className={`text-sm font-bold flex-shrink-0 ${tx.type==='INCOME' ? 'text-green-600' : 'text-red-500'}`}>
                      {tx.type==='INCOME' ? '+' : '-'}{fmtCurrency(tx.amount)}
                    </p>
                    {canWrite && (
                      <button onClick={() => setModal({ type: 'tx', data: { ...tx, date: tx.date?.split('T')[0] } })}
                        className="text-xs text-gray-400 hover:text-amber-600 px-2 py-1 rounded-lg hover:bg-amber-50 transition-colors">Edit</button>
                    )}
                    {canDelete && (
                      <button onClick={() => handleDeleteTx(tx._id)} disabled={actionBusy===tx._id}
                        className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50 disabled:opacity-40">Del</button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pagination */}
          {txPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-gray-400">{txTotal} transactions</p>
              <div className="flex gap-2">
                <button onClick={() => setTxPage(p => Math.max(1,p-1))} disabled={txPage===1} className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40">← Prev</button>
                <button onClick={() => setTxPage(p => Math.min(txPages,p+1))} disabled={txPage===txPages} className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40">Next →</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── INVOICES TAB ── */}
      {tab === 'invoices' && (
        <div>
          <div className="flex gap-2 mb-4 flex-wrap">
            {['','DRAFT','SENT','PAID','CANCELLED'].map(s => (
              <button key={s} onClick={() => setInvStatus(s)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${invStatus===s ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                {s || 'All'}
              </button>
            ))}
            <span className="ml-auto text-sm text-gray-400 self-center">{invTotal} invoice{invTotal!==1?'s':''}</span>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {/* Table header */}
            <div className="hidden md:grid grid-cols-[auto_2fr_1.5fr_1fr_1fr_auto] gap-4 px-6 py-3 border-b border-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-400">
              <span>#</span><span>Customer</span><span>Dates</span><span>Amount</span><span>Status</span><span>Actions</span>
            </div>

            {invoices.length === 0 ? (
              <div className="text-center py-16">
                <div className="text-5xl mb-3">🧾</div>
                <p className="text-gray-500 font-medium">No invoices found</p>
                {canWrite && <p className="text-sm text-gray-400 mt-1">Click "+ Invoice" to create your first invoice</p>}
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {invoices.map(inv => (
                  <div key={inv._id} className="grid grid-cols-1 md:grid-cols-[auto_2fr_1.5fr_1fr_1fr_auto] gap-2 md:gap-4 px-4 md:px-6 py-4 hover:bg-gray-50/50 items-center">
                    <div className="font-mono text-xs text-gray-400">{inv.invoiceNumber}</div>
                    <div>
                      <p className="font-medium text-gray-800 text-sm">{inv.customer?.name}</p>
                      {inv.customer?.email && <p className="text-xs text-gray-400 truncate">{inv.customer.email}</p>}
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Issued: {fmtDate(inv.issueDate)}</p>
                      {inv.dueDate && <p className="text-xs text-gray-400">Due: {fmtDate(inv.dueDate)}</p>}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-800">{fmtCurrency(inv.totalAmount)}</p>
                      <p className="text-xs text-gray-400">{inv.items?.length} item{inv.items?.length!==1?'s':''}</p>
                    </div>
                    <div>
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_STYLE[inv.status]}`}>
                        {inv.status}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <button onClick={() => downloadPDF(inv._id, inv.invoiceNumber)}
                        className="text-xs text-brand-600 hover:text-brand-700 px-2 py-1 rounded-lg hover:bg-brand-50 transition-colors font-medium">
                        PDF
                      </button>
                      {canWrite && inv.status !== 'PAID' && inv.status !== 'CANCELLED' && (
                        <>
                          {inv.status === 'DRAFT' && (
                            <button onClick={() => handleInvoiceStatus(inv,'SENT')} className="text-xs text-blue-500 hover:text-blue-700 px-2 py-1 rounded-lg hover:bg-blue-50">Send</button>
                          )}
                          {inv.status === 'SENT' && (
                            <button onClick={() => handleInvoiceStatus(inv,'PAID')} className="text-xs text-green-600 hover:text-green-700 px-2 py-1 rounded-lg hover:bg-green-50 font-medium">Mark Paid</button>
                          )}
                          <button onClick={() => setModal({ type: 'invoice', data: inv })} className="text-xs text-gray-400 hover:text-amber-600 px-2 py-1 rounded-lg hover:bg-amber-50">Edit</button>
                        </>
                      )}
                      {canWrite && inv.status !== 'PAID' && (
                        <button onClick={() => handleInvoiceStatus(inv,'CANCELLED')} className="text-xs text-gray-300 hover:text-red-500 px-2 py-1 rounded-lg hover:bg-red-50">Cancel</button>
                      )}
                      {canDelete && (
                        <button onClick={() => handleDeleteInvoice(inv._id)} disabled={actionBusy===inv._id} className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50 disabled:opacity-40">Del</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      {modal?.type === 'tx' && (
        <TransactionModal
          initial={modal.data}
          categories={categories}
          onClose={() => setModal(null)}
          onSave={async (payload) => {
            if (modal.data) await api.patch(`/finance/transactions/${modal.data._id}`, payload)
            else await api.post('/finance/transactions', payload)
            fetchSummary(); fetchTransactions(txPage); fetchCategories()
          }}
        />
      )}
      {modal?.type === 'invoice' && (
        <InvoiceModal
          initial={modal.data ? {
            customer:  modal.data.customer,
            items:     modal.data.items?.map(it => ({ description: it.description, quantity: it.quantity, unitPrice: it.unitPrice, taxRate: it.taxRate || 0 })),
            notes:     modal.data.notes || '',
            signature: modal.data.signature || '',
            issueDate: modal.data.issueDate?.split('T')[0] || '',
            dueDate:   modal.data.dueDate?.split('T')[0]   || '',
            _id:       modal.data._id,
          } : undefined}
          onClose={() => setModal(null)}
          onSave={async (payload) => {
            if (modal.data?._id) await api.patch(`/finance/invoices/${modal.data._id}`, payload)
            else await api.post('/finance/invoices', payload)
            fetchInvoices(); fetchSummary()
          }}
        />
      )}

      {showImport && (
        <ImportModal
          type="transactions"
          onClose={() => setShowImport(false)}
          onDone={() => { setShowImport(false); fetchTransactions(); fetchSummary() }}
        />
      )}
    </Layout>
  )
}
