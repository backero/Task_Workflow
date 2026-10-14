import { useState, useEffect, useCallback } from 'react'
import Layout from '../components/Layout'
import api from '../api/axios'
import { useRole } from '../hooks/useRole'

/* ── Constants ─────────────────────────────────────────────────────────────── */

const TABS = ['Overview', 'Create Post', 'Review', 'Leads', 'Engagement', 'Analytics', 'Accounts']

const REPLY_STATES = ['draft', 'escalated', 'approved', 'sent', 'skipped']

const REPLY_STATE_STYLE = {
  draft:     { bg: 'bg-amber-50',  text: 'text-amber-700'  },
  escalated: { bg: 'bg-red-50',    text: 'text-red-700'    },
  approved:  { bg: 'bg-blue-50',   text: 'text-blue-700'   },
  sent:      { bg: 'bg-green-50',  text: 'text-green-700'  },
  skipped:   { bg: 'bg-gray-100',  text: 'text-gray-500'   },
}

const URGENCY_STYLE = {
  high:   'text-red-600',
  medium: 'text-amber-600',
  low:    'text-gray-400',
}

const LEAD_STAGES = ['new', 'nurturing', 'booked', 'won', 'lost']

const STAGE_STYLE = {
  new:       { bg: 'bg-gray-100',   text: 'text-gray-700'   },
  nurturing: { bg: 'bg-blue-50',    text: 'text-blue-700'   },
  booked:    { bg: 'bg-indigo-50',  text: 'text-indigo-700' },
  won:       { bg: 'bg-green-50',   text: 'text-green-700'  },
  lost:      { bg: 'bg-red-50',     text: 'text-red-700'    },
}

const PILLARS = ['product', 'tutorial', 'behind-the-scenes', 'testimonial', 'industry-education']

/* ── Small pieces ──────────────────────────────────────────────────────────── */

