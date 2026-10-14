import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Sparkles, Users, MessageCircle, BarChart3, Radio, Check, X, Send,
  Megaphone, CalendarDays, Eye, Settings as SettingsIcon, TriangleAlert, Lock, CheckCircle2,
} from 'lucide-react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store/useAuthStore';
import {
  Button, Card, Checkbox, Empty as AntEmpty, Input, Progress, Select, Space, Spin,
  Statistic, Table, Tabs, Tag, Typography, Upload,
} from 'antd';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

const TABS = [
  { key: 'overview', label: 'Overview', icon: Sparkles },
  { key: 'create', label: 'Create Post', icon: Sparkles },
  { key: 'leads', label: 'Leads', icon: Users },
  { key: 'engagement', label: 'Engagement', icon: MessageCircle },
  { key: 'analytics', label: 'Analytics', icon: BarChart3 },
  { key: 'accounts', label: 'Accounts', icon: Radio },
  { key: 'ads', label: 'Ads', icon: Megaphone },
  { key: 'festivals', label: 'Festivals', icon: CalendarDays },
  { key: 'competitors', label: 'Competitors', icon: Eye },
  { key: 'settings', label: 'Settings', icon: SettingsIcon },
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
const STAGE_COLOR = { new: 'default', nurturing: 'blue', booked: 'purple', won: 'green', lost: 'red' };

const REPLY_STATES = ['draft', 'escalated', 'approved', 'sent', 'skipped'];
const REPLY_STATE_COLOR = { draft: 'gold', escalated: 'red', approved: 'blue', sent: 'green', skipped: 'default' };
const URGENCY_COLOR = { high: 'red', medium: 'gold', low: 'default' };

export default function SocialAutomation() {
  return (
    <div>
      <Title level={4} style={{ marginBottom: 0 }}>Social Automation</Title>
      <Text type="secondary">
        Content generation, leads, engagement AI, and analytics — powered by the marketing engine. Looking to
        approve a post? That's under <Text strong>Social Approvals</Text>.
      </Text>

      <Tabs
        style={{ marginTop: 12 }}
        items={TABS.map((t) => ({
          key: t.key,
          label: <Space size={6}><t.icon size={14} />{t.label}</Space>,
          children: <TabContent tabKey={t.key} />,
        }))}
      />
    </div>
  );
}

function TabContent({ tabKey }) {
  switch (tabKey) {
    case 'overview': return <OverviewTab />;
    case 'create': return <CreateTab />;
    case 'leads': return <LeadsTab />;
    case 'engagement': return <EngagementTab />;
    case 'analytics': return <AnalyticsTab />;
    case 'accounts': return <AccountsTab />;
    case 'ads': return <AdsTab />;
    case 'festivals': return <FestivalsTab />;
    case 'competitors': return <CompetitorsTab />;
    case 'settings': return <SettingsTab />;
    default: return null;
  }
}

/* ── Small pieces ─────────────────────────────────────────────────────────── */

function Loading() {
  return <div style={{ textAlign: 'center', padding: 48 }}><Spin /></div>;
}

function Empty({ children }) {
  return <Card><AntEmpty description={children} /></Card>;
}

/* ── Overview ─────────────────────────────────────────────────────────────── */

function OverviewTab() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['social-engine-overview'],
    queryFn: () => api.get('/social-engine/overview').then((r) => r.data),
  });

  if (isLoading) return <Loading />;
  if (error) return <Empty>Failed to load overview — is the marketing engine reachable?</Empty>;

  const costPct = data.cost_budget_total ? Math.round((data.cost_spent_this_month / data.cost_budget_total) * 100) : 0;

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={16}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        <Card size="small"><Statistic title="Pending review" value={data.pending_review} /></Card>
        <Card size="small"><Statistic title="Approved & queued" value={data.approved_queued} /></Card>
        <Card size="small"><Statistic title="Failed — needs review" value={data.failed} /></Card>
        <Card size="small"><Statistic title="New leads" value={data.new_leads} /></Card>
        <Card size="small"><Statistic title="Comments needing a human" value={data.comments_needing_human} /></Card>
      </div>
      <Card size="small" style={{ maxWidth: 320 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>Cost spent this month</Text>
        <Title level={4} style={{ margin: '4px 0' }}>
          ${data.cost_spent_this_month.toFixed(2)}
          <Text type="secondary" style={{ fontSize: 13, fontWeight: 400 }}> / ${data.cost_budget_total.toFixed(2)}</Text>
        </Title>
        <Progress percent={Math.min(costPct, 100)} showInfo={false} status={costPct > 80 ? 'exception' : 'active'} strokeColor={costPct > 80 ? undefined : '#22c55e'} />
      </Card>
    </Space>
  );
}

