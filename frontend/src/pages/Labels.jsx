import { useState, useEffect } from 'react'
import api from '../api/axios'
import Layout from '../components/Layout'

const PRESET_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#06b6d4', '#64748b', '#1e293b',
]

const LabelForm = ({ initial, onSave, onCancel }) => {
  const [name,  setName]  = useState(initial?.name  || '')
  const [color, setColor] = useState(initial?.color || '#6366f1')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try {
      await onSave({ name: name.trim(), color })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-3 flex-wrap">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Label name"
        maxLength={50}
        className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 flex-1 min-w-[160px]"
        autoFocus
      />
      <div className="flex gap-1.5 flex-wrap">
        {PRESET_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setColor(c)}
            className={`w-6 h-6 rounded-full transition-transform ${color === c ? 'scale-125 ring-2 ring-offset-1 ring-gray-400' : 'hover:scale-110'}`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="bg-brand-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={onCancel} className="text-sm text-gray-500 hover:text-gray-700 px-2">
          Cancel
        </button>
      </div>
    </form>
  )
}

const Labels = () => {
  const [labels, setLabels] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState(null)

  useEffect(() => {
    api.get('/labels')
      .then(({ data }) => setLabels(data.data.labels))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const handleCreate = async ({ name, color }) => {
    const { data } = await api.post('/labels', { name, color })
    setLabels((prev) => [...prev, data.data.label])
    setCreating(false)
  }

  const handleUpdate = async (id, updates) => {
    const { data } = await api.patch(`/labels/${id}`, updates)
    setLabels((prev) => prev.map((l) => (l._id === id ? data.data.label : l)))
    setEditingId(null)
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this label? It will be removed from all tasks.')) return
    await api.delete(`/labels/${id}`)
    setLabels((prev) => prev.filter((l) => l._id !== id))
  }

  return (
    <Layout>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Labels</h1>
          <p className="text-gray-500 text-sm mt-0.5">{labels.length} label{labels.length !== 1 ? 's' : ''}</p>
        </div>
        {!creating && (
          <button
            onClick={() => setCreating(true)}
            className="bg-brand-600 text-white px-4 py-2 rounded-xl font-medium hover:bg-brand-700 transition-colors flex items-center gap-2"
          >
            <span className="text-lg leading-none">+</span> New Label
          </button>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
        {creating && (
          <div className="p-4">
            <LabelForm onSave={handleCreate} onCancel={() => setCreating(false)} />
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-7 h-7 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : labels.length === 0 && !creating ? (
          <div className="text-center py-16 text-gray-400 text-sm">
            No labels yet. Create one to tag your tasks.
          </div>
        ) : (
          labels.map((label) => (
            <div key={label._id} className="p-4">
              {editingId === label._id ? (
                <LabelForm
                  initial={label}
                  onSave={(updates) => handleUpdate(label._id, updates)}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: label.color }} />
                    <span className="text-sm font-medium text-gray-800">{label.name}</span>
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ backgroundColor: label.color + '22', color: label.color }}
                    >
                      {label.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setEditingId(label._id)}
                      className="text-xs text-gray-400 hover:text-gray-700 transition-colors px-2 py-1 rounded-lg hover:bg-gray-100"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(label._id)}
                      className="text-xs text-red-400 hover:text-red-600 transition-colors px-2 py-1 rounded-lg hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </Layout>
  )
}

export default Labels
