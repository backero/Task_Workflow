import { useState, useEffect, useRef } from 'react'
import api from '../../api/axios'
import { useAuth } from '../../context/AuthContext'

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT']
const STATUSES   = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE']

const STATUS_COLOR = {
  TODO:        'bg-gray-100 text-gray-600',
  IN_PROGRESS: 'bg-blue-100 text-blue-700',
  IN_REVIEW:   'bg-amber-100 text-amber-700',
  DONE:        'bg-green-100 text-green-700',
}
const PRIORITY_COLOR = {
  LOW: 'text-green-600', MEDIUM: 'text-blue-600', HIGH: 'text-orange-600', URGENT: 'text-red-600',
}

const TimeTracker = ({ taskId }) => {
  const [logs, setLogs]       = useState([])
  const [total, setTotal]     = useState(0)
  const [minutes, setMinutes] = useState('')
  const [note, setNote]       = useState('')
  const [saving, setSaving]   = useState(false)
  const [open, setOpen]       = useState(false)

  useEffect(() => {
    if (!open) return
    api.get(`/time-logs/task/${taskId}`)
      .then(({ data }) => { setLogs(data.data.logs); setTotal(data.data.totalMinutes) })
      .catch(console.error)
  }, [taskId, open])

  const log = async (e) => {
    e.preventDefault()
    if (!minutes || Number(minutes) < 1) return
    setSaving(true)
    try {
      await api.post('/time-logs', { taskId, minutes: Number(minutes), note })
      const { data } = await api.get(`/time-logs/task/${taskId}`)
      setLogs(data.data.logs); setTotal(data.data.totalMinutes)
      setMinutes(''); setNote('')
    } catch (err) { console.error(err) }
    finally { setSaving(false) }
  }

  const fmt = (mins) => {
    const h = Math.floor(mins / 60)
    const m = mins % 60
    return h > 0 ? `${h}h ${m}m` : `${m}m`
  }

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-xs font-semibold text-gray-400 uppercase flex items-center gap-1 hover:text-gray-600 transition-colors"
      >
        Time Tracking {total > 0 && <span className="ml-1 text-brand-600 font-bold">{fmt(total)}</span>}
        <span className="ml-auto">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="mt-2 space-y-3">
          <form onSubmit={log} className="flex gap-2 items-center flex-wrap">
            <input
              type="number"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              placeholder="Minutes"
              min={1}
              max={1440}
              className="border border-gray-200 rounded-lg px-2 py-1 text-sm w-24 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Note (optional)"
              maxLength={200}
              className="border border-gray-200 rounded-lg px-2 py-1 text-sm flex-1 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            <button
              type="submit"
              disabled={saving || !minutes}
              className="bg-brand-600 text-white text-xs px-3 py-1.5 rounded-lg font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors"
            >
              Log
            </button>
          </form>

          {logs.length > 0 && (
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {logs.map((l) => (
                <div key={l._id} className="flex items-center gap-2 text-xs text-gray-500">
                  <span className="font-semibold text-gray-700">{fmt(l.minutes)}</span>
                  <span className="text-gray-400">·</span>
                  <span>{l.userId?.name || l.userId?.phone}</span>
                  {l.note && <><span className="text-gray-400">·</span><span className="truncate">{l.note}</span></>}
                  <span className="ml-auto text-gray-300">{new Date(l.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const TaskDetailModal = ({ taskId, onClose, onUpdated, onDeleted }) => {
  const { user } = useAuth()
  const [members, setMembers] = useState([])
  useEffect(() => {
    api.get('/org/members').then(({ data }) => setMembers(data.data.members)).catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [task, setTask]           = useState(null)
  const [labels, setLabels]       = useState([])
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [comment, setComment]     = useState('')
  const [commentLoading, setCommentLoading] = useState(false)
  const [editTitle, setEditTitle] = useState(false)
  const [editDesc,  setEditDesc]  = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [descDraft,  setDescDraft]  = useState('')
  const titleRef = useRef(null)
  const descRef  = useRef(null)

  useEffect(() => {
    Promise.all([
      api.get(`/tasks/${taskId}`),
      api.get('/labels'),
    ]).then(([taskRes, labelRes]) => {
      setTask(taskRes.data.data.task)
      setTitleDraft(taskRes.data.data.task.title)
      setDescDraft(taskRes.data.data.task.description || '')
      setLabels(labelRes.data.data.labels)
    }).catch(() => onClose())
      .finally(() => setLoading(false))
  }, [taskId])

  useEffect(() => { if (editTitle) titleRef.current?.focus() }, [editTitle])
  useEffect(() => { if (editDesc)  descRef.current?.focus()  }, [editDesc])

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const patch = async (updates) => {
    setSaving(true)
    try {
      let res
      if (updates.status) {
        res = await api.patch(`/tasks/${taskId}/status`, { status: updates.status })
      } else {
        res = await api.patch(`/tasks/${taskId}`, updates)
      }
      const updated = res.data.data.task
      setTask(updated)
      onUpdated?.(updated)
    } catch (err) {
      console.error('Task update failed', err)
    } finally {
      setSaving(false)
    }
  }

  const saveTitle = () => {
    setEditTitle(false)
    if (titleDraft.trim() && titleDraft !== task.title) patch({ title: titleDraft.trim() })
  }

  const saveDesc = () => {
    setEditDesc(false)
    if (descDraft !== task.description) patch({ description: descDraft })
  }

  const toggleLabel = (labelId) => {
    const current = (task.labelIds || []).map((l) => l._id || l)
    const next = current.includes(labelId)
      ? current.filter((id) => id !== labelId)
      : [...current, labelId]
    patch({ labelIds: next })
  }

  const handleDelete = async () => {
    if (!confirm('Delete this task permanently?')) return
    await api.delete(`/tasks/${taskId}`)
    onDeleted?.(taskId)
    onClose()
  }

  const submitComment = async (e) => {
    e.preventDefault()
    if (!comment.trim()) return
    setCommentLoading(true)
    try {
      const { data } = await api.post(`/tasks/${taskId}/comments`, { text: comment.trim() })
      setTask((prev) => ({ ...prev, comments: [...(prev.comments || []), data.data.comment] }))
      setComment('')
    } catch (err) {
      console.error('Comment failed', err)
    } finally {
      setCommentLoading(false)
    }
  }

  const fmtTime = (d) => d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : null

  const taskLabelIds = (task?.labelIds || []).map((l) => l._id || l)

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !task ? null : (
          <>
            {/* Header */}
            <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 flex-shrink-0">
              <div className="flex-1 min-w-0">
                {editTitle ? (
                  <input
                    ref={titleRef}
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    onBlur={saveTitle}
                    onKeyDown={(e) => e.key === 'Enter' && saveTitle()}
                    className="w-full text-lg font-bold text-gray-900 outline-none border-b-2 border-brand-500 bg-transparent"
                  />
                ) : (
                  <h2
                    onClick={() => setEditTitle(true)}
                    className="text-lg font-bold text-gray-900 cursor-text hover:text-brand-700 truncate"
                    title="Click to edit"
                  >
                    {task.title}
                  </h2>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {saving && <span className="text-xs text-gray-400 animate-pulse">Saving…</span>}
                <button onClick={handleDelete} className="text-xs text-red-400 hover:text-red-600 border border-red-200 hover:border-red-400 px-2 py-1 rounded-lg transition-colors">Delete</button>
                <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 text-xl transition-colors">×</button>
              </div>
            </div>

            {/* Body */}
            <div className="flex flex-col lg:flex-row flex-1 min-h-0 overflow-hidden">
              {/* Left */}
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                {/* Status + Priority */}
                <div className="flex flex-wrap gap-4">
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase mb-1.5">Status</p>
                    <div className="flex gap-1.5 flex-wrap">
                      {STATUSES.map((s) => (
                        <button
                          key={s}
                          onClick={() => patch({ status: s })}
                          className={`text-xs px-2.5 py-1 rounded-full font-medium transition-all ${task.status === s ? STATUS_COLOR[s] + ' ring-2 ring-offset-1 ring-gray-300' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                        >
                          {s.replace('_', ' ')}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase mb-1.5">Priority</p>
                    <select
                      value={task.priority}
                      onChange={(e) => patch({ priority: e.target.value })}
                      className={`text-sm border border-gray-200 rounded-lg px-2 py-1 font-semibold bg-white focus:outline-none focus:ring-1 focus:ring-brand-500 ${PRIORITY_COLOR[task.priority]}`}
                    >
                      {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                </div>

                {/* Assignee + Due Date */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase mb-1.5">Assignee</p>
                    <select
                      value={task.assigneeId?._id || task.assigneeId || ''}
                      onChange={(e) => patch({ assigneeId: e.target.value || null })}
                      className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-brand-500 w-full"
                    >
                      <option value="">Unassigned</option>
                      {members.map((m) => (
                        <option key={m._id} value={m._id}>{m.name || m.phone}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase mb-1.5">Due Date</p>
                    <input
                      type="date"
                      value={task.dueDate ? task.dueDate.slice(0, 10) : ''}
                      onChange={(e) => patch({ dueDate: e.target.value || null })}
                      className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-brand-500 w-full"
                    />
                  </div>
                </div>

                {/* Labels */}
                {labels.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase mb-1.5">Labels</p>
                    <div className="flex flex-wrap gap-1.5">
                      {labels.map((label) => {
                        const active = taskLabelIds.includes(label._id)
                        return (
                          <button
                            key={label._id}
                            onClick={() => toggleLabel(label._id)}
                            className={`text-xs px-2.5 py-1 rounded-full font-medium transition-all border ${
                              active ? 'ring-2 ring-offset-1 ring-gray-300' : 'opacity-50 hover:opacity-80'
                            }`}
                            style={{
                              backgroundColor: label.color + (active ? '33' : '11'),
                              color: label.color,
                              borderColor: label.color + '55',
                            }}
                          >
                            {label.name}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Tags */}
                {task.tags?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase mb-1.5">Tags</p>
                    <div className="flex flex-wrap gap-1.5">
                      {task.tags.map((tag) => (
                        <span key={tag} className="bg-gray-100 text-gray-500 text-xs px-2.5 py-1 rounded-full">{tag}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Description */}
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase mb-1.5">Description</p>
                  {editDesc ? (
                    <textarea
                      ref={descRef}
                      value={descDraft}
                      onChange={(e) => setDescDraft(e.target.value)}
                      onBlur={saveDesc}
                      rows={5}
                      className="w-full text-sm text-gray-700 border border-brand-300 rounded-xl p-3 outline-none resize-none focus:ring-2 focus:ring-brand-500"
                    />
                  ) : (
                    <div
                      onClick={() => setEditDesc(true)}
                      className="text-sm text-gray-600 cursor-text hover:bg-gray-50 rounded-xl p-3 min-h-[80px] border border-transparent hover:border-gray-200 transition-colors whitespace-pre-wrap"
                    >
                      {task.description || <span className="text-gray-300 italic">Click to add description…</span>}
                    </div>
                  )}
                </div>

                {/* Time Tracking */}
                <div className="border-t border-gray-100 pt-4">
                  <TimeTracker taskId={taskId} />
                </div>

                {/* Meta */}
                <div className="text-xs text-gray-400 space-y-1 border-t border-gray-100 pt-4">
                  <div>Created by <span className="font-medium text-gray-500">{task.createdBy?.name || task.createdBy?.phone}</span> · {fmtTime(task.createdAt)}</div>
                  {task.updatedAt !== task.createdAt && <div>Updated {fmtTime(task.updatedAt)}</div>}
                  {task.estimatedMinutes && (
                    <div>Estimate: <span className="font-medium text-gray-500">{Math.floor(task.estimatedMinutes / 60)}h {task.estimatedMinutes % 60}m</span></div>
                  )}
                </div>
              </div>

              {/* Right — Comments */}
              <div className="lg:w-72 border-t lg:border-t-0 lg:border-l border-gray-100 flex flex-col flex-shrink-0 min-h-0">
                <div className="px-4 py-3 border-b border-gray-100 flex-shrink-0">
                  <p className="text-xs font-semibold text-gray-500 uppercase">Comments ({task.comments?.length || 0})</p>
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                  {(!task.comments || task.comments.length === 0) ? (
                    <p className="text-xs text-gray-400 text-center py-6">No comments yet</p>
                  ) : (
                    task.comments.map((c) => (
                      <div key={c._id} className="text-sm">
                        <div className="flex items-center gap-1.5 mb-1">
                          <div className="w-5 h-5 bg-brand-100 text-brand-700 rounded-full text-xs flex items-center justify-center font-bold flex-shrink-0">
                            {(c.userId?.name?.[0] || '?').toUpperCase()}
                          </div>
                          <span className="font-medium text-gray-700 text-xs">{c.userId?.name || c.userId?.phone || 'Unknown'}</span>
                          <span className="text-gray-300 text-xs ml-auto">{fmtTime(c.createdAt)}</span>
                        </div>
                        <p className="text-gray-600 text-xs leading-relaxed pl-6">{c.text}</p>
                      </div>
                    ))
                  )}
                </div>

                <form onSubmit={submitComment} className="px-4 py-3 border-t border-gray-100 flex-shrink-0">
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Add a comment…"
                    rows={2}
                    className="w-full text-sm border border-gray-200 rounded-xl p-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-brand-500"
                    onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submitComment(e) }}
                  />
                  <button
                    type="submit"
                    disabled={commentLoading || !comment.trim()}
                    className="mt-2 w-full bg-brand-600 text-white text-xs py-2 rounded-xl font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors"
                  >
                    {commentLoading ? 'Posting…' : 'Post (Ctrl+Enter)'}
                  </button>
                </form>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default TaskDetailModal