/* ── Create Post ──────────────────────────────────────────────────────────── */

function CreateTab() {
  return (
    <Space direction="vertical" style={{ width: '100%', maxWidth: 560 }} size={16}>
      <GenerateSection />
      <VideoIngestSection />
      <ManualPostSection />
    </Space>
  );
}

function SuccessBanner({ children }) {
  return (
    <Card size="small" style={{ background: '#f0fdf4', borderColor: '#bbf7d0' }}>
      <Text style={{ fontSize: 13, color: '#059669' }}>{children}</Text>
    </Card>
  );
}

function GenerateSection() {
  const [pillar, setPillar] = useState(PILLARS[0]);
  const [result, setResult] = useState(null);

  const generateMutation = useMutation({
    mutationFn: () => api.post('/social-engine/posts/generate', { pillar }),
    onSuccess: (res) => { setResult(res.data); toast.success('Post generated — sent for approval'); },
    onError: (err) => toast.error(err.response?.data?.message || 'Content generation failed'),
  });

  return (
    <Card title="Generate with AI">
      <Space direction="vertical" style={{ width: '100%' }} size={12}>
        <div>
          <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>Content pillar</Text>
          <Select style={{ width: '100%' }} value={pillar} onChange={setPillar} options={PILLARS.map((p) => ({ label: p, value: p }))} />
        </div>
        <Button
          type="primary" icon={<Sparkles size={14} />} block loading={generateMutation.isPending}
          onClick={() => { setResult(null); generateMutation.mutate(); }}
        >
          {generateMutation.isPending ? 'Generating… (image/video can take a minute)' : 'Generate post'}
        </Button>
        {result && (
          <SuccessBanner>
            Created post #{result.post_id} — <em>{result.topic}</em>. It's been sent to <Text strong>Social Approvals</Text> for review.
          </SuccessBanner>
        )}
      </Space>
    </Card>
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
    onSuccess: (res) => { setResult(res.data); toast.success('Video analyzed and queued'); setFile(null); },
    onError: (err) => toast.error(err.response?.data?.message || 'Video ingest failed'),
  });

  return (
    <Card title="Auto-analyze a raw video">
      <Space direction="vertical" style={{ width: '100%' }} size={12}>
        <Text type="secondary" style={{ fontSize: 13 }}>
          Upload a raw video and the pipeline transcribes it, writes the caption/hashtags from what's said,
          auto-edits it (trim, 9:16 crop, captions, music), picks fitting platforms, and schedules it. Lands in
          <Text strong> Social Approvals</Text> — nothing publishes without approval.
        </Text>
        <div>
          <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>Raw video (mp4, mov)</Text>
          <Upload beforeUpload={(f) => { setFile(f); return false; }} onRemove={() => setFile(null)} fileList={file ? [file] : []} accept="video/mp4,video/quicktime" maxCount={1}>
            <Button>Select video</Button>
          </Upload>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>Pillar</Text>
            <Input value={pillar} onChange={(e) => setPillar(e.target.value)} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', marginTop: 20 }}>
            <Checkbox checked={autoEdit} onChange={(e) => setAutoEdit(e.target.checked)}>Run auto-edit pass</Checkbox>
          </div>
        </div>
        <Button
          type="primary" block disabled={!file} loading={ingestMutation.isPending}
          onClick={() => { setResult(null); ingestMutation.mutate(); }}
        >
          {ingestMutation.isPending ? 'Analyzing… (can take a few minutes)' : 'Analyze & queue for review'}
        </Button>
        {result && (
          <SuccessBanner>
            Post #{result.post_id} created — fits {result.platforms.join(', ') || 'no platform'}, transcript via {result.transcript_source}.
          </SuccessBanner>
        )}
      </Space>
    </Card>
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
      setResult(res.data);
      toast.success('Post saved');
      setFile(null); setTopic(''); setCaption(''); setHashtagsRaw(''); setPlatforms([]);
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to save post'),
  });

  const canSave = file && caption.trim() && platforms.length > 0 && (publishNow || scheduledAt);

  return (
    <Card title="Create & schedule a post manually">
      <Space direction="vertical" style={{ width: '100%' }} size={12}>
        <div>
          <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>Media (image or video)</Text>
          <Upload beforeUpload={(f) => { setFile(f); return false; }} onRemove={() => setFile(null)} fileList={file ? [file] : []} accept="image/*,video/*" maxCount={1}>
            <Button>Select media</Button>
          </Upload>
        </div>
        <div>
          <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>Pillar</Text>
          <Input value={pillar} onChange={(e) => setPillar(e.target.value)} placeholder="e.g. product, tips" />
        </div>
        <div>
          <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>Topic</Text>
          <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. 5 mistakes beginners make" />
        </div>
        <div>
          <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>Caption</Text>
          <TextArea rows={4} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Write your caption..." />
        </div>
        <div>
          <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>Hashtags</Text>
          <Input value={hashtagsRaw} onChange={(e) => setHashtagsRaw(e.target.value)} placeholder="#growth #smallbiz" />
        </div>
        <div>
          <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>Publish to</Text>
          <Space size={8} wrap>
            {PLATFORM_OPTIONS.map((p) => (
              <Tag.CheckableTag key={p.value} checked={platforms.includes(p.value)} onChange={() => togglePlatform(p.value)}>
                {p.label}
              </Tag.CheckableTag>
            ))}
          </Space>
        </div>
        <Checkbox checked={publishNow} onChange={(e) => setPublishNow(e.target.checked)}>Publish ASAP</Checkbox>
        {!publishNow && (
          <div>
            <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>Scheduled time</Text>
            <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
          </div>
        )}
        <Checkbox checked={sendForReview} onChange={(e) => setSendForReview(e.target.checked)}>Send for review first (recommended)</Checkbox>
        <Button type="primary" block disabled={!canSave} loading={saveMutation.isPending} onClick={() => { setResult(null); saveMutation.mutate(); }}>
          {saveMutation.isPending ? 'Saving…' : 'Save post'}
        </Button>
        {result && <SuccessBanner>Post #{result.post_id} saved as {result.state === 'review' ? 'review' : 'approved & scheduled'}.</SuccessBanner>}
      </Space>
    </Card>
  );
}

