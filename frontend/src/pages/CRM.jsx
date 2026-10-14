import { useState, useEffect, useCallback } from 'react'
import { useSocket } from '../context/SocketContext'
import { useAuth }   from '../context/AuthContext'
import Layout from '../components/Layout'
import api from '../api/axios'

/* ── Constants ─────────────────────────────────────────────────────────────── */

const STAGES = ['New', 'Contacted', 'Qualified', 'Proposal', 'Negotiation', 'Won', 'Lost']

const STAGE_STYLE = {
  New:         { bg: 'bg-gray-100',   text: 'text-gray-700',   border: 'border-gray-300',   dot: 'bg-gray-400'   },
  Contacted:   { bg: 'bg-blue-50',    text: 'text-blue-700',   border: 'border-blue-200',   dot: 'bg-blue-500'   },
  Qualified:   { bg: 'bg-indigo-50',  text: 'text-indigo-700', border: 'border-indigo-200', dot: 'bg-indigo-500' },
  Proposal:    { bg: 'bg-purple-50',  text: 'text-purple-700', border: 'border-purple-200', dot: 'bg-purple-500' },
  Negotiation: { bg: 'bg-amber-50',   text: 'text-amber-700',  border: 'border-amber-200',  dot: 'bg-amber-500'  },
  Won:         { bg: 'bg-green-50',   text: 'text-green-700',  border: 'border-green-200',  dot: 'bg-green-500'  },
  Lost:        { bg: 'bg-red-50',     text: 'text-red-700',    border: 'border-red-200',    dot: 'bg-red-400'    },
}

const SOURCE_BADGE = {
  WhatsApp:    'bg-green-100 text-green-700',
  GoogleSheet: 'bg-blue-100 text-blue-700',
  Manual:      'bg-gray-100 text-gray-600',
  Import:      'bg-orange-100 text-orange-700',
}

const fmtCurrency = (n) => n ? `₹${Number(n).toLocaleString('en-IN')}` : null

/* ── Tiny components ────────────────────────────────────────────────────────── */

const StageBadge = ({ stage }) => {
  const s = STAGE_STYLE[stage] || STAGE_STYLE.New
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {stage}
    </span>
  )
}

const Avatar = ({ name, size = 'sm' }) => {
  const sz = size === 'sm' ? 'w-7 h-7 text-xs' : 'w-9 h-9 text-sm'
  return (
    <div className={`${sz} rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold flex-shrink-0`}>
      {(name || '?')[0].toUpperCase()}
    </div>
  )
}