const StatCard = ({ label, value, tone = 'gray' }) => {
  const toneClass = {
    gray: 'text-gray-900', red: 'text-red-600', amber: 'text-amber-600',
    green: 'text-green-600', indigo: 'text-indigo-600',
  }[tone]
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${toneClass}`}>{value}</div>
    </div>
  )
}

const ErrorBanner = ({ message, onDismiss }) => !message ? null : (
  <div className="mb-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5 flex items-center justify-between">
    <span>{message}</span>
    {onDismiss && <button onClick={onDismiss} className="text-red-400 hover:text-red-600 ml-3">&times;</button>}
  </div>
)

const EmptyState = ({ children }) => (
  <div className="text-center py-12 text-sm text-gray-500 bg-gray-50 rounded-xl border border-dashed border-gray-200">
    {children}
  </div>
)

/* ── Page ──────────────────────────────────────────────────────────────────── */

export default function Marketing() {
  const { atLeast } = useRole()
  const canApprove = atLeast('MANAGER')
  const [tab, setTab] = useState('Overview')
  const [error, setError] = useState('')

  return (
    <Layout>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Marketing Automation</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Content generation, publishing, engagement AI, and leads — powered by the marketing engine.
          </p>
        </div>
      </div>

      <div className="flex gap-1 mb-5 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <ErrorBanner message={error} onDismiss={() => setError('')} />

      {tab === 'Overview' && <OverviewTab setError={setError} />}
      {tab === 'Create Post' && <CreatePostTab setError={setError} canApprove={canApprove} />}
      {tab === 'Review' && <ReviewTab setError={setError} canApprove={canApprove} />}
      {tab === 'Leads' && <LeadsTab setError={setError} />}
      {tab === 'Engagement' && <EngagementTab setError={setError} />}
      {tab === 'Analytics' && <AnalyticsTab setError={setError} />}
      {tab === 'Accounts' && <AccountsTab setError={setError} />}
    </Layout>
  )
}

/* ── Overview ──────────────────────────────────────────────────────────────── */

function OverviewTab({ setError }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data: res } = await api.get('/marketing/overview')
      setData(res.data)
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to load overview — is the marketing engine reachable?')
    } finally {
      setLoading(false)
    }
  }, [setError])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="text-sm text-gray-500">Loading…</div>
  if (!data) return null

  const costPct = data.cost_budget_total ? Math.round((data.cost_spent_this_month / data.cost_budget_total) * 100) : 0

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <StatCard label="Pending review" value={data.pending_review} tone="amber" />
        <StatCard label="Approved & queued" value={data.approved_queued} tone="indigo" />
        <StatCard label="Failed — needs review" value={data.failed} tone={data.failed ? 'red' : 'gray'} />
        <StatCard label="New leads" value={data.new_leads} tone="green" />
        <StatCard label="Comments needing a human" value={data.comments_needing_human} tone={data.comments_needing_human ? 'red' : 'gray'} />
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-4 max-w-sm">
        <div className="text-xs text-gray-500 mb-1">Cost spent this month</div>
        <div className="text-2xl font-bold text-gray-900">
          ${data.cost_spent_this_month.toFixed(2)}
          <span className="text-sm font-normal text-gray-400"> / ${data.cost_budget_total.toFixed(2)}</span>
        </div>
        <div className="w-full h-1.5 bg-gray-100 rounded-full mt-2 overflow-hidden">
          <div className={`h-full ${costPct > 80 ? 'bg-red-500' : 'bg-indigo-500'}`} style={{ width: `${Math.min(costPct, 100)}%` }} />
        </div>
      </div>
      <button onClick={load} className="mt-4 text-xs text-indigo-600 hover:text-indigo-800">Refresh</button>
    </div>
  )
}

/* ── Create Post ───────────────────────────────────────────────────────────── */

function CreatePostTab({ setError }) {
  const [pillar, setPillar] = useState(PILLARS[0])
  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState(null)

  const generate = async () => {
    setGenerating(true)
    setResult(null)
    try {
      const { data: res } = await api.post('/marketing/posts/generate', { pillar })
      setResult(res.data)
    } catch (e) {
      setError(e.response?.data?.message || 'Content generation failed')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="max-w-lg">
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Content pillar</label>
        <select
          value={pillar}
          onChange={(e) => setPillar(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4"
        >
          {PILLARS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <button
          onClick={generate}
          disabled={generating}
          className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2.5"
        >
          {generating ? 'Generating… (image/video can take a minute)' : 'Generate post'}
        </button>
        {result && (
          <div className="mt-4 rounded-lg bg-green-50 border border-green-200 text-green-800 text-sm px-4 py-3">
            Created post #{result.post_id} — <em>{result.topic}</em>. Check the <strong>Review</strong> tab to approve it.
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Review ────────────────────────────────────────────────────────────────── */

function ReviewTab({ setError, canApprove }) {
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [details, setDetails] = useState({}) // postId -> detail payload
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data: res } = await api.get('/marketing/posts', { params: { state: 'review' } })
      setPosts(res.data.posts)
      const detailEntries = await Promise.all(
        res.data.posts.map(async (p) => {
          try {
            const { data: d } = await api.get(`/marketing/posts/${p.id}`)
            return [p.id, d.data]
          } catch {
            return [p.id, null]
          }
        }),
      )
      setDetails(Object.fromEntries(detailEntries))
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to load posts for review')
    } finally {
      setLoading(false)
    }
  }, [setError])

  useEffect(() => { load() }, [load])

  const act = async (postId, action) => {
    setBusyId(postId)
    try {
      await api.post(`/marketing/posts/${postId}/${action}`)
      await load()
    } catch (e) {
      setError(e.response?.data?.message || `Failed to ${action} post`)
    } finally {
      setBusyId(null)
    }
  }

  const useVariant = async (postId, variantId) => {
    setBusyId(postId)
    try {
      await api.post(`/marketing/posts/${postId}/use-variant`, { variantId })
      await load()
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to switch variant')
    } finally {
      setBusyId(null)
    }
  }

  if (loading) return <div className="text-sm text-gray-500">Loading…</div>
  if (!posts.length) return <EmptyState>Nothing pending review. Generate a post from the <strong>Create Post</strong> tab.</EmptyState>

  return (
    <div className="space-y-4">
      {posts.map((p) => {
        const detail = details[p.id]
        const busy = busyId === p.id
        return (
          <div key={p.id} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="text-xs uppercase tracking-wide text-gray-400 font-medium">{p.pillar}</div>
                <div className="font-semibold text-gray-900 mb-2">{detail?.topic || '…'}</div>
                {detail && (
                  <p className="text-sm text-gray-600 whitespace-pre-wrap">{detail.caption}</p>
                )}
                {detail?.hashtags?.length > 0 && (
                  <div className="text-xs text-indigo-500 mt-1">{detail.hashtags.join(' ')}</div>
                )}

                {detail?.variants?.length > 1 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {detail.variants.map((v) => (
                      <button
                        key={v.id}
                        onClick={() => useVariant(p.id, v.id)}
                        disabled={busy}
                        title={v.caption}
                        className={`text-xs px-2.5 py-1 rounded-full border ${
                          v.caption === detail.caption
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white text-gray-600 border-gray-300 hover:border-indigo-400'
                        }`}
                      >
                        Variant {v.label}
                      </button>
                    ))}
                  </div>
                )}

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {detail?.publications?.map((pub) => (
                    <span key={pub.platform} className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                      {pub.platform}
                    </span>
                  ))}
                </div>
              </div>

              {(detail?.image_url || detail?.video_url) && (
                <img
                  src={detail.image_url || ''}
                  alt=""
                  className="w-28 h-28 object-cover rounded-lg border border-gray-200 flex-shrink-0"
                  onError={(e) => { e.target.style.display = 'none' }}
                />
              )}
            </div>

            <div className="mt-4 flex gap-2">
              {canApprove ? (
                <>
                  <button
                    onClick={() => act(p.id, 'approve')}
                    disabled={busy}
                    className="px-3 py-1.5 text-sm font-medium rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => act(p.id, 'reject')}
                    disabled={busy}
                    className="px-3 py-1.5 text-sm font-medium rounded-lg bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-50 text-gray-700"
                  >
                    Reject
                  </button>
                </>
              ) : (
                <span className="text-xs text-gray-400">🔒 Approve/reject requires Manager or above.</span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ── Leads ─────────────────────────────────────────────────────────────────── */

function LeadsTab({ setError }) {
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data: res } = await api.get('/marketing/leads')
      setLeads(res.data.leads)
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to load leads')
    } finally {
      setLoading(false)
    }
  }, [setError])

  useEffect(() => { load() }, [load])

  const changeStage = async (leadId, stage) => {
    setSavingId(leadId)
    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, stage } : l)))
    try {
      await api.patch(`/marketing/leads/${leadId}`, { stage })
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to update lead stage')
      load()
    } finally {
      setSavingId(null)
    }
  }

  if (loading) return <div className="text-sm text-gray-500">Loading…</div>
  if (!leads.length) return <EmptyState>No leads captured yet from marketing engagement.</EmptyState>

  const wonCount = leads.filter((l) => l.stage === 'won').length

  return (
    <div>
      <div className="text-sm text-gray-500 mb-3">
        {wonCount} of {leads.length} leads won ({leads.length ? Math.round((wonCount / leads.length) * 100) : 0}%)
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Source</th>
              <th className="text-left px-4 py-2 font-medium">Handle</th>
              <th className="text-left px-4 py-2 font-medium">Email</th>
              <th className="text-left px-4 py-2 font-medium">Stage</th>
              <th className="text-left px-4 py-2 font-medium">HubSpot</th>
              <th className="text-left px-4 py-2 font-medium">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {leads.map((l) => {
              const s = STAGE_STYLE[l.stage] || STAGE_STYLE.new
              return (
                <tr key={l.id}>
                  <td className="px-4 py-2 text-gray-600">{l.source}</td>
                  <td className="px-4 py-2 text-gray-900">{l.handle || '—'}</td>
                  <td className="px-4 py-2 text-gray-600">{l.email || '—'}</td>
                  <td className="px-4 py-2">
                    <select
                      value={l.stage}
                      disabled={savingId === l.id}
                      onChange={(e) => changeStage(l.id, e.target.value)}
                      className={`text-xs rounded-full px-2 py-1 border-0 font-medium ${s.bg} ${s.text}`}
                    >
                      {LEAD_STAGES.map((st) => <option key={st} value={st}>{st}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-400">
                    {l.hubspot_contact_id ? '✅ synced' : (l.email ? 'not synced' : 'no email')}
                  </td>
                  <td className="px-4 py-2 text-gray-400 text-xs">
                    {l.created_at ? new Date(l.created_at).toLocaleDateString() : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ── Engagement ────────────────────────────────────────────────────────────── */

function EngagementTab({ setError }) {
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('draft')
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data: res } = await api.get('/marketing/comments', { params: { replyState: filter } })
      setComments(res.data.comments)
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to load comments')
    } finally {
      setLoading(false)
    }
  }, [setError, filter])

  useEffect(() => { load() }, [load])

  const act = async (commentId, action) => {
    setBusyId(commentId)
    try {
      await api.post(`/marketing/comments/${commentId}/${action}`)
      await load()
    } catch (e) {
      setError(e.response?.data?.message || `Failed to ${action} comment`)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      <div className="flex gap-1.5 mb-4">
        {REPLY_STATES.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`text-xs px-2.5 py-1 rounded-full border ${
              filter === s ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-300 hover:border-indigo-400'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-sm text-gray-500">Loading…</div>
      ) : !comments.length ? (
        <EmptyState>No {filter} comments right now.</EmptyState>
      ) : (
        <div className="space-y-3">
          {comments.map((c) => {
            const busy = busyId === c.id
            return (
              <div key={c.id} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs uppercase tracking-wide text-gray-400 font-medium">{c.platform}</span>
                      <span className="text-sm font-semibold text-gray-900">{c.author}</span>
                      <span className={`text-xs font-medium ${URGENCY_STYLE[c.urgency] || 'text-gray-400'}`}>
                        {c.urgency} urgency
                      </span>
                    </div>
                    <p className="text-sm text-gray-700">{c.text}</p>
                    {c.risk_reason && (
                      <div className="text-xs text-red-500 mt-1">⚠ {c.risk_reason}</div>
                    )}
                    {c.reply_draft && (
                      <div className="mt-2 text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2 whitespace-pre-wrap">
                        {c.reply_draft}
                      </div>
                    )}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${(REPLY_STATE_STYLE[c.reply_state] || REPLY_STATE_STYLE.draft).bg} ${(REPLY_STATE_STYLE[c.reply_state] || REPLY_STATE_STYLE.draft).text}`}>
                    {c.reply_state}
                  </span>
                </div>
                {(c.reply_state === 'draft' || c.reply_state === 'escalated') && (
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => act(c.id, 'approve')}
                      disabled={busy}
                      className="px-3 py-1.5 text-sm font-medium rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => act(c.id, 'skip')}
                      disabled={busy}
                      className="px-3 py-1.5 text-sm font-medium rounded-lg bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-50 text-gray-700"
                    >
                      Skip
                    </button>
                    {c.is_lead && (
                      <button
                        onClick={() => act(c.id, 'trigger-manychat')}
                        disabled={busy}
                        className="px-3 py-1.5 text-sm font-medium rounded-lg bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50 text-indigo-700"
                      >
                        Send DM flow
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ── Analytics ─────────────────────────────────────────────────────────────── */

function AnalyticsTab({ setError }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data: res } = await api.get('/marketing/analytics/summary')
      setData(res.data)
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to load analytics')
    } finally {
      setLoading(false)
    }
  }, [setError])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="text-sm text-gray-500">Loading…</div>
  if (!data) return null

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Impressions" value={data.totals.impressions.toLocaleString()} />
        <StatCard label="Reach" value={data.totals.reach.toLocaleString()} tone="indigo" />
        <StatCard label="Likes" value={data.totals.likes.toLocaleString()} tone="green" />
        <StatCard label="Comments" value={data.totals.comments.toLocaleString()} />
        <StatCard label="Shares" value={data.totals.shares.toLocaleString()} />
        <StatCard label="Saves" value={data.totals.saves.toLocaleString()} />
        <StatCard label="Video views" value={data.totals.video_views.toLocaleString()} tone="indigo" />
      </div>

      <h2 className="text-sm font-semibold text-gray-900 mb-2">By platform</h2>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Platform</th>
              <th className="text-right px-4 py-2 font-medium">Impressions</th>
              <th className="text-right px-4 py-2 font-medium">Reach</th>
              <th className="text-right px-4 py-2 font-medium">Likes</th>
              <th className="text-right px-4 py-2 font-medium">Comments</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.by_platform.map((p) => (
              <tr key={p.platform}>
                <td className="px-4 py-2 text-gray-900 capitalize">{p.platform}</td>
                <td className="px-4 py-2 text-right text-gray-600">{p.impressions.toLocaleString()}</td>
                <td className="px-4 py-2 text-right text-gray-600">{p.reach.toLocaleString()}</td>
                <td className="px-4 py-2 text-right text-gray-600">{p.likes.toLocaleString()}</td>
                <td className="px-4 py-2 text-right text-gray-600">{p.comments.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="text-sm font-semibold text-gray-900 mb-2">Top posts by engagement</h2>
      {!data.top_posts.length ? (
        <EmptyState>No published posts with metrics yet.</EmptyState>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {data.top_posts.map((p) => (
            <div key={p.post_id} className="px-4 py-3 flex items-center justify-between">
              <div>
                <span className="text-xs uppercase tracking-wide text-gray-400 font-medium mr-2">{p.pillar}</span>
                <span className="text-sm text-gray-900">{p.topic}</span>
              </div>
              <span className="text-sm font-semibold text-indigo-600">{p.engagement.toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Accounts ──────────────────────────────────────────────────────────────── */

function AccountsTab({ setError }) {
  const [accounts, setAccounts] = useState([])
  const [activity, setActivity] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [accRes, actRes] = await Promise.all([
        api.get('/marketing/accounts'),
        api.get('/marketing/accounts/activity'),
      ])
      setAccounts(accRes.data.data.accounts)
      setActivity(actRes.data.data.activity)
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to load account health')
    } finally {
      setLoading(false)
    }
  }, [setError])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="text-sm text-gray-500">Loading…</div>

  const activityByPlatform = Object.fromEntries(activity.map((a) => [a.platform, a]))

  return (
    <div className="space-y-3">
      {accounts.map((a) => {
        const act = activityByPlatform[a.platform]
        return (
          <div key={a.platform} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900 capitalize">{a.platform}</span>
                  {!a.configured ? (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">not configured</span>
                  ) : a.ok ? (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700">connected</span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-700">error</span>
                  )}
                  {act?.stale && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">gone quiet</span>
                  )}
                  {act?.reach_dropped && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-700">reach dropped</span>
                  )}
                </div>
                <div className="text-sm text-gray-500 mt-0.5">
                  {a.error || a.detail || (a.configured ? '' : 'Add credentials to connect this platform.')}
                </div>
                {a.handle && (
                  <div className="text-xs text-gray-400 mt-1">
                    {a.handle}{a.followers != null ? ` — ${a.followers.toLocaleString()} followers` : ''}
                  </div>
                )}
              </div>
              {a.followers != null && (
                <div className="text-2xl font-bold text-gray-900 flex-shrink-0">{a.followers.toLocaleString()}</div>
              )}
            </div>
          </div>
        )
      })}
      {!accounts.length && <EmptyState>No platforms configured yet.</EmptyState>}
    </div>
  )
}