/* ── Leads ────────────────────────────────────────────────────────────────── */

function LeadsTab() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['social-engine-leads'],
    queryFn: () => api.get('/social-engine/leads').then((r) => r.data.leads),
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

  const columns = [
    { title: 'Source', dataIndex: 'source' },
    { title: 'Handle', dataIndex: 'handle', render: (v) => <Text strong>{v || '—'}</Text> },
    { title: 'Email', dataIndex: 'email', render: (v) => v || '—' },
    {
      title: 'Stage', dataIndex: 'stage',
      render: (v, r) => (
        <Select
          size="small" value={v} disabled={stageMutation.isPending} style={{ width: 120 }}
          onChange={(stage) => stageMutation.mutate({ id: r.id, stage })}
          options={LEAD_STAGES.map((s) => ({ label: <Tag color={STAGE_COLOR[s]}>{s}</Tag>, value: s }))}
        />
      ),
    },
    { title: 'HubSpot', dataIndex: 'hubspot_contact_id', render: (v, r) => (v ? 'synced' : r.email ? 'not synced' : 'no email') },
    { title: 'Created', dataIndex: 'created_at', render: (v) => (v ? new Date(v).toLocaleDateString() : '—') },
  ];

  return (
    <div>
      <Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 12 }}>
        {wonCount} of {data.length} leads won ({data.length ? Math.round((wonCount / data.length) * 100) : 0}%)
      </Text>
      <Table rowKey="id" dataSource={data} columns={columns} pagination={false} size="small" />
    </div>
  );
}