/* ── Lead Card (Kanban) ─────────────────────────────────────────────────────── */
const LeadCard = ({ lead, onClick }) => (
  <div
    onClick={() => onClick(lead)}
    className="bg-white rounded-xl border border-gray-200 p-3 cursor-pointer hover:shadow-md hover:border-indigo-300 transition-all group"
  >
    <div className="flex items-start justify-between gap-2 mb-2">
      <p className="text-sm font-semibold text-gray-900 leading-tight group-hover:text-indigo-700 transition-colors">{lead.name}</p>
      {lead.source && (
        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${SOURCE_BADGE[lead.source] || SOURCE_BADGE.Manual}`}>
          {lead.source === 'GoogleSheet' ? 'Sheet' : lead.source}
        </span>
      )}
    </div>
    {lead.company && <p className="text-xs text-gray-500 mb-1 truncate">🏢 {lead.company}</p>}
    <p className="text-xs text-gray-500 mb-2">{lead.phone}</p>
    {lead.query && <p className="text-xs text-gray-400 italic truncate mb-2">"{lead.query}"</p>}
    <div className="flex items-center justify-between">
      {lead.value > 0
        ? <span className="text-xs font-semibold text-green-600">{fmtCurrency(lead.value)}</span>
        : <span />
      }
      {lead.assignedTo
        ? <Avatar name={lead.assignedTo.name} size="sm" />
        : <span className="text-xs text-gray-300">Unassigned</span>
      }
    </div>
  </div>
)

/* ── Lead Detail Modal ──────────────────────────────────────────────────────── */
const ACTIVITY_ICON = {
  created:            { icon: '✨', color: 'text-indigo-500' },
  stage_change:       { icon: '🔄', color: 'text-blue-500'   },
  note_added:         { icon: '📝', color: 'text-gray-500'   },
  whatsapp_sent:      { icon: '💬', color: 'text-green-500'  },
  followup_sent:      { icon: '⚡', color: 'text-purple-500' },
  bulk_whatsapp:      { icon: '📢', color: 'text-green-500'  },
  assigned:           { icon: '👤', color: 'text-orange-500' },
  production_created: { icon: '🏭', color: 'text-red-500'    },
  stale_alert:        { icon: '⚠️', color: 'text-amber-500'  },
  value_changed:      { icon: '💰', color: 'text-emerald-500'},
}

const LeadModal = ({ lead: initial, onClose, onUpdate, members }) => {
  const [lead, setLead]         = useState(initial)
  const [saving, setSaving]     = useState(false)
  const [waMsgBox, setWaMsg]    = useState('')
  const [sending, setSending]   = useState(false)
  const [waStatus, setWaStatus] = useState(null)
  const [tab, setTab]           = useState('details')
  const [activities, setActivities]     = useState([])
  const [pendingFU, setPendingFU]       = useState(0)
  const [actLoading, setActLoading]     = useState(false)
  const [waConnected, setWaConnected]   = useState(null) // null=checking, true=ok, false=offline

  useEffect(() => {
    if (tab !== 'whatsapp') return
    setWaConnected(null)
    api.get('/wa-status').then(r => {
      const d = r.data
      // provider=console → treat as always-connected (just logs)
      if (d.provider === 'console') { setWaConnected(true); return }
      setWaConnected(d.connected === true)
    }).catch(() => setWaConnected(false))
  }, [tab])

  useEffect(() => {
    if (tab !== 'timeline') return
    setActLoading(true)
    api.get(`/crm/leads/${lead._id}/activity`)
      .then(r => {
        setActivities(r.data.data.activities || [])
        setPendingFU(r.data.data.pendingFollowUps || 0)
      })
      .catch(() => {})
      .finally(() => setActLoading(false))
  }, [tab, lead._id])

  const patch = async (updates) => {
    setSaving(true)
    try {
      const { data } = await api.patch(`/crm/leads/${lead._id}`, updates)
      setLead(data.data.lead)
      onUpdate(data.data.lead)
    } finally {
      setSaving(false)
    }
  }

  const sendWA = async () => {
    if (!waMsgBox.trim()) return
    setSending(true)
    setWaStatus(null)
    try {
      await api.post(`/crm/leads/${lead._id}/whatsapp`, { message: waMsgBox.trim() })
      setWaStatus('sent')
      setWaConnected(true)
      setWaMsg('')
      const { data } = await api.get(`/crm/leads/${lead._id}`)
      setLead(data.data.lead)
      onUpdate(data.data.lead)
    } catch (e) {
      const msg = e.response?.data?.message || null
      setWaStatus(msg || 'error')
      if (msg?.includes('not connected') || msg?.includes('connection_timeout')) {
        setWaConnected(false)
      }
    } finally {
      setSending(false)
    }
  }

  const s = STAGE_STYLE[lead.stage] || STAGE_STYLE.New
  const fmtDt = (d) => new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className={`px-5 py-4 border-b ${s.bg} ${s.border} border`}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-900">{lead.name}</h2>
              {lead.company && <p className="text-sm text-gray-500 mt-0.5">🏢 {lead.company}</p>}
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-black/10 text-gray-500 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b px-5 pt-2 gap-4">
          {[
            { id: 'details',  label: '📋 Details'  },
            { id: 'whatsapp', label: '💬 WhatsApp'  },
            { id: 'timeline', label: `📜 Timeline${pendingFU ? ` (${pendingFU} pending)` : ''}` },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`pb-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                tab === t.id ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>{t.label}</button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {tab === 'details' && (
            <>
              {/* Contact info */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-gray-400 mb-1">Phone</p>
                  <p className="text-sm font-medium text-gray-800">{lead.phone}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-1">Email</p>
                  <p className="text-sm font-medium text-gray-800">{lead.email || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-1">Source</p>
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${SOURCE_BADGE[lead.source] || SOURCE_BADGE.Manual}`}>
                    {lead.source}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-1">Deal Value</p>
                  <input
                    type="number"
                    defaultValue={lead.value || ''}
                    placeholder="₹0"
                    className="text-sm border border-gray-200 rounded-lg px-2 py-1 w-full focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                    onBlur={e => patch({ value: Number(e.target.value) || 0 })}
                  />
                </div>
              </div>

              {/* Stage */}
              <div>
                <p className="text-xs text-gray-400 mb-2">Pipeline Stage</p>
                <div className="flex flex-wrap gap-1.5">
                  {STAGES.map(s => {
                    const st = STAGE_STYLE[s]
                    return (
                      <button
                        key={s}
                        onClick={() => patch({ stage: s })}
                        disabled={saving}
                        className={`text-xs px-2.5 py-1 rounded-lg font-medium border transition-all ${
                          lead.stage === s
                            ? `${st.bg} ${st.text} ${st.border} border shadow-sm`
                            : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        {s}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Assign to */}
              <div>
                <p className="text-xs text-gray-400 mb-1">Assigned To</p>
                <select
                  value={lead.assignedTo?._id || lead.assignedTo || ''}
                  onChange={e => patch({ assignedTo: e.target.value || null })}
                  className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 w-full focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value="">Unassigned</option>
                  {members.map(m => (
                    <option key={m._id} value={m._id}>{m.name || m.phone}</option>
                  ))}
                </select>
              </div>

              {/* Query */}
              {lead.query && (
                <div>
                  <p className="text-xs text-gray-400 mb-1">Initial Query</p>
                  <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3 italic">"{lead.query}"</p>
                </div>
              )}

              {/* Notes */}
              <div>
                <p className="text-xs text-gray-400 mb-1">Notes</p>
                <textarea
                  defaultValue={lead.notes || ''}
                  rows={3}
                  placeholder="Add notes about this lead…"
                  className="text-sm border border-gray-200 rounded-lg px-3 py-2 w-full focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                  onBlur={e => patch({ notes: e.target.value || null })}
                />
              </div>

              {/* Meta */}
              <div className="text-xs text-gray-400 space-y-0.5 pt-1">
                <p>Added: {new Date(lead.createdAt).toLocaleString('en-IN')}</p>
                {lead.lastContactedAt && <p>Last contact: {new Date(lead.lastContactedAt).toLocaleString('en-IN')}</p>}
              </div>
            </>
          )}

          {tab === 'whatsapp' && (
            <div className="space-y-4">
              {/* WA connection status */}
              {waConnected === null && (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs text-gray-500 flex items-center gap-2">
                  <span className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                  Checking WhatsApp connection…
                </div>
              )}
              {waConnected === false && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-800 space-y-2">
                  <p className="font-semibold">⚠️ WhatsApp not connected</p>
                  <p className="text-xs text-red-600">Your WhatsApp session is offline. Scan a QR code to reconnect.</p>
                  <div className="flex flex-col gap-1.5 pt-0.5">
                    <a
                      href={`${new URL(import.meta.env.VITE_API_URL || 'http://localhost:5000/api').origin}/api/whatsapp/qr`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-block text-xs font-semibold text-red-700 underline hover:text-red-900"
                    >
                      → Open QR scan page
                    </a>
                    <a
                      href={`${new URL(import.meta.env.VITE_API_URL || 'http://localhost:5000/api').origin}/api/whatsapp/reset`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-block text-xs text-red-500 underline hover:text-red-700"
                    >
                      QR not showing? Reset session first →
                    </a>
                  </div>
                </div>
              )}
              {waConnected === true && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-green-800">
                  <p className="font-semibold mb-0.5">Send WhatsApp to {lead.name}</p>
                  <p className="text-xs text-green-600">{lead.phone}</p>
                </div>
              )}

              <div>
                <textarea
                  value={waMsgBox}
                  onChange={e => setWaMsg(e.target.value)}
                  rows={5}
                  placeholder={`Hi ${lead.name?.split(' ')[0] || 'there'} 👋\n\nType your message here…`}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500 outline-none resize-none"
                />
              </div>

              {waStatus === 'sent' && (
                <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-3 py-2 rounded-lg">
                  ✅ Message sent! Lead moved to "Contacted".
                </div>
              )}
              {waStatus && waStatus !== 'sent' && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">
                  ❌ {typeof waStatus === 'string' && waStatus !== 'error' ? waStatus : 'Failed to send. Check WhatsApp connection.'}
                </div>
              )}

              <button
                onClick={sendWA}
                disabled={sending || !waMsgBox.trim() || waConnected === false}
                className="w-full py-2.5 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {sending
                  ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Sending…</>
                  : '📤 Send WhatsApp'
                }
              </button>

              {waConnected !== false && (
                <div className="text-xs text-gray-400 text-center">
                  Uses your connected WhatsApp account
                </div>
              )}
            </div>
          )}

          {tab === 'timeline' && (
            <div className="space-y-1">
              {pendingFU > 0 && (
                <div className="bg-purple-50 border border-purple-200 rounded-xl px-3 py-2 text-xs text-purple-700 mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 bg-purple-400 rounded-full animate-pulse" />
                  {pendingFU} follow-up message{pendingFU > 1 ? 's' : ''} scheduled automatically
                </div>
              )}
              {actLoading ? (
                <div className="text-center text-gray-400 py-8 text-sm">Loading…</div>
              ) : activities.length === 0 ? (
                <div className="text-center text-gray-400 py-8 text-sm">No activity yet</div>
              ) : (
                <div className="relative">
                  <div className="absolute left-3 top-0 bottom-0 w-px bg-gray-100" />
                  <div className="space-y-3">
                    {activities.map(a => {
                      const ic = ACTIVITY_ICON[a.type] || { icon: '•', color: 'text-gray-400' }
                      return (
                        <div key={a._id} className="flex gap-3 relative">
                          <span className={`w-6 h-6 rounded-full bg-white border border-gray-200 flex items-center justify-center text-xs flex-shrink-0 z-10 ${ic.color}`}>
                            {ic.icon}
                          </span>
                          <div className="flex-1 min-w-0 pb-2">
                            <p className="text-sm text-gray-800 leading-snug">{a.description}</p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {fmtDt(a.createdAt)}{a.by?.name ? ` · ${a.by.name}` : ' · System'}
                            </p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Add Lead Modal ─────────────────────────────────────────────────────────── */
const AddLeadModal = ({ onClose, onCreated, members }) => {
  const [form, setForm] = useState({ name: '', phone: '', email: '', company: '', query: '', stage: 'New', value: '', assignedTo: '' })
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setErr('')
    try {
      const { data } = await api.post('/crm/leads', {
        ...form,
        value:      form.value ? Number(form.value) : 0,
        assignedTo: form.assignedTo || null,
      })
      onCreated(data.data.lead)
      onClose()
    } catch (e) {
      setErr(e.response?.data?.message || 'Failed to create lead')
    } finally {
      setSaving(false)
    }
  }

  const f = (k) => e => setForm(p => ({ ...p, [k]: e.target.value }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900">Add New Lead</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
              <input value={form.name} onChange={f('name')} required placeholder="Rajesh Kumar"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Phone *</label>
              <input value={form.phone} onChange={f('phone')} required placeholder="+91 98765 43210"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Company</label>
              <input value={form.company} onChange={f('company')} placeholder="Acme Pvt Ltd"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
              <input type="email" value={form.email} onChange={f('email')} placeholder="raj@acme.com"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Stage</label>
              <select value={form.stage} onChange={f('stage')}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                {STAGES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Deal Value (₹)</label>
              <input type="number" value={form.value} onChange={f('value')} placeholder="0"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Assign To</label>
            <select value={form.assignedTo} onChange={f('assignedTo')}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
              <option value="">Unassigned</option>
              {members.map(m => <option key={m._id} value={m._id}>{m.name || m.phone}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Initial Query</label>
            <textarea value={form.query} onChange={f('query')} rows={2} placeholder="What are they looking for?"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none" />
          </div>
          {err && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{err}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
              {saving ? 'Creating…' : 'Create Lead'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ── Import Modal ───────────────────────────────────────────────────────────── */
const ImportModal = ({ onClose, onDone, initialTab = 'auto' }) => {
  const [tab,       setTab]       = useState(initialTab)
  const [url,       setUrl]       = useState('')
  const [file,      setFile]      = useState(null)
  const [loading,   setLoading]   = useState(false)
  const [err,       setErr]       = useState('')
  const [autoUrl,   setAutoUrl]   = useState('')
  const [autoSync,  setAutoSync]  = useState(false)
  const [lastSync,  setLastSync]  = useState(null)
  const [saving,    setSaving]    = useState(false)
  const [saved,     setSaved]     = useState(false)

  useEffect(() => {
    api.get('/crm/settings').then(r => {
      const crm = r.data?.data?.crm || {}
      setAutoUrl(crm.sheetUrl || '')
      setAutoSync(crm.autoSync || false)
      setLastSync(crm.lastSyncAt || null)
    }).catch(() => {})
  }, [])

  const syncUrl = async () => {
    if (!url.trim()) return
    setLoading(true); setErr('')
    try {
      const { data } = await api.post('/crm/sync-url', { sheetUrl: url.trim() })
      onDone(data.message)
    } catch (e) {
      setErr(e.response?.data?.message || 'Sync failed')
    } finally { setLoading(false) }
  }

  const uploadCsv = async () => {
    if (!file) return
    setLoading(true); setErr('')
    try {
      const form = new FormData()
      form.append('file', file)
      const { data } = await api.post('/crm/import-csv', form, { headers: { 'Content-Type': 'multipart/form-data' } })
      onDone(data.message)
    } catch (e) {
      setErr(e.response?.data?.message || 'Import failed')
    } finally { setLoading(false) }
  }

  const saveAutoSync = async () => {
    setSaving(true); setSaved(false); setErr('')
    try {
      await api.put('/crm/settings', { sheetUrl: autoUrl, autoSync })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e) {
      setErr(e.response?.data?.message || 'Failed to save')
    } finally { setSaving(false) }
  }

  const fmtTime = (t) => {
    if (!t) return null
    const diff = Math.round((Date.now() - new Date(t)) / 60000)
    if (diff < 1) return 'just now'
    if (diff < 60) return `${diff} min ago`
    return new Date(t).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900">Import Leads</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b px-5 pt-2 gap-4 overflow-x-auto">
          {[
            { id: 'auto', label: '⚡ Auto Sync' },
            { id: 'url',  label: '🔗 One-time URL' },
            { id: 'csv',  label: '📄 Upload CSV' },
          ].map(t => (
            <button key={t.id} onClick={() => { setTab(t.id); setErr('') }}
              className={`pb-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                tab === t.id ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>{t.label}</button>
          ))}
        </div>

        <div className="p-5 space-y-4">
          {tab === 'auto' && (
            <>
              <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-green-800 space-y-1">
                <p className="font-semibold">Auto Sync — Every 5 minutes</p>
                <p className="text-xs text-green-700">New rows added by your bot will appear automatically. Just paste your public sheet URL and enable sync.</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Google Sheet URL (public)</label>
                <input
                  value={autoUrl}
                  onChange={e => setAutoUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/…"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>

              <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-800">Enable Auto Sync</p>
                  <p className="text-xs text-gray-400">Polls sheet every 5 minutes</p>
                </div>
                <button
                  onClick={() => setAutoSync(v => !v)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${autoSync ? 'bg-green-500' : 'bg-gray-300'}`}
                >
                  <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${autoSync ? 'left-6' : 'left-1'}`} />
                </button>
              </div>

              {lastSync && (
                <p className="text-xs text-gray-400 text-center">Last synced: {fmtTime(lastSync)}</p>
              )}

              {err   && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{err}</p>}
              {saved && <p className="text-sm text-green-700 bg-green-50 px-3 py-2 rounded-lg">✅ Settings saved — auto sync is {autoSync ? 'ON' : 'OFF'}</p>}

              <div className="flex gap-2">
                <button onClick={onClose} className="flex-1 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50">Close</button>
                <button onClick={saveAutoSync} disabled={saving}
                  className="flex-1 py-2 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2">
                  {saving ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Saving…</> : 'Save Settings'}
                </button>
              </div>
            </>
          )}

          {tab === 'url' && (
            <>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-sm text-blue-800 space-y-1">
                <p className="font-semibold">One-time manual sync</p>
                <ol className="text-xs text-blue-700 list-decimal list-inside space-y-0.5">
                  <li>Open your Google Sheet</li>
                  <li>Click <strong>File → Share → Share with others</strong></li>
                  <li>Set "General access" to <strong>Anyone with the link → Viewer</strong></li>
                  <li>Copy the link and paste below</li>
                </ol>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Google Sheet URL</label>
                <input
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/…"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <p className="text-xs text-gray-400">First row must have column headers like "Name", "Phone", "Company", "Email".</p>
              {err && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{err}</p>}
              <div className="flex gap-2">
                <button onClick={onClose} className="flex-1 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
                <button onClick={syncUrl} disabled={loading || !url.trim()}
                  className="flex-1 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2">
                  {loading ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Syncing…</> : 'Sync Sheet'}
                </button>
              </div>
            </>
          )}

          {tab === 'csv' && (
            <>
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-sm text-orange-800 space-y-1">
                <p className="font-semibold">Works with any spreadsheet app</p>
                <ol className="text-xs text-orange-700 list-decimal list-inside space-y-0.5">
                  <li>Open Google Sheets / Excel / Numbers</li>
                  <li>Export as <strong>CSV (.csv)</strong></li>
                  <li>Upload the file below</li>
                </ol>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">CSV File</label>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={e => setFile(e.target.files?.[0] || null)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none file:mr-3 file:py-1 file:px-2 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                />
              </div>
              <p className="text-xs text-gray-400">First row must have column headers like "Name", "Phone", "Company", "Email". Max 5 MB.</p>
              {err && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{err}</p>}
              <div className="flex gap-2">
                <button onClick={onClose} className="flex-1 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
                <button onClick={uploadCsv} disabled={loading || !file}
                  className="flex-1 py-2 rounded-xl bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 disabled:opacity-50 flex items-center justify-center gap-2">
                  {loading ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Importing…</> : 'Upload & Import'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Main CRM Page ──────────────────────────────────────────────────────────── */
export default function CRM() {
  const { socket } = useSocket()
  const { user }   = useAuth()

  const [view,       setView]       = useState('kanban')
  const [kanban,     setKanban]     = useState({})
  const [leads,      setLeads]      = useState([])
  const [stats,      setStats]      = useState({})
  const [members,    setMembers]    = useState([])
  const [loading,    setLoading]    = useState(true)
  const [syncResult, setSyncResult] = useState(null)
  const [selectedLead, setSelectedLead] = useState(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showImport,   setShowImport]   = useState(false)
  const [importTab,    setImportTab]    = useState('auto')
  const [autoSyncOn,   setAutoSyncOn]   = useState(false)
  const [search,       setSearch]       = useState('')
  const [filterStage,  setFilterStage]  = useState('')
  const [selected,     setSelected]     = useState(new Set())
  const [bulkMsg,      setBulkMsg]      = useState('')
  const [bulkSending,  setBulkSending]  = useState(false)
  const [bulkResult,   setBulkResult]   = useState(null)
  const [sheetUrl,     setSheetUrl]     = useState('')
  const [refreshing,   setRefreshing]   = useState(false)

  useEffect(() => {
    api.get('/crm/settings').then(r => {
      const crm = r.data?.data?.crm || {}
      setAutoSyncOn(crm.autoSync || false)
      setSheetUrl(crm.sheetUrl || '')
    }).catch(() => {})
  }, [showImport]) // re-check after modal closes

  const refreshFromSheet = async () => {
    if (!sheetUrl || refreshing) return
    setRefreshing(true)
    setSyncResult(null)
    try {
      const { data } = await api.post('/crm/sync-url', { sheetUrl })
      setSyncResult({ ok: true, msg: data.message })
      loadKanban()
      if (view === 'list') loadLeads()
    } catch (e) {
      setSyncResult({ ok: false, msg: e.response?.data?.message || 'Sync failed' })
    } finally {
      setRefreshing(false)
    }
  }

  const loadKanban = useCallback(async () => {
    try {
      const { data } = await api.get('/crm/kanban')
      setKanban(data.data.kanban)
      setStats(data.data.stats)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadLeads = useCallback(async () => {
    const params = new URLSearchParams({ limit: 200 })
    if (search)      params.set('search', search)
    if (filterStage) params.set('stage', filterStage)
    const { data } = await api.get(`/crm/leads?${params}`)
    setLeads(data.data.leads)
  }, [search, filterStage])

  useEffect(() => {
    api.get('/users?limit=100').then(r => setMembers(r.data?.data?.users || [])).catch(() => {})
    loadKanban()
  }, [loadKanban])

  useEffect(() => {
    if (view === 'list') loadLeads()
  }, [view, loadLeads])

  // Real-time socket updates
  useEffect(() => {
    if (!socket) return
    const refresh = () => { loadKanban(); if (view === 'list') loadLeads() }
    socket.on('crm:lead_created',  refresh)
    socket.on('crm:lead_updated',  refresh)
    socket.on('crm:lead_deleted',  refresh)
    socket.on('crm:synced',        refresh)
    socket.on('crm:bulk_sent',     refresh)
    return () => {
      socket.off('crm:lead_created',  refresh)
      socket.off('crm:lead_updated',  refresh)
      socket.off('crm:lead_deleted',  refresh)
      socket.off('crm:synced',        refresh)
      socket.off('crm:bulk_sent',     refresh)
    }
  }, [socket, view, loadKanban, loadLeads])

  // Fallback: poll every 30 seconds in case socket misses cron events
  useEffect(() => {
    const id = setInterval(() => {
      loadKanban()
      if (view === 'list') loadLeads()
    }, 30000)
    return () => clearInterval(id)
  }, [view, loadKanban, loadLeads])

  const handleImportDone = (msg) => {
    setShowImport(false)
    setSyncResult({ ok: true, msg })
    loadKanban()
  }

  const toggleSelect = (id) => setSelected(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const toggleSelectAll = () => {
    setSelected(prev => prev.size === leads.length ? new Set() : new Set(leads.map(l => l._id)))
  }

  const sendBulkWA = async () => {
    if (!bulkMsg.trim() || !selected.size) return
    setBulkSending(true); setBulkResult(null)
    try {
      const { data } = await api.post('/crm/bulk-whatsapp', {
        leadIds: [...selected],
        message: bulkMsg.trim(),
      })
      setBulkResult({ ok: true, msg: data.message })
      setSelected(new Set())
      setBulkMsg('')
    } catch (e) {
      setBulkResult({ ok: false, msg: e.response?.data?.message || 'Failed' })
    } finally {
      setBulkSending(false)
    }
  }

  const handleLeadUpdate = (updated) => {
    setKanban(prev => {
      const next = { ...prev }
      STAGES.forEach(s => { next[s] = (next[s] || []).filter(l => l._id !== updated._id) })
      next[updated.stage] = [updated, ...(next[updated.stage] || [])]
      return next
    })
    setLeads(prev => prev.map(l => l._id === updated._id ? updated : l))
    if (selectedLead?._id === updated._id) setSelectedLead(updated)
  }

  const handleLeadCreated = (lead) => {
    setKanban(prev => {
      const next = { ...prev }
      next[lead.stage] = [lead, ...(next[lead.stage] || [])]
      return next
    })
  }

  /* ── Stats bar ───────────────────────────────────────────────────────────── */
  const totalLeads = STAGES.reduce((s, k) => s + (kanban[k]?.length || 0), 0)
  const activeLeads = ['New','Contacted','Qualified','Proposal','Negotiation']
    .reduce((s, k) => s + (kanban[k]?.length || 0), 0)

  return (
    <Layout>
      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">CRM Pipeline</h1>
          <p className="text-sm text-gray-500 mt-0.5">Import leads from Google Sheets URL, CSV file, or add manually</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Refresh from Google Sheet */}
          {sheetUrl && (
            <button
              onClick={refreshFromSheet}
              disabled={refreshing}
              title="Pull latest leads from Google Sheet"
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 disabled:opacity-60 transition-colors"
            >
              <svg
                className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {refreshing ? 'Syncing…' : 'Refresh Sheet'}
            </button>
          )}

          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Import
            {autoSyncOn && (
              <span className="flex items-center gap-1 bg-green-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                LIVE
              </span>
            )}
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add Lead
          </button>
        </div>
      </div>

      {/* Auto-sync setup prompt */}
      {!autoSyncOn && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-amber-800">
            <span>⚡</span>
            <span><strong>Auto Sync is OFF.</strong> New leads from your bot won't appear automatically.</span>
          </div>
          <button onClick={() => { setImportTab('auto'); setShowImport(true) }}
            className="shrink-0 text-xs font-semibold text-amber-700 underline hover:text-amber-900">
            Set up Auto Sync →
          </button>
        </div>
      )}

      {/* Sync result toast */}
      {syncResult && (
        <div className={`mb-4 px-4 py-2.5 rounded-xl text-sm font-medium flex items-center justify-between ${
          syncResult.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          <span>{syncResult.ok ? '✅' : '❌'} {syncResult.msg}</span>
          <button onClick={() => setSyncResult(null)} className="ml-3 text-current opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {/* ── Stats ─────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {[
          { label: 'Total Leads',   value: totalLeads,                         color: 'text-gray-900' },
          { label: 'Active',        value: activeLeads,                         color: 'text-indigo-600' },
          { label: 'Won',           value: kanban.Won?.length || 0,             color: 'text-green-600' },
          { label: 'Pipeline Value',value: fmtCurrency(stats.totalValue) || '₹0', color: 'text-amber-600' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 px-4 py-3">
            <p className="text-xs text-gray-500 mb-0.5">{s.label}</p>
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* ── View toggle + filters ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex bg-white border border-gray-200 rounded-xl overflow-hidden text-sm">
          <button onClick={() => setView('kanban')} className={`px-3 py-1.5 font-medium transition-colors ${view === 'kanban' ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
            🏷 Pipeline
          </button>
          <button onClick={() => setView('list')} className={`px-3 py-1.5 font-medium transition-colors ${view === 'list' ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
            📋 All Leads
          </button>
        </div>

        {view === 'list' && (
          <>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search name, phone, company…"
              className="flex-1 min-w-[180px] max-w-xs border border-gray-200 rounded-xl px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            />
            <select value={filterStage} onChange={e => setFilterStage(e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
              <option value="">All Stages</option>
              {STAGES.map(s => <option key={s}>{s}</option>)}
            </select>
          </>
        )}
      </div>

      {/* ── Kanban View ───────────────────────────────────────────────────────── */}
      {view === 'kanban' && (
        loading ? (
          <div className="flex items-center justify-center h-48 text-gray-400">Loading pipeline…</div>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-4">
            {STAGES.map(stage => {
              const st = STAGE_STYLE[stage]
              const stageLeads = kanban[stage] || []
              return (
                <div key={stage} className="flex-shrink-0 w-60">
                  <div className={`flex items-center justify-between px-3 py-2 rounded-t-xl border-t border-x ${st.border} ${st.bg}`}>
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${st.dot}`} />
                      <span className={`text-xs font-semibold ${st.text}`}>{stage}</span>
                    </div>
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${st.bg} ${st.text}`}>
                      {stageLeads.length}
                    </span>
                  </div>
                  <div className={`min-h-24 rounded-b-xl border ${st.border} p-2 space-y-2 bg-gray-50/50`}>
                    {stageLeads.length === 0
                      ? <p className="text-center text-xs text-gray-300 py-4">No leads</p>
                      : stageLeads.map(lead => (
                          <LeadCard key={lead._id} lead={lead} onClick={setSelectedLead} />
                        ))
                    }
                  </div>
                </div>
              )
            })}
          </div>
        )
      )}

      {/* ── List View ─────────────────────────────────────────────────────────── */}
      {view === 'list' && (
        <div className="space-y-3">
          {/* Bulk action bar */}
          {selected.size > 0 && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-3 flex flex-wrap items-center gap-3">
              <span className="text-sm font-semibold text-indigo-700">{selected.size} selected</span>
              <textarea
                value={bulkMsg}
                onChange={e => setBulkMsg(e.target.value)}
                rows={2}
                placeholder="Type WhatsApp message to send to all selected leads…"
                className="flex-1 min-w-[200px] border border-indigo-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
              />
              <div className="flex gap-2">
                <button onClick={() => setSelected(new Set())}
                  className="px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">
                  Clear
                </button>
                <button onClick={sendBulkWA} disabled={bulkSending || !bulkMsg.trim()}
                  className="px-3 py-2 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:opacity-50 flex items-center gap-2">
                  {bulkSending
                    ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Sending…</>
                    : `📤 Send to ${selected.size}`
                  }
                </button>
              </div>
              {bulkResult && (
                <p className={`text-sm w-full ${bulkResult.ok ? 'text-green-700' : 'text-red-600'}`}>
                  {bulkResult.ok ? '✅' : '❌'} {bulkResult.msg}
                </p>
              )}
            </div>
          )}

          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-3 py-3 w-8">
                    <input type="checkbox"
                      checked={leads.length > 0 && selected.size === leads.length}
                      onChange={toggleSelectAll}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                  </th>
                  {['Name', 'Company', 'Phone', 'Stage', 'Source', 'Value', 'Assigned', 'Added'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {leads.length === 0
                  ? <tr><td colSpan={9} className="text-center text-gray-400 py-12">No leads found</td></tr>
                  : leads.map(lead => (
                      <tr key={lead._id}
                        className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${selected.has(lead._id) ? 'bg-indigo-50/50' : ''}`}
                      >
                        <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                          <input type="checkbox"
                            checked={selected.has(lead._id)}
                            onChange={() => toggleSelect(lead._id)}
                            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                          />
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-900 cursor-pointer" onClick={() => setSelectedLead(lead)}>{lead.name}</td>
                        <td className="px-4 py-3 text-gray-600">{lead.company || '—'}</td>
                        <td className="px-4 py-3 text-gray-600">{lead.phone}</td>
                        <td className="px-4 py-3"><StageBadge stage={lead.stage} /></td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded font-medium ${SOURCE_BADGE[lead.source] || SOURCE_BADGE.Manual}`}>
                            {lead.source === 'GoogleSheet' ? 'Sheet' : lead.source}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-700 font-medium">{fmtCurrency(lead.value) || '—'}</td>
                        <td className="px-4 py-3 text-gray-600">{lead.assignedTo?.name || '—'}</td>
                        <td className="px-4 py-3 text-gray-400">{new Date(lead.createdAt).toLocaleDateString('en-IN')}</td>
                      </tr>
                    ))
                }
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Modals ────────────────────────────────────────────────────────────── */}
      {selectedLead && (
        <LeadModal
          lead={selectedLead}
          members={members}
          onClose={() => setSelectedLead(null)}
          onUpdate={handleLeadUpdate}
        />
      )}
      {showAddModal && (
        <AddLeadModal
          members={members}
          onClose={() => setShowAddModal(false)}
          onCreated={handleLeadCreated}
        />
      )}
      {showImport && (
        <ImportModal
          initialTab={importTab}
          onClose={() => setShowImport(false)}
          onDone={handleImportDone}
        />
      )}
    </Layout>
  )
}
