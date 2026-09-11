import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  SparklesIcon, UserGroupIcon, ChatBubbleLeftRightIcon, ChartBarIcon,
  SignalIcon, CheckIcon, XMarkIcon, PaperAirplaneIcon,
  MegaphoneIcon, CalendarDaysIcon, EyeIcon, Cog6ToothIcon,
} from '@heroicons/react/24/outline';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import { useAuthStore } from '../../store/useAuthStore';

const TABS = [
  { key: 'overview',    label: 'Overview',    icon: SparklesIcon },
  { key: 'create',      label: 'Create Post', icon: SparklesIcon },
  { key: 'leads',       label: 'Leads',       icon: UserGroupIcon },
  { key: 'engagement',  label: 'Engagement',  icon: ChatBubbleLeftRightIcon },
  { key: 'analytics',   label: 'Analytics',   icon: ChartBarIcon },
  { key: 'accounts',    label: 'Accounts',    icon: SignalIcon },
  { key: 'ads',         label: 'Ads',         icon: MegaphoneIcon },
  { key: 'festivals',   label: 'Festivals',   icon: CalendarDaysIcon },
  { key: 'competitors', label: 'Competitors', icon: EyeIcon },
  { key: 'settings',    label: 'Settings',    icon: Cog6ToothIcon },
];

const PILLARS = ['product', 'tutorial', 'behind-the-scenes', 'testimonial', 'industry-education'];

const PLATFORM_OPTIONS = [
  { value: 'instagram_feed', label: 'Instagram Feed' },
  { value: 'instagram_reels', label: 'Instagram Reels' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'linkedin', label: 'LinkedIn' },
];

const LEAD_STAGES = ['new', 'nurturing', 'booked', 'won', 'lost'];
const STAGE_BADGE = { new: 'badge-gray', nurturing: 'badge-blue', booked: 'badge-purple', won: 'badge-green', lost: 'badge-red' };

const REPLY_STATES = ['draft', 'escalated', 'approved', 'sent', 'skipped'];
const REPLY_STATE_BADGE = { draft: 'badge-amber', escalated: 'badge-red', approved: 'badge-blue', sent: 'badge-green', skipped: 'badge-gray' };
const URGENCY_BADGE = { high: 'badge-red', medium: 'badge-amber', low: 'badge-gray' };

export default function SocialAutomation() {
  const [tab, setTab] = useState('overview');

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Social Automation</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--t-sub)' }}>
            Content generation, leads, engagement AI, and analytics — powered by the marketing engine. Looking to
            approve a post? That's under <span className="font-semibold">Social Approvals</span>.
          </p>
        </div>
      </div>

      <div className="flex gap-1 border-b" style={{ borderColor: 'rgba(15,23,42,0.08)' }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={clsx('px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px flex items-center gap-1.5',
              tab === t.key ? 'border-brand-600 text-brand-600' : 'border-transparent hover:opacity-80')}
            style={tab !== t.key ? { color: 'var(--t-sub)' } : undefined}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab />}
      {tab === 'create' && <CreateTab />}
      {tab === 'leads' && <LeadsTab />}
      {tab === 'engagement' && <EngagementTab />}
      {tab === 'analytics' && <AnalyticsTab />}
      {tab === 'accounts' && <AccountsTab />}
      {tab === 'ads' && <AdsTab />}
      {tab === 'festivals' && <FestivalsTab />}
      {tab === 'competitors' && <CompetitorsTab />}
      {tab === 'settings' && <SettingsTab />}
    </div>
  );
}

/* ── Small pieces ─────────────────────────────────────────────────────────── */

function StatCard({ label, value, badge }) {
  return (
    <div className="stat-card">
      <div>
        <div className="text-xs mb-1" style={{ color: 'var(--t-muted)' }}>{label}</div>
        <div className="text-2xl font-bold" style={{ color: 'var(--t-primary)' }}>{value}</div>
        {badge && <span className={clsx('badge mt-1', badge)}>{badge.replace('badge-', '')}</span>}
      </div>
    </div>
  );
}

function Loading() {
  return <p className="text-sm py-8 text-center" style={{ color: 'var(--t-muted)' }}>Loading…</p>;
}

function Empty({ children }) {
  return (
    <div className="empty-state">
      <p className="text-sm" style={{ color: 'var(--t-muted)' }}>{children}</p>
    </div>
  );
}

/* ── Overview ─────────────────────────────────────────────────────────────── */