/* ── Engagement ───────────────────────────────────────────────────────────── */

function EngagementTab() {
  const [filter, setFilter] = useState('draft');
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['social-engine-comments', filter],
    queryFn: () => api.get('/social-engine/comments', { params: { replyState: filter } }).then((r) => r.data.comments),
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
      <Space size={6} wrap style={{ marginBottom: 16 }}>
        {REPLY_STATES.map((s) => (
          <Tag.CheckableTag key={s} checked={filter === s} onChange={() => setFilter(s)}>{s}</Tag.CheckableTag>
        ))}
      </Space>

      {isLoading ? <Loading /> : !data?.length ? <Empty>{`No ${filter} comments right now.`}</Empty> : (
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          {data.map((c) => (
            <Card key={c.id} size="small">
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Space size={6} style={{ marginBottom: 4 }}>
                    <Tag>{c.platform?.toUpperCase()}</Tag>
                    <Text strong style={{ fontSize: 13 }}>{c.author}</Text>
                    <Tag color={URGENCY_COLOR[c.urgency] || 'default'}>{c.urgency}</Tag>
                  </Space>
                  <Paragraph style={{ fontSize: 13, marginBottom: 0 }}>{c.text}</Paragraph>
                  {c.risk_reason && (
                    <Space size={4} style={{ marginTop: 4 }}>
                      <TriangleAlert size={12} color="#dc2626" />
                      <Text style={{ fontSize: 12, color: '#dc2626' }}>{c.risk_reason}</Text>
                    </Space>
                  )}
                  {c.reply_draft && (
                    <div style={{ marginTop: 8, fontSize: 13, borderRadius: 8, padding: '8px 12px', background: '#f8fafc', color: '#475569', whiteSpace: 'pre-wrap' }}>
                      {c.reply_draft}
                    </div>
                  )}
                </div>
                <Tag color={REPLY_STATE_COLOR[c.reply_state] || 'default'} style={{ flexShrink: 0 }}>{c.reply_state}</Tag>
              </div>
              {(c.reply_state === 'draft' || c.reply_state === 'escalated') && (
                <Space style={{ marginTop: 12 }}>
                  <Button type="primary" size="small" icon={<Check size={13} />} disabled={busy} onClick={() => approveMutation.mutate(c.id)}>Approve</Button>
                  <Button size="small" icon={<X size={13} />} disabled={busy} onClick={() => skipMutation.mutate(c.id)}>Skip</Button>
                  {c.is_lead && (
                    <Button size="small" icon={<Send size={13} />} disabled={busy} onClick={() => dmMutation.mutate(c.id)}>Send DM flow</Button>
                  )}
                </Space>
              )}
            </Card>
          ))}
        </Space>
      )}
    </div>
  );
}

/* ── Analytics ────────────────────────────────────────────────────────────── */

function AnalyticsTab() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['social-engine-analytics'],
    queryFn: () => api.get('/social-engine/analytics/summary').then((r) => r.data),
  });

  if (isLoading) return <Loading />;
  if (error) return <Empty>Failed to load analytics.</Empty>;

  const platformColumns = [
    { title: 'Platform', dataIndex: 'platform', render: (v) => <Text strong style={{ textTransform: 'capitalize' }}>{v}</Text> },
    { title: 'Impressions', dataIndex: 'impressions', render: (v) => v.toLocaleString() },
    { title: 'Reach', dataIndex: 'reach', render: (v) => v.toLocaleString() },
    { title: 'Likes', dataIndex: 'likes', render: (v) => v.toLocaleString() },
    { title: 'Comments', dataIndex: 'comments', render: (v) => v.toLocaleString() },
  ];

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={20}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12 }}>
        <Card size="small"><Statistic title="Impressions" value={data.totals.impressions} /></Card>
        <Card size="small"><Statistic title="Reach" value={data.totals.reach} /></Card>
        <Card size="small"><Statistic title="Likes" value={data.totals.likes} /></Card>
        <Card size="small"><Statistic title="Comments" value={data.totals.comments} /></Card>
        <Card size="small"><Statistic title="Shares" value={data.totals.shares} /></Card>
        <Card size="small"><Statistic title="Saves" value={data.totals.saves} /></Card>
        <Card size="small"><Statistic title="Video views" value={data.totals.video_views} /></Card>
      </div>

      <div>
        <Title level={5}>By platform</Title>
        <Table rowKey="platform" dataSource={data.by_platform} columns={platformColumns} pagination={false} size="small" />
      </div>

      <div>
        <Title level={5}>Top posts by engagement</Title>
        {!data.top_posts.length ? <Empty>No published posts with metrics yet.</Empty> : (
          <Card size="small" styles={{ body: { padding: 0 } }}>
            {data.top_posts.map((p, i) => (
              <div key={p.post_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderTop: i ? '1px solid #f0f0f0' : 'none' }}>
                <Space size={8}>
                  <Tag>{p.pillar}</Tag>
                  <Text style={{ fontSize: 13 }}>{p.topic}</Text>
                </Space>
                <Text strong style={{ fontSize: 13, color: '#059669' }}>{p.engagement.toLocaleString()}</Text>
              </div>
            ))}
          </Card>
        )}
      </div>
    </Space>
  );
}

