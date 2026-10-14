import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Check, X, Image, Film, CalendarDays } from 'lucide-react';
import { Button, Card, Empty, Input, Radio, Space, Spin, Tag, Typography } from 'antd';
import api from '../../api/axios';
import toast from 'react-hot-toast';

const { Title, Text, Paragraph } = Typography;

const TABS = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'published', label: 'Published' },
  { key: 'publish_failed', label: 'Failed' },
];

const PLATFORM_LABELS = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
  twitter: 'X / Twitter',
  youtube: 'YouTube',
  other: 'Other',
};

const STATUS_STYLE = {
  rejected: { color: '#cf1322', bg: '#fff1f0', border: '#ffccc7' },
  publish_failed: { color: '#d46b08', bg: '#fff7e6', border: '#ffd591' },
  default: { color: '#389e0d', bg: '#f6ffed', border: '#b7eb8f' },
};

function RequestCard({ request, onApprove, onReject, isMutating }) {
  const [rejecting, setRejecting] = useState(false);
  const [notes, setNotes] = useState('');
  const statusStyle = STATUS_STYLE[request.status] || STATUS_STYLE.default;

  return (
    <Card>
      <Space direction="vertical" style={{ width: '100%' }} size={12}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <Tag color="blue">{PLATFORM_LABELS[request.platform] || request.platform}</Tag>
            {request.campaignName && <Text strong style={{ marginLeft: 8 }}>{request.campaignName}</Text>}
          </div>
          {request.scheduledFor && (
            <Space size={4} style={{ flexShrink: 0 }}>
              <CalendarDays size={13} color="#9ca3af" />
              <Text type="secondary" style={{ fontSize: 12 }}>{format(new Date(request.scheduledFor), 'dd MMM, HH:mm')}</Text>
            </Space>
          )}
        </div>

        {request.caption && <Paragraph style={{ fontSize: 13, whiteSpace: 'pre-wrap', marginBottom: 0 }}>{request.caption}</Paragraph>}

        {request.mediaUrls?.length > 0 && (
          <Space size={8} wrap>
            {request.mediaUrls.map((m, i) => (
              <a key={i} href={m.url} target="_blank" rel="noreferrer" style={{ width: 80, height: 80, borderRadius: 8, overflow: 'hidden', border: '1px solid #f0f0f0', background: '#fafafa', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {m.type === 'video' ? <Film size={22} color="#9ca3af" /> : <img src={m.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.target.style.display = 'none'; }} />}
              </a>
            ))}
          </Space>
        )}

        {request.status === 'pending' && (
          !rejecting ? (
            <Space style={{ width: '100%' }}>
              <Button type="primary" icon={<Check size={14} />} style={{ flex: 1 }} disabled={isMutating} onClick={() => onApprove(request._id)}>Approve</Button>
              <Button danger icon={<X size={14} />} style={{ flex: 1 }} disabled={isMutating} onClick={() => setRejecting(true)}>Reject</Button>
            </Space>
          ) : (
            <Space direction="vertical" style={{ width: '100%' }} size={8}>
              <Input.TextArea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Why is this being rejected?" autoFocus />
              <Space style={{ width: '100%' }}>
                <Button style={{ flex: 1 }} onClick={() => { setRejecting(false); setNotes(''); }}>Cancel</Button>
                <Button
                  danger type="primary" style={{ flex: 1 }} disabled={isMutating}
                  onClick={() => {
                    if (!notes.trim()) return toast.error('Rejection reason is required');
                    onReject(request._id, notes);
                    setRejecting(false); setNotes('');
                  }}
                >
                  Send Rejection
                </Button>
              </Space>
            </Space>
          )
        )}

        {request.status !== 'pending' && (
          <Card size="small" style={{ background: statusStyle.bg, borderColor: statusStyle.border }}>
            <Text style={{ fontSize: 12, color: statusStyle.color }}>
              {request.status === 'approved' && `Approved by ${request.reviewedBy?.firstName || 'Unknown'} — awaiting publish`}
              {request.status === 'rejected' && `Rejected by ${request.reviewedBy?.firstName || 'Unknown'}`}
              {request.status === 'published' && 'Published live'}
              {request.status === 'publish_failed' && 'Publish failed'}
              {request.reviewNotes ? ` — ${request.reviewNotes}` : ''}
            </Text>
            {request.status === 'publish_failed' && request.publishError && (
              <div><Text style={{ fontSize: 12, color: '#ad6800' }}>{request.publishError}</Text></div>
            )}
            {request.status === 'published' && request.publishedUrls?.length > 0 && (
              <Space size={12} wrap style={{ marginTop: 4 }}>
                {request.publishedUrls.map((p, i) => (
                  <a key={i} href={p.url} target="_blank" rel="noreferrer">{PLATFORM_LABELS[p.platform] || p.platform}</a>
                ))}
              </Space>
            )}
          </Card>
        )}
      </Space>
    </Card>
  );
}

export default function SocialApprovals() {
  const [tab, setTab] = useState('pending');
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['social-approvals', tab],
    queryFn: () => api.get('/social-approvals', { params: { status: tab, limit: 100 } }).then((r) => r.data.data || []),
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, reviewNotes }) => api.post(`/social-approvals/${id}/approve`, { reviewNotes }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['social-approvals'] }); toast.success('Approved'); },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to approve'),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reviewNotes }) => api.post(`/social-approvals/${id}/reject`, { reviewNotes }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['social-approvals'] }); toast.success('Rejected'); },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to reject'),
  });

  const isMutating = approveMutation.isPending || rejectMutation.isPending;

  return (
    <div style={{ maxWidth: 720 }}>
      <Title level={4} style={{ marginBottom: 0 }}>Social Media Approvals</Title>
      <Text type="secondary">Posts submitted by the social automation system, awaiting review.</Text>

      <Radio.Group value={tab} onChange={(e) => setTab(e.target.value)} style={{ display: 'block', margin: '16px 0' }}>
        {TABS.map((t) => <Radio.Button key={t.key} value={t.key}>{t.label}</Radio.Button>)}
      </Radio.Group>

      {isLoading && <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>}

      {!isLoading && (!data || data.length === 0) && (
        <Card>
          <Empty image={<Image size={40} color="#d1d5db" style={{ margin: '0 auto' }} />} description={`No ${tab} requests.`} />
        </Card>
      )}

      <Space direction="vertical" style={{ width: '100%' }} size={16}>
        {data?.map((request) => (
          <RequestCard
            key={request._id}
            request={request}
            isMutating={isMutating}
            onApprove={(id) => approveMutation.mutate({ id })}
            onReject={(id, reviewNotes) => rejectMutation.mutate({ id, reviewNotes })}
          />
        ))}
      </Space>
    </div>
  );
}