function OverviewTab() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['social-engine-overview'],
    queryFn: () => api.get('/social-engine/overview').then((r) => r.data.data),
  });

  if (isLoading) return <Loading />;
  if (error) return <Empty>Failed to load overview — is the marketing engine reachable?</Empty>;

  const costPct = data.cost_budget_total ? Math.round((data.cost_spent_this_month / data.cost_budget_total) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="Pending review" value={data.pending_review} />
        <StatCard label="Approved & queued" value={data.approved_queued} />
        <StatCard label="Failed — needs review" value={data.failed} />
        <StatCard label="New leads" value={data.new_leads} />
        <StatCard label="Comments needing a human" value={data.comments_needing_human} />
      </div>
      <div className="card p-4 max-w-sm">
        <div className="text-xs mb-1" style={{ color: 'var(--t-muted)' }}>Cost spent this month</div>
        <div className="text-2xl font-bold" style={{ color: 'var(--t-primary)' }}>
          ${data.cost_spent_this_month.toFixed(2)}
          <span className="text-sm font-normal" style={{ color: 'var(--t-muted)' }}> / ${data.cost_budget_total.toFixed(2)}</span>
        </div>
        <div className="w-full h-1.5 rounded-full mt-2 overflow-hidden" style={{ background: 'var(--zone-bg, #f1f5f9)' }}>
          <div className={clsx('h-full', costPct > 80 ? 'bg-red-500' : 'bg-emerald-500')} style={{ width: `${Math.min(costPct, 100)}%` }} />
        </div>
      </div>
    </div>
  );
}

/* ── Create Post ──────────────────────────────────────────────────────────── */

function CreateTab() {
  return (
    <div className="max-w-lg space-y-8">
      <GenerateSection />
      <div className="divider" />
      <VideoIngestSection />
      <div className="divider" />
      <ManualPostSection />
    </div>
  );
}

function SuccessBanner({ children }) {
  return (
    <div className="rounded-lg px-4 py-3 text-sm" style={{ background: 'rgba(16,185,129,0.08)', color: '#059669', border: '1px solid rgba(16,185,129,0.2)' }}>
      {children}
    </div>
  );
}