/* ── Accounts ─────────────────────────────────────────────────────────────── */

function AccountsTab() {
  const { data: accountsData, isLoading: loadingAccounts } = useQuery({
    queryKey: ['social-engine-accounts'],
    queryFn: () => api.get('/social-engine/accounts').then((r) => r.data.accounts),
  });
  const { data: activityData } = useQuery({
    queryKey: ['social-engine-accounts-activity'],
    queryFn: () => api.get('/social-engine/accounts/activity').then((r) => r.data.activity),
  });

  if (loadingAccounts) return <Loading />;
  if (!accountsData?.length) return <Empty>No platforms configured yet.</Empty>;

  const activityByPlatform = Object.fromEntries((activityData || []).map((a) => [a.platform, a]));

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={12}>
      {accountsData.map((a) => {
        const act = activityByPlatform[a.platform];
        return (
          <Card key={a.platform} size="small">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <Space size={6} wrap>
                  <Text strong style={{ textTransform: 'capitalize' }}>{a.platform}</Text>
                  {!a.configured ? <Tag>not configured</Tag> : a.ok ? <Tag color="green">connected</Tag> : <Tag color="red">error</Tag>}
                  {act?.stale && <Tag color="gold">gone quiet</Tag>}
                  {act?.reach_dropped && <Tag color="red">reach dropped</Tag>}
                </Space>
                <div style={{ marginTop: 4 }}>
                  <Text type="secondary" style={{ fontSize: 13 }}>
                    {a.error || a.detail || (a.configured ? '' : 'Add credentials to connect this platform.')}
                  </Text>
                </div>
                {a.handle && (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {a.handle}{a.followers != null ? ` — ${a.followers.toLocaleString()} followers` : ''}
                  </Text>
                )}
              </div>
              {a.followers != null && <Title level={3} style={{ margin: 0, flexShrink: 0 }}>{a.followers.toLocaleString()}</Title>}
            </div>
          </Card>
        );
      })}
    </Space>
  );
}

/* ── Ads ──────────────────────────────────────────────────────────────────── */

