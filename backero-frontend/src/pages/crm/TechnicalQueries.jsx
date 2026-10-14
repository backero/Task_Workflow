import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore';
import api from '../../api/axios';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import {
  HelpCircle, CheckCircle2, ExternalLink,
} from 'lucide-react';
import { Button, Card, Drawer, Empty, Input, Radio, Space, Spin, Tag, Typography } from 'antd';
import { customerId } from '../../utils/leadHelpers';

const { Title, Text, Paragraph } = Typography;

const URGENCY_COLOR = { low: 'default', medium: 'gold', high: 'red' };
const STATUS_COLOR = { pending: 'orange', answered: 'green', closed: 'default' };

export default function TechnicalQueries() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState('all');
  const [replyQuery, setReplyQuery] = useState(null);
  const [replyText, setReplyText] = useState('');

  const isAdmin = ['admin', 'founder', 'chairman', 'super_admin', 'manager', 'team_lead'].includes(user?.role);
  const canReplyQuery = (q) => isAdmin || q.assignedTo?._id === user?._id || (!q.assignedTo && user?.department === 'Production');

  const { data, isLoading } = useQuery({
    queryKey: ['crm', 'queries', statusFilter],
    queryFn: () => api.get(`/crm/queries${statusFilter !== 'all' ? `?status=${statusFilter}` : ''}`).then((r) => r.data.queries),
  });

  const replyMutation = useMutation({
    mutationFn: ({ queryId, answer }) => api.put(`/crm/queries/${queryId}/reply`, { answer }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm', 'queries'] });
      toast.success('Reply sent — sales team has been notified');
      setReplyQuery(null);
      setReplyText('');
    },
    onError: () => toast.error('Failed to send reply'),
  });

  const queries = data || [];
  const pendingCount = queries.filter((q) => q.status === 'pending').length;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <Title level={4} style={{ marginBottom: 0 }}>Technical Queries</Title>
          <Text type="secondary">Sales queries routed to Production for technical answers</Text>
        </div>
        {pendingCount > 0 && <Tag color="orange" style={{ fontWeight: 600 }}>{pendingCount} pending</Tag>}
      </div>

      <Radio.Group value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ marginBottom: 16 }}>
        <Radio.Button value="all">All</Radio.Button>
        <Radio.Button value="pending">Pending</Radio.Button>
        <Radio.Button value="answered">Answered</Radio.Button>
      </Radio.Group>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
      ) : queries.length === 0 ? (
        <Card>
          <Empty
            image={<HelpCircle style={{ fontSize: 48, color: '#d9d9d9' }} />}
            description={
              <>
                <Text strong>No queries found</Text>
                <div><Text type="secondary" style={{ fontSize: 13 }}>{statusFilter === 'pending' ? 'All queries have been answered.' : 'No technical queries have been raised yet.'}</Text></div>
              </>
            }
          />
        </Card>
      ) : (
        <Space direction="vertical" style={{ width: '100%' }} size={16}>
          {queries.map((q) => (
            <Card key={q._id}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Space size={8} wrap style={{ marginBottom: 8 }}>
                    <Tag color={STATUS_COLOR[q.status] || 'default'}>{q.status === 'pending' ? 'Pending' : q.status === 'answered' ? 'Answered' : 'Closed'}</Tag>
                    <Tag color={URGENCY_COLOR[q.urgency] || 'default'}>{q.urgency} urgency</Tag>
                    <Text type="secondary" style={{ fontSize: 12 }}>{format(new Date(q.createdAt), 'dd MMM yyyy, h:mm a')}</Text>
                  </Space>

                  <div><Text strong>{q.title}</Text></div>
                  <Paragraph style={{ fontSize: 13, whiteSpace: 'pre-wrap', marginBottom: 0 }} type="secondary">{q.description}</Paragraph>

                  {q.leadId && (
                    <Button
                      type="link" size="small" style={{ padding: '4px 0' }}
                      icon={<ExternalLink />}
                      title={`Open ${customerId(q.leadId)}`}
                      onClick={() => navigate(`/crm/leads/${q.leadId._id}`)}
                    >
                      <Text strong style={{ fontFamily: 'monospace' }}>{customerId(q.leadId)}</Text> · {q.leadId.name}
                      {q.leadId.phone && <Text type="secondary"> · {q.leadId.phone}</Text>}
                    </Button>
                  )}

                  <div style={{ marginTop: 8 }}>
                    <Space size={16} wrap>
                      <Text type="secondary" style={{ fontSize: 12 }}>Raised by <Text strong style={{ fontSize: 12 }}>{q.raisedBy?.firstName} {q.raisedBy?.lastName}</Text></Text>
                      {q.assignedTo && (
                        <Text style={{ fontSize: 12, color: '#1677ff' }}>
                          Assigned to <Text strong style={{ fontSize: 12, color: '#1677ff' }}>{q.assignedTo.firstName} {q.assignedTo.lastName}</Text>
                          {q.assignedTo.department && <Text style={{ fontSize: 12, color: '#69b1ff' }}> ({q.assignedTo.department})</Text>}
                        </Text>
                      )}
                    </Space>
                  </div>

                  {q.status === 'answered' && q.answer && (
                    <Card size="small" style={{ marginTop: 12, background: '#f6ffed', borderColor: '#b7eb8f' }}>
                      <Space size={6} style={{ marginBottom: 4 }}>
                        <CheckCircle2 style={{ color: '#389e0d' }} />
                        <Text strong style={{ fontSize: 12, color: '#389e0d' }}>
                          Answered by {q.answeredBy?.firstName} {q.answeredBy?.lastName}
                          {q.answeredAt && <Text type="secondary" style={{ fontSize: 12 }}> · {format(new Date(q.answeredAt), 'dd MMM, h:mm a')}</Text>}
                        </Text>
                      </Space>
                      <Paragraph style={{ fontSize: 13, whiteSpace: 'pre-wrap', marginBottom: 0, color: '#237804' }}>{q.answer}</Paragraph>
                    </Card>
                  )}
                </div>

                {canReplyQuery(q) && q.status === 'pending' && (
                  <Button type="primary" onClick={() => { setReplyQuery(q); setReplyText(''); }}>Reply</Button>
                )}
              </div>
            </Card>
          ))}
        </Space>
      )}

      <Drawer
        open={!!replyQuery}
        onClose={() => setReplyQuery(null)}
        width={480}
        title={
          <div>
            <div>Reply to Query</div>
            <Text type="secondary" style={{ fontSize: 13, fontWeight: 400 }}>{replyQuery?.title}</Text>
          </div>
        }
        footer={
          replyQuery && (
            <Space style={{ width: '100%' }}>
              <Button onClick={() => setReplyQuery(null)} style={{ flex: 1 }}>Cancel</Button>
              <Button
                type="primary" style={{ flex: 1 }}
                loading={replyMutation.isPending}
                onClick={() => {
                  if (!replyText.trim()) return toast.error('Enter an answer');
                  replyMutation.mutate({ queryId: replyQuery._id, answer: replyText });
                }}
              >
                Send Reply
              </Button>
            </Space>
          )
        }
      >
        {replyQuery && (
          <Space direction="vertical" style={{ width: '100%' }} size={16}>
            <Card size="small" style={{ background: '#fafafa' }}>
              <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase', fontWeight: 600 }}>Question</Text>
              <Paragraph style={{ fontSize: 13, marginBottom: 4 }}>{replyQuery.description}</Paragraph>
              <Text type="secondary" style={{ fontSize: 12 }}>Lead: <Text strong style={{ fontSize: 12 }}>{replyQuery.leadName}</Text></Text>
            </Card>

            <div>
              <Text strong style={{ display: 'block', marginBottom: 6 }}>Your Answer *</Text>
              <Input.TextArea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                rows={5}
                placeholder="Provide a detailed technical answer for the sales team..."
                autoFocus
              />
            </div>
          </Space>
        )}
      </Drawer>
    </div>
  );
}