function GenerateSection() {
  const [pillar, setPillar] = useState(PILLARS[0]);
  const [result, setResult] = useState(null);

  const generateMutation = useMutation({
    mutationFn: () => api.post('/social-engine/posts/generate', { pillar }),
    onSuccess: (res) => { setResult(res.data.data); toast.success('Post generated — sent for approval'); },
    onError: (err) => toast.error(err.response?.data?.message || 'Content generation failed'),
  });

  return (
    <div className="card p-5 space-y-4">
      <h3 className="section-title">Generate with AI</h3>
      <div>
        <label className="label">Content pillar</label>
        <select value={pillar} onChange={(e) => setPillar(e.target.value)} className="input">
          {PILLARS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>
      <button
        onClick={() => { setResult(null); generateMutation.mutate(); }}
        disabled={generateMutation.isPending}
        className="btn-primary w-full justify-center"
      >
        <SparklesIcon className="w-4 h-4" />
        {generateMutation.isPending ? 'Generating… (image/video can take a minute)' : 'Generate post'}
      </button>
      {result && (
        <SuccessBanner>
          Created post #{result.post_id} — <em>{result.topic}</em>. It's been sent to <strong>Social Approvals</strong> for review.
        </SuccessBanner>
      )}
    </div>
  );
}

function VideoIngestSection() {
  const [file, setFile] = useState(null);
  const [pillar, setPillar] = useState('uploaded');
  const [autoEdit, setAutoEdit] = useState(true);
  const [result, setResult] = useState(null);

  const ingestMutation = useMutation({
    mutationFn: () => {
      const form = new FormData();
      form.append('video', file);
      form.append('pillar', pillar || 'uploaded');
      form.append('autoEdit', String(autoEdit));
      return api.post('/social-engine/video/ingest', form);
    },
    onSuccess: (res) => { setResult(res.data.data); toast.success('Video analyzed and queued'); setFile(null); },
    onError: (err) => toast.error(err.response?.data?.message || 'Video ingest failed'),
  });

  return (
    <div className="card p-5 space-y-4">
      <h3 className="section-title">Auto-analyze a raw video</h3>
      <p className="text-sm" style={{ color: 'var(--t-sub)' }}>
        Upload a raw video and the pipeline transcribes it, writes the caption/hashtags from what's said,
        auto-edits it (trim, 9:16 crop, captions, music), picks fitting platforms, and schedules it. Lands in
        <strong> Social Approvals</strong> — nothing publishes without approval.
      </p>
      <div>
        <label className="label">Raw video (mp4, mov)</label>
        <input type="file" accept="video/mp4,video/quicktime" onChange={(e) => setFile(e.target.files?.[0] || null)} className="input" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Pillar</label>
          <input className="input" value={pillar} onChange={(e) => setPillar(e.target.value)} />
        </div>
        <div className="flex items-center gap-2 mt-5">
          <input type="checkbox" id="auto-edit" checked={autoEdit} onChange={(e) => setAutoEdit(e.target.checked)} />
          <label htmlFor="auto-edit" className="text-sm" style={{ color: 'var(--t-sub)' }}>Run auto-edit pass</label>
        </div>
      </div>
      <button
        onClick={() => { setResult(null); ingestMutation.mutate(); }}
        disabled={!file || ingestMutation.isPending}
        className="btn-primary w-full justify-center"
      >
        {ingestMutation.isPending ? 'Analyzing… (can take a few minutes)' : 'Analyze & queue for review'}
      </button>
      {result && (
        <SuccessBanner>
          ✅ Post #{result.post_id} created — fits {result.platforms.join(', ') || 'no platform'}, transcript via {result.transcript_source}.
        </SuccessBanner>
      )}
    </div>
  );
}

function ManualPostSection() {
  const [file, setFile] = useState(null);
  const [pillar, setPillar] = useState('manual');
  const [topic, setTopic] = useState('');
  const [caption, setCaption] = useState('');
  const [hashtagsRaw, setHashtagsRaw] = useState('');
  const [platforms, setPlatforms] = useState([]);
  const [publishNow, setPublishNow] = useState(true);
  const [scheduledAt, setScheduledAt] = useState('');
  const [sendForReview, setSendForReview] = useState(true);
  const [result, setResult] = useState(null);

  const togglePlatform = (p) => setPlatforms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));

  const saveMutation = useMutation({
    mutationFn: () => {
      const form = new FormData();
      form.append('media', file);
      form.append('pillar', pillar || 'manual');
      form.append('topic', topic);
      form.append('caption', caption);
      form.append('hashtagsRaw', hashtagsRaw);
      form.append('platforms', platforms.join(','));
      form.append('publishNow', String(publishNow));
      form.append('scheduledAt', publishNow ? '' : scheduledAt);
      form.append('sendForReview', String(sendForReview));
      return api.post('/social-engine/posts/manual', form);
    },
    onSuccess: (res) => {
      setResult(res.data.data);
      toast.success('Post saved');
      setFile(null); setTopic(''); setCaption(''); setHashtagsRaw(''); setPlatforms([]);
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to save post'),
  });

  const canSave = file && caption.trim() && platforms.length > 0 && (publishNow || scheduledAt);

  return (
    <div className="card p-5 space-y-4">
      <h3 className="section-title">Create & schedule a post manually</h3>
      <div>
        <label className="label">Media (image or video)</label>
        <input type="file" accept="image/*,video/*" onChange={(e) => setFile(e.target.files?.[0] || null)} className="input" />
      </div>
      <div>
        <label className="label">Pillar</label>
        <input className="input" value={pillar} onChange={(e) => setPillar(e.target.value)} placeholder="e.g. product, tips" />
      </div>
      <div>
        <label className="label">Topic</label>
        <input className="input" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. 5 mistakes beginners make" />
      </div>
      <div>
        <label className="label">Caption</label>
        <textarea className="input" rows={4} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Write your caption..." />
      </div>
      <div>
        <label className="label">Hashtags</label>
        <input className="input" value={hashtagsRaw} onChange={(e) => setHashtagsRaw(e.target.value)} placeholder="#growth #smallbiz" />
      </div>
      <div>
        <label className="label">Publish to</label>
        <div className="flex flex-wrap gap-2">
          {PLATFORM_OPTIONS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => togglePlatform(p.value)}
              className={clsx('badge cursor-pointer', platforms.includes(p.value) ? 'badge-blue' : 'badge-gray')}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input type="checkbox" id="publish-now" checked={publishNow} onChange={(e) => setPublishNow(e.target.checked)} />
        <label htmlFor="publish-now" className="text-sm" style={{ color: 'var(--t-sub)' }}>Publish ASAP</label>
      </div>
      {!publishNow && (
        <div>
          <label className="label">Scheduled time</label>
          <input type="datetime-local" className="input" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
        </div>
      )}
      <div className="flex items-center gap-2">
        <input type="checkbox" id="send-for-review" checked={sendForReview} onChange={(e) => setSendForReview(e.target.checked)} />
        <label htmlFor="send-for-review" className="text-sm" style={{ color: 'var(--t-sub)' }}>Send for review first (recommended)</label>
      </div>
      <button onClick={() => { setResult(null); saveMutation.mutate(); }} disabled={!canSave || saveMutation.isPending} className="btn-primary w-full justify-center">
        {saveMutation.isPending ? 'Saving…' : 'Save post'}
      </button>
      {result && (
        <SuccessBanner>Post #{result.post_id} saved as {result.state === 'review' ? 'review' : 'approved & scheduled'}.</SuccessBanner>
      )}
    </div>
  );
}