function AdsTab() {
  const { isAdminOrAbove } = useAuthStore();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['social-engine-ads'],
    queryFn: () => api.get('/social-engine/ads/suggestions', { params: { status: 'new' } }).then((r) => r.data.suggestions),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['social-engine-ads'] });

  const scanMutation = useMutation({
    mutationFn: () => api.post('/social-engine/ads/scan'),
    onSuccess: (res) => { invalidate(); toast.success(`Created ${res.data.created} new suggestion(s)`); },
    onError: (err) => toast.error(err.response?.data?.message || 'Scan failed'),
  });
  const draftMutation = useMutation({
    mutationFn: (id) => api.post(`/social-engine/ads/suggestions/${id}/create-draft-campaign`),
    onSuccess: (res) => {
      invalidate();
      const d = res.data;
      if (d.ok) toast.success(`Draft campaign created (PAUSED) — id ${d.campaign_id}`);
      else toast.error(d.error || 'Failed to create draft campaign');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to create draft campaign'),
  });
  const reviewedMutation = useMutation({ mutationFn: (id) => api.post(`/social-engine/ads/suggestions/${id}/mark-reviewed`), onSuccess: invalidate });
  const dismissMutation = useMutation({ mutationFn: (id) => api.post(`/social-engine/ads/suggestions/${id}/dismiss`), onSuccess: invalidate });

  const busy = scanMutation.isPending || draftMutation.isPending || reviewedMutation.isPending || dismissMutation.isPending;

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={16}>
      <Card size="small">
        <Paragraph style={{ fontSize: 13, marginBottom: 12 }}>
          Organic posts that out-performed this account's own baseline get an LLM-drafted ad brief. This is a
          suggestion only — nothing here ever spends money automatically. Creating a draft campaign only ever
          creates a <Text strong>PAUSED</Text> campaign in Meta Ads Manager, for you to review and launch by hand.
        </Paragraph>
        <Button loading={scanMutation.isPending} onClick={() => scanMutation.mutate()}>Scan for new candidates</Button>
      </Card>

      {isLoading ? <Loading /> : !data?.length ? <Empty>No new suggestions yet. Scan for candidates, or wait for the weekly job.</Empty> : (
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          {data.map((s) => (
            <Card key={s.id} size="small">
              <Space direction="vertical" style={{ width: '100%' }} size={8}>
                <Space size={6}>
                  <Text strong>{s.topic || `Post #${s.post_id}`}</Text>
                  <Tag>{s.platform}</Tag>
                </Space>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Reach: {s.reach.toLocaleString()} · Engagement rate: {(s.engagement_rate * 100).toFixed(1)}% ·
                  Top {Math.round((1 - s.percentile) * 100)}% of this platform's posts
                </Text>
                <Space direction="vertical" size={2} style={{ fontSize: 13 }}>
                  <Text style={{ fontSize: 13 }}><Text strong>Objective:</Text> {s.objective}</Text>
                  <Text style={{ fontSize: 13 }}><Text strong>Budget:</Text> {s.budget_band}</Text>
                  <Text style={{ fontSize: 13 }}><Text strong>Targeting angle:</Text> {s.targeting_angle}</Text>
                  <Text style={{ fontSize: 13 }}><Text strong>Creative notes:</Text> {s.creative_notes}</Text>
                  <Text style={{ fontSize: 13 }}><Text strong>Suggested duration:</Text> {s.duration_days} days</Text>
                </Space>

                {s.meta_campaign_id ? (
                  <Space size={4}><CheckCircle2 size={14} color="#16a34a" /><Text style={{ fontSize: 12, color: '#16a34a' }}>Draft campaign created — id {s.meta_campaign_id} (PAUSED, review before launch)</Text></Space>
                ) : !isAdminOrAbove() ? (
                  <Space size={4}><Lock size={12} color="#9ca3af" /><Text type="secondary" style={{ fontSize: 12 }}>Creating a draft ad campaign requires an admin account.</Text></Space>
                ) : (
                  <Button type="primary" size="small" disabled={busy} onClick={() => draftMutation.mutate(s.id)}>Create draft campaign (PAUSED — no spend)</Button>
                )}

                <Space size={8}>
                  <Button size="small" disabled={busy} onClick={() => reviewedMutation.mutate(s.id)}>Mark reviewed</Button>
                  <Button size="small" disabled={busy} onClick={() => dismissMutation.mutate(s.id)}>Dismiss</Button>
                </Space>
              </Space>
            </Card>
          ))}
        </Space>
      )}
    </Space>
  );
}

/* ── Festivals ────────────────────────────────────────────────────────────── */

function FestivalsTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['social-engine-festivals'],
    queryFn: () => api.get('/social-engine/festivals/upcoming').then((r) => r.data.upcoming),
  });

  const genMutation = useMutation({
    mutationFn: () => api.post('/social-engine/festivals/generate-due'),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['social-engine-festivals'] });
      const ids = res.data.post_ids;
      toast.success(ids.length ? `Generated ${ids.length} festival post(s)` : 'No festivals due today');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Generation failed'),
  });

  const columns = [
    { title: 'Festival', dataIndex: 'name', render: (v) => <Text strong>{v}</Text> },
    { title: 'Date', dataIndex: 'date' },
    { title: 'Days until', dataIndex: 'days_until' },
    { title: 'Generates on', dataIndex: 'generates_on' },
  ];

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={16}>
      <Card size="small">
        <Paragraph style={{ fontSize: 13, marginBottom: 12 }}>
          Auto-generates a branded image + caption for each upcoming festival, a few days ahead of its date. Lands
          in <Text strong>Social Approvals</Text> for review — nothing posts without approval (unless auto-approve is on).
        </Paragraph>
        <Button type="primary" loading={genMutation.isPending} onClick={() => genMutation.mutate()}>Generate due festivals now</Button>
      </Card>

      {isLoading ? <Loading /> : !data?.length ? <Empty>No upcoming festivals configured.</Empty> : (
        <Table rowKey="name" dataSource={data} columns={columns} pagination={false} size="small" />
      )}
    </Space>
  );
}

/* ── Competitors ──────────────────────────────────────────────────────────── */

function CompetitorsTab() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ competitor: '', followerCount: '', postCount: '', isRunningAds: false, adNotes: '', notes: '' });

  const { data, isLoading } = useQuery({
    queryKey: ['social-engine-competitors'],
    queryFn: () => api.get('/social-engine/competitors/pulse').then((r) => r.data),
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
    if (!c.last_post_at) return { label: 'No post date', color: 'default' };
    const days = (Date.now() - new Date(c.last_post_at).getTime()) / 86400000;
    if (days <= 7) return { label: 'Active', color: 'green' };
    if (days <= 30) return { label: 'Slowing down', color: 'gold' };
    return { label: 'Gone quiet', color: 'red' };
  };

  const columns = [
    { title: 'Status', dataIndex: 'status', render: (_, c) => { const st = statusFor(c); return <Tag color={st.color}>{st.label}</Tag>; } },
    { title: 'Competitor', dataIndex: 'competitor', render: (v) => <Text strong>{v}</Text> },
    { title: 'Followers', dataIndex: 'follower_count', render: (v) => (v != null ? v.toLocaleString() : '—') },
    { title: 'Posts', dataIndex: 'post_count', render: (v) => v ?? '—' },
    { title: 'Last post', dataIndex: 'last_post_at', render: (v) => (v ? new Date(v).toLocaleDateString() : '—') },
    { title: 'Avg. days between posts', dataIndex: 'avg_days_between_posts', render: (v) => v ?? '—' },
    { title: 'Running ads?', dataIndex: 'is_running_ads', render: (v) => (v == null ? '—' : v ? 'Yes' : 'No') },
  ];

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={16}>
      <Text type="secondary" style={{ fontSize: 13 }}>
        Tracking <Text strong>{data.tracked.length}</Text> competitors for {data.brand}. Meta's Ad Library API doesn't
        cover regular commercial ads in India, so this is hand-logged — a quick weekly look at each competitor's public page.
      </Text>

      <Table rowKey="competitor" dataSource={data.competitors} columns={columns} pagination={false} size="small" />

      <Card size="small" title="Log this week's check-in">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
          <div>
            <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>Competitor</Text>
            <Select
              style={{ width: '100%' }} value={form.competitor || undefined} placeholder="Select…"
              onChange={(v) => setForm({ ...form, competitor: v })} options={data.tracked.map((c) => ({ label: c, value: c }))}
            />
          </div>
          <div>
            <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>Follower count</Text>
            <Input type="number" value={form.followerCount} onChange={(e) => setForm({ ...form, followerCount: e.target.value })} />
          </div>
          <div>
            <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>Total post count</Text>
            <Input type="number" value={form.postCount} onChange={(e) => setForm({ ...form, postCount: e.target.value })} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', marginTop: 20 }}>
            <Checkbox checked={form.isRunningAds} onChange={(e) => setForm({ ...form, isRunningAds: e.target.checked })}>Currently running a paid/boosted ad?</Checkbox>
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>Notes</Text>
            <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="New launch, sale, campaign, etc." />
          </div>
        </div>
        <Button
          type="primary" style={{ marginTop: 16 }} disabled={!form.competitor} loading={checkinMutation.isPending}
          onClick={() => checkinMutation.mutate({
            competitor: form.competitor,
            followerCount: form.followerCount ? Number(form.followerCount) : null,
            postCount: form.postCount ? Number(form.postCount) : null,
            isRunningAds: form.isRunningAds,
            adNotes: form.adNotes,
            notes: form.notes,
          })}
        >
          Log check-in
        </Button>
      </Card>
    </Space>
  );
}

