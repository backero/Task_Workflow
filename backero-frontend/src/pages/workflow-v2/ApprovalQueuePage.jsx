import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Col, Empty, Input, message, Modal, Row, Space, Spin, Statistic, Tag, Typography } from 'antd';
import { CheckOutlined, CloseOutlined } from '@ant-design/icons';
import { formatDistanceToNow } from 'date-fns';
import workflowApi from '../../api/workflowApi';

const { Title, Text, Paragraph } = Typography;

function RejectModal({ approvalId, onClose, onConfirm }) {
  const [notes, setNotes] = useState('');
  return (
    <Modal
      title="Reject &amp; send feedback"
      open={!!approvalId}
      onCancel={onClose}
      onOk={() => {
        if (!notes.trim()) return message.error('Rejection reason is required');
        onConfirm(notes.trim());
      }}
      okText="Send back"
      okButtonProps={{ danger: true }}
    >
      <Paragraph type="secondary">Explain what needs to be corrected so the assignee knows what to fix.</Paragraph>
      <Input.TextArea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} autoFocus />
    </Modal>
  );
}

export default function ApprovalQueuePage() {
  const [rejectTarget, setRejectTarget] = useState(null);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['workflow-approvals', 'pending'],
    queryFn: () => workflowApi.get('/workflow/approvals', { params: { page_size: 100 } }).then((r) => r.data),
  });

  const { data: stats } = useQuery({
    queryKey: ['workflow-approvals', 'stats'],
    queryFn: () => workflowApi.get('/workflow/approvals/stats').then((r) => r.data),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['workflow-approvals'] });
    qc.invalidateQueries({ queryKey: ['workflow-tasks'] });
  };

  const approveMutation = useMutation({
    mutationFn: (id) => workflowApi.post(`/workflow/approvals/${id}/approve`, {}),
    onSuccess: () => {
      message.success('Task approved and completed');
      invalidate();
    },
    onError: (err) => message.error(err.response?.data?.error?.message || 'Failed'),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, review_notes }) => workflowApi.post(`/workflow/approvals/${id}/reject`, { review_notes }),
    onSuccess: () => {
      message.success('Sent back with feedback');
      invalidate();
    },
    onError: (err) => message.error(err.response?.data?.error?.message || 'Failed'),
  });

  const approvals = data?.items || [];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 0 }}>Approval Queue</Title>
      <Text type="secondary">{approvals.length} pending completion requests</Text>

      {stats && (
        <Row gutter={12} style={{ margin: '16px 0' }}>
          {[
            ['Pending', stats.pending],
            ['Approved', stats.approved],
            ['Rejected', stats.rejected],
            ['My requests', stats.my_requests],
          ].map(([label, value]) => (
            <Col key={label} span={6}>
              <Card size="small">
                <Statistic title={label} value={value} />
              </Card>
            </Col>
          ))}
        </Row>
      )}

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <Spin size="large" />
        </div>
      ) : approvals.length === 0 ? (
        <Card style={{ marginTop: 16 }}>
          <Empty description="All clear — no pending approvals" />
        </Card>
      ) : (
        <Space direction="vertical" style={{ width: '100%', marginTop: 8 }}>
          {approvals.map((approval) => (
            <Card key={approval.id} size="small">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <Space wrap style={{ marginBottom: 6 }}>
                    <Tag color="purple">Approval Pending</Tag>
                    {approval.round > 1 && <Tag color="orange">Round #{approval.round}</Tag>}
                  </Space>
                  <div style={{ fontSize: 13, marginBottom: 4 }}>
                    Task ID: <Text code>{approval.task_id}</Text>
                  </div>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Requested {formatDistanceToNow(new Date(approval.requested_at), { addSuffix: true })}
                  </Text>
                  {approval.request_notes && (
                    <Paragraph italic style={{ marginTop: 8, marginBottom: 0 }}>
                      "{approval.request_notes}"
                    </Paragraph>
                  )}
                </div>
                <Space>
                  <Button danger icon={<CloseOutlined />} onClick={() => setRejectTarget(approval.id)}>
                    Reject
                  </Button>
                  <Button
                    type="primary"
                    icon={<CheckOutlined />}
                    loading={approveMutation.isPending}
                    onClick={() => approveMutation.mutate(approval.id)}
                  >
                    Approve
                  </Button>
                </Space>
              </div>
            </Card>
          ))}
        </Space>
      )}

      <RejectModal
        approvalId={rejectTarget}
        onClose={() => setRejectTarget(null)}
        onConfirm={(review_notes) => {
          rejectMutation.mutate({ id: rejectTarget, review_notes });
          setRejectTarget(null);
        }}
      />
    </div>
  );
}