/* ── Leads ────────────────────────────────────────────────────────────────── */

function LeadsTab() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['social-engine-leads'],
    queryFn: () => api.get('/social-engine/leads').then((r) => r.data.data.leads),
  });

  const stageMutation = useMutation({
    mutationFn: ({ id, stage }) => api.patch(`/social-engine/leads/${id}`, { stage }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['social-engine-leads'] }),
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to update lead stage'),
  });

  if (isLoading) return <Loading />;
  if (error) return <Empty>Failed to load leads.</Empty>;
  if (!data?.length) return <Empty>No leads captured yet from marketing engagement.</Empty>;

  const wonCount = data.filter((l) => l.stage === 'won').length;

  return (
    <div>
      <div className="text-sm mb-3" style={{ color: 'var(--t-sub)' }}>
        {wonCount} of {data.length} leads won ({data.length ? Math.round((wonCount / data.length) * 100) : 0}%)
      </div>
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Source</th><th>Handle</th><th>Email</th><th>Stage</th><th>HubSpot</th><th>Created</th>
            </tr>
          </thead>
          <tbody>
            {data.map((l) => (
              <tr key={l.id}>
                <td>{l.source}</td>
                <td className="font-medium" style={{ color: 'var(--t-primary)' }}>{l.handle || '—'}</td>
                <td>{l.email || '—'}</td>
                <td>
                  <select
                    value={l.stage}
                    disabled={stageMutation.isPending}
                    onChange={(e) => stageMutation.mutate({ id: l.id, stage: e.target.value })}
                    className={clsx('badge border-0', STAGE_BADGE[l.stage] || 'badge-gray')}
                  >
                    {LEAD_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
                <td className="text-xs">{l.hubspot_contact_id ? '✅ synced' : (l.email ? 'not synced' : 'no email')}</td>
                <td className="text-xs">{l.created_at ? new Date(l.created_at).toLocaleDateString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Engagement ───────────────────────────────────────────────────────────── */

function EngagementTab() {
  const [filter, setFilter] = useState('draft');
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['social-engine-comments', filter],
    queryFn: () => api.get('/social-engine/comments', { params: { replyState: filter } }).then((r) => r.data.data.comments),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['social-engine-comments'] });

  const approveMutation = useMutation({
    mutationFn: (id) => api.post(`/social-engine/comments/${id}/approve`),
    onSuccess: () => { invalidate(); toast.success('Approved'); },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to approve'),
  });
  const skipMutation = useMutation({
    mutationFn: (id) => api.post(`/social-engine/comments/${id}/skip`),
    onSuccess: () => { invalidate(); toast.success('Skipped'); },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to skip'),
  });
  const dmMutation = useMutation({
    mutationFn: (id) => api.post(`/social-engine/comments/${id}/trigger-manychat`),
    onSuccess: () => { invalidate(); toast.success('DM flow triggered'); },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to trigger DM flow'),
  });

  const busy = approveMutation.isPending || skipMutation.isPending || dmMutation.isPending;

  return (
    <div>
      <div className="flex gap-1.5 mb-4">
        {REPLY_STATES.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={clsx('badge cursor-pointer', filter === s ? 'badge-blue' : 'badge-gray')}
          >
            {s}
          </button>
        ))}
      </div>

      {isLoading ? <Loading /> : !data?.length ? <Empty>No {filter} comments right now.</Empty> : (
        <div className="space-y-3">
          {data.map((c) => (
            <div key={c.id} className="card p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="badge badge-gray uppercase">{c.platform}</span>
                    <span className="text-sm font-semibold" style={{ color: 'var(--t-primary)' }}>{c.author}</span>
                    <span className={clsx('badge', URGENCY_BADGE[c.urgency] || 'badge-gray')}>{c.urgency}</span>
                  </div>
                  <p className="text-sm" style={{ color: 'var(--t-sub)' }}>{c.text}</p>
                  {c.risk_reason && <div className="text-xs mt-1 text-red-600">⚠ {c.risk_reason}</div>}
                  {c.reply_draft && (
                    <div className="mt-2 text-sm rounded-lg px-3 py-2 whitespace-pre-wrap" style={{ background: 'var(--zone-bg, #f8fafc)', color: 'var(--t-sub)' }}>
                      {c.reply_draft}
                    </div>
                  )}
                </div>
                <span className={clsx('badge flex-shrink-0', REPLY_STATE_BADGE[c.reply_state] || 'badge-gray')}>{c.reply_state}</span>
              </div>
              {(c.reply_state === 'draft' || c.reply_state === 'escalated') && (
                <div className="mt-3 flex gap-2">
                  <button onClick={() => approveMutation.mutate(c.id)} disabled={busy} className="btn-primary">
                    <CheckIcon className="w-4 h-4" />Approve
                  </button>
                  <button onClick={() => skipMutation.mutate(c.id)} disabled={busy} className="btn-secondary">
                    <XMarkIcon className="w-4 h-4" />Skip
                  </button>
                  {c.is_lead && (
                    <button onClick={() => dmMutation.mutate(c.id)} disabled={busy} className="btn-secondary">
                      <PaperAirplaneIcon className="w-4 h-4" />Send DM flow
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Analytics ────────────────────────────────────────────────────────────── */

function AnalyticsTab() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['social-engine-analytics'],
    queryFn: () => api.get('/social-engine/analytics/summary').then((r) => r.data.data),
  });

  if (isLoading) return <Loading />;
  if (error) return <Empty>Failed to load analytics.</Empty>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Impressions" value={data.totals.impressions.toLocaleString()} />
        <StatCard label="Reach" value={data.totals.reach.toLocaleString()} />
        <StatCard label="Likes" value={data.totals.likes.toLocaleString()} />
        <StatCard label="Comments" value={data.totals.comments.toLocaleString()} />
        <StatCard label="Shares" value={data.totals.shares.toLocaleString()} />
        <StatCard label="Saves" value={data.totals.saves.toLocaleString()} />
        <StatCard label="Video views" value={data.totals.video_views.toLocaleString()} />
      </div>

      <div>
        <h2 className="section-title">By platform</h2>
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr><th>Platform</th><th>Impressions</th><th>Reach</th><th>Likes</th><th>Comments</th></tr>
            </thead>
            <tbody>
              {data.by_platform.map((p) => (
                <tr key={p.platform}>
                  <td className="font-medium capitalize" style={{ color: 'var(--t-primary)' }}>{p.platform}</td>
                  <td>{p.impressions.toLocaleString()}</td>
                  <td>{p.reach.toLocaleString()}</td>
                  <td>{p.likes.toLocaleString()}</td>
                  <td>{p.comments.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h2 className="section-title">Top posts by engagement</h2>
        {!data.top_posts.length ? <Empty>No published posts with metrics yet.</Empty> : (
          <div className="card divide-y" style={{ borderColor: 'rgba(15,23,42,0.06)' }}>
            {data.top_posts.map((p) => (
              <div key={p.post_id} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <span className="badge badge-gray uppercase mr-2">{p.pillar}</span>
                  <span className="text-sm" style={{ color: 'var(--t-primary)' }}>{p.topic}</span>
                </div>
                <span className="text-sm font-semibold" style={{ color: '#059669' }}>{p.engagement.toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Accounts ─────────────────────────────────────────────────────────────── */

function AccountsTab() {
  const { data: accountsData, isLoading: loadingAccounts } = useQuery({
    queryKey: ['social-engine-accounts'],
    queryFn: () => api.get('/social-engine/accounts').then((r) => r.data.data.accounts),
  });
  const { data: activityData } = useQuery({
    queryKey: ['social-engine-accounts-activity'],
    queryFn: () => api.get('/social-engine/accounts/activity').then((r) => r.data.data.activity),
  });

  if (loadingAccounts) return <Loading />;
  if (!accountsData?.length) return <Empty>No platforms configured yet.</Empty>;

  const activityByPlatform = Object.fromEntries((activityData || []).map((a) => [a.platform, a]));

  return (
    <div className="space-y-3">
      {accountsData.map((a) => {
        const act = activityByPlatform[a.platform];
        return (
          <div key={a.platform} className="card p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold capitalize" style={{ color: 'var(--t-primary)' }}>{a.platform}</span>
                  {!a.configured ? (
                    <span className="badge badge-gray">not configured</span>
                  ) : a.ok ? (
                    <span className="badge badge-green">connected</span>
                  ) : (
                    <span className="badge badge-red">error</span>
                  )}
                  {act?.stale && <span className="badge badge-amber">gone quiet</span>}
                  {act?.reach_dropped && <span className="badge badge-red">reach dropped</span>}
                </div>
                <div className="text-sm mt-0.5" style={{ color: 'var(--t-sub)' }}>
                  {a.error || a.detail || (a.configured ? '' : 'Add credentials to connect this platform.')}
                </div>
                {a.handle && (
                  <div className="text-xs mt-1" style={{ color: 'var(--t-muted)' }}>
                    {a.handle}{a.followers != null ? ` — ${a.followers.toLocaleString()} followers` : ''}
                  </div>
                )}
              </div>
              {a.followers != null && (
                <div className="text-2xl font-bold flex-shrink-0" style={{ color: 'var(--t-primary)' }}>{a.followers.toLocaleString()}</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Ads ──────────────────────────────────────────────────────────────────── */

function AdsTab() {
  const { isAdminOrAbove } = useAuthStore();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['social-engine-ads'],
    queryFn: () => api.get('/social-engine/ads/suggestions', { params: { status: 'new' } }).then((r) => r.data.data.suggestions),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['social-engine-ads'] });

  const scanMutation = useMutation({
    mutationFn: () => api.post('/social-engine/ads/scan'),
    onSuccess: (res) => { invalidate(); toast.success(`Created ${res.data.data.created} new suggestion(s)`); },
    onError: (err) => toast.error(err.response?.data?.message || 'Scan failed'),
  });
  const draftMutation = useMutation({
    mutationFn: (id) => api.post(`/social-engine/ads/suggestions/${id}/create-draft-campaign`),
    onSuccess: (res) => {
      invalidate();
      const d = res.data.data;
      if (d.ok) toast.success(`Draft campaign created (PAUSED) — id ${d.campaign_id}`);
      else toast.error(d.error || 'Failed to create draft campaign');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to create draft campaign'),
  });
  const reviewedMutation = useMutation({
    mutationFn: (id) => api.post(`/social-engine/ads/suggestions/${id}/mark-reviewed`),
    onSuccess: invalidate,
  });
  const dismissMutation = useMutation({
    mutationFn: (id) => api.post(`/social-engine/ads/suggestions/${id}/dismiss`),
    onSuccess: invalidate,
  });

  const busy = scanMutation.isPending || draftMutation.isPending || reviewedMutation.isPending || dismissMutation.isPending;

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <p className="text-sm mb-3" style={{ color: 'var(--t-sub)' }}>
          Organic posts that out-performed this account's own baseline get an LLM-drafted ad brief. This is a
          suggestion only — nothing here ever spends money automatically. Creating a draft campaign only ever
          creates a <strong>PAUSED</strong> campaign in Meta Ads Manager, for you to review and launch by hand.
        </p>
        <button onClick={() => scanMutation.mutate()} disabled={busy} className="btn-secondary">
          Scan for new candidates
        </button>
      </div>

      {isLoading ? <Loading /> : !data?.length ? <Empty>No new suggestions yet. Scan for candidates, or wait for the weekly job.</Empty> : (
        <div className="space-y-3">
          {data.map((s) => (
            <div key={s.id} className="card p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="font-semibold" style={{ color: 'var(--t-primary)' }}>
                  {s.topic || `Post #${s.post_id}`} <span className="badge badge-gray uppercase ml-1">{s.platform}</span>
                </div>
              </div>
              <div className="text-xs" style={{ color: 'var(--t-muted)' }}>
                Reach: {s.reach.toLocaleString()} · Engagement rate: {(s.engagement_rate * 100).toFixed(1)}% ·
                Top {Math.round((1 - s.percentile) * 100)}% of this platform's posts
              </div>
              <div className="text-sm space-y-1" style={{ color: 'var(--t-sub)' }}>
                <div><strong>Objective:</strong> {s.objective}</div>
                <div><strong>Budget:</strong> {s.budget_band}</div>
                <div><strong>Targeting angle:</strong> {s.targeting_angle}</div>
                <div><strong>Creative notes:</strong> {s.creative_notes}</div>
                <div><strong>Suggested duration:</strong> {s.duration_days} days</div>
              </div>

              {s.meta_campaign_id ? (
                <div className="badge badge-green">✅ Draft campaign created — id {s.meta_campaign_id} (PAUSED, review before launch)</div>
              ) : !isAdminOrAbove() ? (
                <p className="text-xs" style={{ color: 'var(--t-muted)' }}>🔒 Creating a draft ad campaign requires an admin account.</p>
              ) : (
                <button onClick={() => draftMutation.mutate(s.id)} disabled={busy} className="btn-primary">
                  Create draft campaign (PAUSED — no spend)
                </button>
              )}

              <div className="flex gap-2 pt-1">
                <button onClick={() => reviewedMutation.mutate(s.id)} disabled={busy} className="btn-secondary">Mark reviewed</button>
                <button onClick={() => dismissMutation.mutate(s.id)} disabled={busy} className="btn-secondary">Dismiss</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Festivals ────────────────────────────────────────────────────────────── */

function FestivalsTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['social-engine-festivals'],
    queryFn: () => api.get('/social-engine/festivals/upcoming').then((r) => r.data.data.upcoming),
  });

  const genMutation = useMutation({
    mutationFn: () => api.post('/social-engine/festivals/generate-due'),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['social-engine-festivals'] });
      const ids = res.data.data.post_ids;
      toast.success(ids.length ? `Generated ${ids.length} festival post(s)` : 'No festivals due today');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Generation failed'),
  });

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <p className="text-sm mb-3" style={{ color: 'var(--t-sub)' }}>
          Auto-generates a branded image + caption for each upcoming festival, a few days ahead of its date. Lands
          in <strong>Social Approvals</strong> for review — nothing posts without approval (unless auto-approve is on).
        </p>
        <button onClick={() => genMutation.mutate()} disabled={genMutation.isPending} className="btn-primary">
          Generate due festivals now
        </button>
      </div>

      {isLoading ? <Loading /> : !data?.length ? <Empty>No upcoming festivals configured.</Empty> : (
        <div className="table-container">
          <table className="data-table">
            <thead><tr><th>Festival</th><th>Date</th><th>Days until</th><th>Generates on</th></tr></thead>
            <tbody>
              {data.map((f) => (
                <tr key={f.name}>
                  <td className="font-medium" style={{ color: 'var(--t-primary)' }}>{f.name}</td>
                  <td>{f.date}</td>
                  <td>{f.days_until}</td>
                  <td>{f.generates_on}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── Competitors ──────────────────────────────────────────────────────────── */

function CompetitorsTab() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ competitor: '', followerCount: '', postCount: '', isRunningAds: false, adNotes: '', notes: '' });

  const { data, isLoading } = useQuery({
    queryKey: ['social-engine-competitors'],
    queryFn: () => api.get('/social-engine/competitors/pulse').then((r) => r.data.data),
  });

  const checkinMutation = useMutation({
    mutationFn: (body) => api.post('/social-engine/competitors/checkin', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['social-engine-competitors'] });
      toast.success('Logged');
      setForm({ competitor: '', followerCount: '', postCount: '', isRunningAds: false, adNotes: '', notes: '' });
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to log check-in'),
  });

  if (isLoading) return <Loading />;
  if (!data) return <Empty>Failed to load competitor data.</Empty>;

  const statusFor = (c) => {
    if (!c.last_post_at) return { label: 'No post date', badge: 'badge-gray' };
    const days = (Date.now() - new Date(c.last_post_at).getTime()) / 86400000;
    if (days <= 7) return { label: 'Active', badge: 'badge-green' };
    if (days <= 30) return { label: 'Slowing down', badge: 'badge-amber' };
    return { label: 'Gone quiet', badge: 'badge-red' };
  };

  return (
    <div className="space-y-4">
      <p className="text-sm" style={{ color: 'var(--t-sub)' }}>
        Tracking <strong>{data.tracked.length}</strong> competitors for {data.brand}. Meta's Ad Library API doesn't
        cover regular commercial ads in India, so this is hand-logged — a quick weekly look at each competitor's public page.
      </p>

      <div className="table-container">
        <table className="data-table">
          <thead><tr><th>Status</th><th>Competitor</th><th>Followers</th><th>Posts</th><th>Last post</th><th>Avg. days between posts</th><th>Running ads?</th></tr></thead>
          <tbody>
            {data.competitors.map((c) => {
              const st = statusFor(c);
              return (
                <tr key={c.competitor}>
                  <td><span className={clsx('badge', st.badge)}>{st.label}</span></td>
                  <td className="font-medium" style={{ color: 'var(--t-primary)' }}>{c.competitor}</td>
                  <td>{c.follower_count != null ? c.follower_count.toLocaleString() : '—'}</td>
                  <td>{c.post_count ?? '—'}</td>
                  <td>{c.last_post_at ? new Date(c.last_post_at).toLocaleDateString() : '—'}</td>
                  <td>{c.avg_days_between_posts ?? '—'}</td>
                  <td>{c.is_running_ads == null ? '—' : c.is_running_ads ? 'Yes' : 'No'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="card p-4">
        <h3 className="section-title">Log this week's check-in</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <label className="label">Competitor</label>
            <select value={form.competitor} onChange={(e) => setForm({ ...form, competitor: e.target.value })} className="input">
              <option value="">Select…</option>
              {data.tracked.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Follower count</label>
            <input type="number" className="input" value={form.followerCount} onChange={(e) => setForm({ ...form, followerCount: e.target.value })} />
          </div>
          <div>
            <label className="label">Total post count</label>
            <input type="number" className="input" value={form.postCount} onChange={(e) => setForm({ ...form, postCount: e.target.value })} />
          </div>
          <div className="flex items-center gap-2 mt-5">
            <input type="checkbox" id="running-ads" checked={form.isRunningAds} onChange={(e) => setForm({ ...form, isRunningAds: e.target.checked })} />
            <label htmlFor="running-ads" className="text-sm" style={{ color: 'var(--t-sub)' }}>Currently running a paid/boosted ad?</label>
          </div>
          <div className="md:col-span-2">
            <label className="label">Notes</label>
            <input className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="New launch, sale, campaign, etc." />
          </div>
        </div>
        <button
          onClick={() => checkinMutation.mutate({
            competitor: form.competitor,
            followerCount: form.followerCount ? Number(form.followerCount) : null,
            postCount: form.postCount ? Number(form.postCount) : null,
            isRunningAds: form.isRunningAds,
            adNotes: form.adNotes,
            notes: form.notes,
          })}
          disabled={!form.competitor || checkinMutation.isPending}
          className="btn-primary mt-4"
        >
          Log check-in
        </button>
      </div>
    </div>
  );
}

/* ── Settings ─────────────────────────────────────────────────────────────── */

function SettingsTab() {
  const { data: cost, isLoading: loadingCost } = useQuery({
    queryKey: ['social-engine-cost'],
    queryFn: () => api.get('/social-engine/cost/breakdown').then((r) => r.data.data),
  });
  const { data: flags, isLoading: loadingFlags } = useQuery({
    queryKey: ['social-engine-flags'],
    queryFn: () => api.get('/social-engine/settings/flags').then((r) => r.data.data),
  });
  const { data: strategy, isLoading: loadingStrategy } = useQuery({
    queryKey: ['social-engine-strategy'],
    queryFn: () => api.get('/social-engine/strategy/best-time').then((r) => r.data.data),
  });

  return (
    <div className="space-y-6">
      <div>
        <h3 className="section-title">API spend this month</h3>
        {loadingCost ? <Loading /> : (
          <>
            <div className="table-container mb-3">
              <table className="data-table">
                <thead><tr><th>Service</th><th>Spent</th><th>Budget</th></tr></thead>
                <tbody>
                  {cost.rows.map((r) => (
                    <tr key={r.service}>
                      <td className="font-medium capitalize" style={{ color: 'var(--t-primary)' }}>{r.service}</td>
                      <td>${r.spent.toFixed(4)}</td>
                      <td>${r.budget.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="stat-card inline-flex">
              <div>
                <div className="text-xs mb-1" style={{ color: 'var(--t-muted)' }}>Total this month</div>
                <div className="text-xl font-bold" style={{ color: 'var(--t-primary)' }}>
                  ${cost.total_spent.toFixed(2)} <span className="text-sm font-normal" style={{ color: 'var(--t-muted)' }}>of ${cost.total_budget.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <div>
        <h3 className="section-title">Feature flags</h3>
        <p className="text-xs mb-2" style={{ color: 'var(--t-muted)' }}>Edit .env on the engine server and restart it to change these.</p>
        {loadingFlags ? <Loading /> : (
          <div className="card p-4 grid grid-cols-2 gap-3 text-sm">
            <div><span style={{ color: 'var(--t-muted)' }}>Auto-approve posts:</span> <strong>{String(flags.auto_approve_posts)}</strong></div>
            <div><span style={{ color: 'var(--t-muted)' }}>Auto-approve replies:</span> <strong>{String(flags.auto_approve_replies)}</strong></div>
            <div><span style={{ color: 'var(--t-muted)' }}>Auto-approve festival posts:</span> <strong>{String(flags.auto_approve_festival_posts)}</strong></div>
            <div><span style={{ color: 'var(--t-muted)' }}>Daily post target:</span> <strong>{flags.daily_post_target}</strong></div>
            <div><span style={{ color: 'var(--t-muted)' }}>Cost budget total:</span> <strong>${flags.cost_budget_total}</strong></div>
            <div><span style={{ color: 'var(--t-muted)' }}>DM trigger keywords:</span> <strong>{flags.dm_trigger_keywords}</strong></div>
          </div>
        )}
      </div>

      <div>
        <h3 className="section-title">Posting-time strategy</h3>
        <p className="text-xs mb-2" style={{ color: 'var(--t-muted)' }}>
          Starts from industry-average defaults, switches to hours learned from your own metrics once a platform
          has enough measured posts{strategy ? ` (${strategy.min_samples}+ measured posts, ${strategy.min_samples_per_bucket}+ per hour)` : ''}.
        </p>
        {loadingStrategy ? <Loading /> : (
          <div className="table-container">
            <table className="data-table">
              <thead><tr><th>Platform</th><th>Day type</th><th>Hour (local)</th><th>Source</th></tr></thead>
              <tbody>
                {strategy.rows.map((r, i) => (
                  <tr key={i}>
                    <td className="font-medium" style={{ color: 'var(--t-primary)' }}>{r.platform}</td>
                    <td>{r.day_type}</td>
                    <td>{String(r.hour).padStart(2, '0')}:00</td>
                    <td><span className={clsx('badge', r.source === 'learned' ? 'badge-green' : 'badge-gray')}>{r.source}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