/* ── Settings ─────────────────────────────────────────────────────────────── */

function SettingsTab() {
  const { data: cost, isLoading: loadingCost } = useQuery({
    queryKey: ['social-engine-cost'],
    queryFn: () => api.get('/social-engine/cost/breakdown').then((r) => r.data),
  });
  const { data: flags, isLoading: loadingFlags } = useQuery({
    queryKey: ['social-engine-flags'],
    queryFn: () => api.get('/social-engine/settings/flags').then((r) => r.data),
  });
  const { data: strategy, isLoading: loadingStrategy } = useQuery({
    queryKey: ['social-engine-strategy'],
    queryFn: () => api.get('/social-engine/strategy/best-time').then((r) => r.data),
  });

  const costColumns = [
    { title: 'Service', dataIndex: 'service', render: (v) => <Text strong style={{ textTransform: 'capitalize' }}>{v}</Text> },
    { title: 'Spent', dataIndex: 'spent', render: (v) => `$${v.toFixed(4)}` },
    { title: 'Budget', dataIndex: 'budget', render: (v) => `$${v.toFixed(2)}` },
  ];

  const strategyColumns = [
    { title: 'Platform', dataIndex: 'platform', render: (v) => <Text strong>{v}</Text> },
    { title: 'Day type', dataIndex: 'day_type' },
    { title: 'Hour (local)', dataIndex: 'hour', render: (v) => `${String(v).padStart(2, '0')}:00` },
    { title: 'Source', dataIndex: 'source', render: (v) => <Tag color={v === 'learned' ? 'green' : 'default'}>{v}</Tag> },
  ];

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={24}>
      <div>
        <Title level={5}>API spend this month</Title>
        {loadingCost ? <Loading /> : (
          <>
            <Table rowKey="service" dataSource={cost.rows} columns={costColumns} pagination={false} size="small" style={{ marginBottom: 12 }} />
            <Card size="small" style={{ display: 'inline-block' }}>
              <Statistic title="Total this month" value={cost.total_spent} precision={2} prefix="$" suffix={<Text type="secondary" style={{ fontSize: 13 }}> of ${cost.total_budget.toFixed(2)}</Text>} />
            </Card>
          </>
        )}
      </div>

      <div>
        <Title level={5}>Feature flags</Title>
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>Edit .env on the engine server and restart it to change these.</Text>
        {loadingFlags ? <Loading /> : (
          <Card size="small">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13 }}>
              <div><Text type="secondary">Auto-approve posts:</Text> <Text strong>{String(flags.auto_approve_posts)}</Text></div>
              <div><Text type="secondary">Auto-approve replies:</Text> <Text strong>{String(flags.auto_approve_replies)}</Text></div>
              <div><Text type="secondary">Auto-approve festival posts:</Text> <Text strong>{String(flags.auto_approve_festival_posts)}</Text></div>
              <div><Text type="secondary">Daily post target:</Text> <Text strong>{flags.daily_post_target}</Text></div>
              <div><Text type="secondary">Cost budget total:</Text> <Text strong>${flags.cost_budget_total}</Text></div>
              <div><Text type="secondary">DM trigger keywords:</Text> <Text strong>{flags.dm_trigger_keywords}</Text></div>
            </div>
          </Card>
        )}
      </div>

      <div>
        <Title level={5}>Posting-time strategy</Title>
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
          Starts from industry-average defaults, switches to hours learned from your own metrics once a platform
          has enough measured posts{strategy ? ` (${strategy.min_samples}+ measured posts, ${strategy.min_samples_per_bucket}+ per hour)` : ''}.
        </Text>
        {loadingStrategy ? <Loading /> : (
          <Table rowKey={(r, i) => i} dataSource={strategy.rows} columns={strategyColumns} pagination={false} size="small" />
        )}
      </div>
    </Space>
  );
}
