import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  CheckOutlined, CloseOutlined, ClockCircleOutlined, MessageOutlined,
  CalendarOutlined, CheckCircleFilled, StopFilled,
} from '@ant-design/icons';
import { Button, Card, Col, Empty, Input, Modal, Row, Spin, Statistic, Tabs, Tag, Typography } from 'antd';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { formatDistanceToNow, format } from 'date-fns';
import { useAuthStore } from '../../store/useAuthStore';

const { Text, Title, Paragraph } = Typography;

const PRIORITY_TAG = { critical: 'red', urgent: 'volcano', high: 'orange', medium: 'gold', low: 'default' };

function ApprovalModal({ approval, onApprove, onReject, onClose }) {
  const [notes, setNotes] = useState('');
  const [action, setAction] = useState(null);

  const { data: taskDetail } = useQuery({
    queryKey: ['task-detail-approval', approval.taskId?._id],
    queryFn: () => api.get(`/tasks/${approval.taskId?._id}`).then((r) => r.data.task),
    enabled: !!approval.taskId?._id,
  });

  const dailyUpdates = (taskDetail?.comments || []).filter((c) => c.type === 'daily_update');

  const handleAction = () => {
    if (!action) return;
    if (action === 'reject' && !notes.trim()) return toast.error('Rejection reason is required');
    if (action === 'approve') onApprove(approval._id, notes);
    if (action === 'reject') onReject(approval._id, notes);
    onClose();
  };

  return (
    <Modal open onCancel={onClose} title="Review Task Completion" footer={null} width={600} styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}>
      <div style={{ marginBottom: 16 }}>
        <Text strong>{approval.taskId?.title}</Text>
        {approval.taskId?.description && <Paragraph type="secondary" style={{ fontSize: 13, marginTop: 4 }}>{approval.taskId?.description}</Paragraph>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13, marginBottom: 16 }}>
        <div><Text type="secondary">Requested by</Text><br /><Text strong>{approval.requestedBy?.firstName} {approval.requestedBy?.lastName}</Text></div>
        <div><Text type="secondary">Department</Text><br /><Text strong>{approval.taskId?.department}</Text></div>
        <div><Text type="secondary">Progress</Text><br /><Text strong>{approval.taskId?.progress || 0}%</Text></div>
        {approval.round > 1 && (
          <div><Text type="secondary">Submission Round</Text><br /><Text strong style={{ color: '#ea580c' }}>#{approval.round} (resubmitted)</Text></div>
        )}
      </div>

      {approval.requestNotes && (
        <div style={{ padding: 12, borderRadius: 10, background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)', marginBottom: 16 }}>
          <Text strong style={{ fontSize: 12, color: '#1d4ed8', display: 'block', marginBottom: 4 }}>Employee's completion notes</Text>
          <Text style={{ fontSize: 13 }}>{approval.requestNotes}</Text>
        </div>
      )}

      {dailyUpdates.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
            <MessageOutlined /> Daily Work Log ({dailyUpdates.length} updates)
          </Text>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 190, overflowY: 'auto' }}>
            {dailyUpdates.map((upd, i) => (
              <div key={upd._id || i} style={{ padding: 10, borderRadius: 8, background: 'rgba(15,23,42,0.03)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text strong style={{ fontSize: 12 }}>{upd.author?.firstName} {upd.author?.lastName}</Text>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {upd.hoursWorked > 0 && <Text type="secondary" style={{ fontSize: 11 }}><ClockCircleOutlined /> {upd.hoursWorked}h</Text>}
                    {upd.progress !== undefined && <Text style={{ fontSize: 11, color: '#a8781f', fontWeight: 600 }}>{upd.progress}%</Text>}
                    <Text type="secondary" style={{ fontSize: 11 }}>{upd.createdAt ? formatDistanceToNow(new Date(upd.createdAt), { addSuffix: true }) : ''}</Text>
                  </div>
                </div>
                <Text style={{ fontSize: 12 }}>{upd.content}</Text>
              </div>
            ))}
          </div>
        </div>
      )}

      <label className="label">
        Review Notes {action === 'reject' && <span style={{ color: '#dc2626' }}>*</span>}
      </label>
      <Input.TextArea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder={action === 'reject' ? 'Explain what needs to be corrected...' : 'Optional approval notes...'} />

      <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
        <Button danger={action === 'reject'} type={action === 'reject' ? 'primary' : 'default'} block icon={<CloseOutlined />} onClick={() => setAction('reject')}>Reject</Button>
        <Button type={action === 'approve' ? 'primary' : 'default'} block icon={<CheckOutlined />} onClick={() => setAction('approve')} style={action === 'approve' ? { background: '#16a34a', borderColor: '#16a34a' } : {}}>Approve</Button>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
        <Button onClick={onClose} block>Cancel</Button>
        <Button type="primary" disabled={!action} onClick={handleAction} block>Confirm</Button>
      </div>
    </Modal>
  );
}

function RejectPrompt({ onConfirm, onCancel }) {
  const [notes, setNotes] = useState('');
  return (
    <Modal open onCancel={onCancel} title="Reject & Send Feedback" footer={null} width={420}>
      <Text type="secondary" style={{ fontSize: 13 }}>Provide a reason so the employee knows what to fix.</Text>
      <Input.TextArea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="What needs to be corrected or improved?" autoFocus style={{ margin: '12px 0' }} />
      <div style={{ display: 'flex', gap: 10 }}>
        <Button onClick={onCancel} block>Cancel</Button>
        <Button danger type="primary" block onClick={() => { if (!notes.trim()) return toast.error('Reason is required'); onConfirm(notes); }}>Send Back</Button>
      </div>
    </Modal>
  );
}

const ROLE_LEVEL = { super_admin: 7, chairman: 6, founder: 5, admin: 4, manager: 3, team_lead: 2, member: 1 };

function canUserApprove(approval, currentUser) {
  if (!currentUser || !approval) return false;
  const approverLevel = ROLE_LEVEL[currentUser.role] || 0;
  const submitterLevel = ROLE_LEVEL[approval.requestedBy?.role] || 0;
  if (approverLevel < ROLE_LEVEL['manager']) return false;
  const isAssigner = approval.taskId?.assignedBy?._id?.toString() === currentUser._id?.toString();
  if (submitterLevel >= ROLE_LEVEL['manager']) return isAssigner || approverLevel >= ROLE_LEVEL['admin'];
  return true;
}

function approverLabel(approval) {
  const submitterLevel = ROLE_LEVEL[approval.requestedBy?.role] || 0;
  const ab = approval.taskId?.assignedBy;
  const name = ab ? `${ab.firstName} ${ab.lastName}` : '—';
  if (submitterLevel >= ROLE_LEVEL['manager'] && !ab) return { text: 'Requires Admin Approval', color: 'red' };
  return { text: `Approver: ${name}`, color: 'blue' };
}

export default function ApprovalQueue() {
  const [selected, setSelected] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [activeTab, setActiveTab] = useState('completions');
  const { user: currentUser, isManagerOrAbove } = useAuthStore();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['approvals'],
    queryFn: () => api.get('/approvals').then((r) => r.data),
    refetchInterval: 5 * 60 * 1000,
  });

  const { data: statsData } = useQuery({
    queryKey: ['approvals', 'stats'],
    queryFn: () => api.get('/approvals/stats').then((r) => r.data.stats),
  });

  const { data: extData, isLoading: extLoading } = useQuery({
    queryKey: ['extension-requests'],
    queryFn: () => api.get('/tasks/extension-requests').then((r) => r.data),
    refetchInterval: 5 * 60 * 1000,
    enabled: isManagerOrAbove(),
  });

  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ['approvals', 'history'],
    queryFn: async () => {
      const [approved, rejected] = await Promise.all([
        api.get('/approvals?status=approved&limit=100').then((r) => r.data.data || []),
        api.get('/approvals?status=rejected&limit=100').then((r) => r.data.data || []),
      ]);
      return [...approved, ...rejected].sort((a, b) => new Date(b.reviewedAt) - new Date(a.reviewedAt));
    },
    enabled: activeTab === 'history',
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, notes }) => api.post(`/approvals/${id}/approve`, { reviewNotes: notes }),
    onSuccess: () => {
      toast.success('Task approved!');
      qc.invalidateQueries({ queryKey: ['approvals'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, notes }) => api.post(`/approvals/${id}/reject`, { reviewNotes: notes }),
    onSuccess: () => {
      toast.success('Task returned with feedback');
      qc.invalidateQueries({ queryKey: ['approvals'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  });

  const reviewExtensionMutation = useMutation({
    mutationFn: ({ taskId, reqId, status }) => api.patch(`/tasks/${taskId}/extension-request/${reqId}`, { status }),
    onSuccess: (_, vars) => {
      toast.success(`Extension request ${vars.status}`);
      qc.invalidateQueries({ queryKey: ['extension-requests'] });
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  });

  const handleRejectConfirm = (notes) => {
    if (!rejectTarget) return;
    rejectMutation.mutate({ id: rejectTarget, notes });
    setRejectTarget(null);
  };

  const approvals = data?.data || [];
  const extensionTasks = extData?.tasks || [];
  const totalExtensions = extensionTasks.reduce((n, t) => n + t.extensionRequests.length, 0);

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <Title level={4} style={{ marginBottom: 0 }}>Approval Queue</Title>
          <Text type="secondary">{approvals.length} completions · {totalExtensions} extensions pending</Text>
        </div>
      </div>

      {statsData && (
        <Row gutter={12}>
          {[
            { label: 'Pending', value: statsData.pending, color: '#ea580c', tab: 'completions' },
            { label: 'Approved', value: statsData.approved, color: '#16a34a', tab: 'history' },
            { label: 'Rejected', value: statsData.rejected, color: '#dc2626', tab: 'history' },
            { label: 'My Requests', value: statsData.myRequests, color: '#2563eb', tab: null },
          ].map((s) => (
            <Col span={6} key={s.label}>
              <Card size="small" hoverable={!!s.tab} onClick={() => s.tab && setActiveTab(s.tab)} style={{ textAlign: 'center', cursor: s.tab ? 'pointer' : 'default' }}>
                <Statistic value={s.value} title={s.label} valueStyle={{ color: s.color, fontWeight: 700 }} />
              </Card>
            </Col>
          ))}
        </Row>
      )}

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          { key: 'completions', label: `Completion Requests (${approvals.length})` },
          { key: 'extensions', label: `Extension Requests (${totalExtensions})` },
          { key: 'history', label: `History (${(statsData?.approved || 0) + (statsData?.rejected || 0)})` },
        ]}
      />

      {activeTab === 'completions' && (
        isLoading ? (
          <div style={{ textAlign: 'center', padding: 48 }}><Spin size="large" /></div>
        ) : approvals.length === 0 ? (
          <Card><Empty description="No pending approvals" image={<CheckCircleFilled style={{ fontSize: 48, color: '#4ade80' }} />} /></Card>
        ) : (
          <div className="space-y-3">
            {approvals.map((approval) => (
              <motion.div key={approval._id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}>
                <Card size="small">
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                        <Tag color={PRIORITY_TAG[approval.taskId?.priority]}>{approval.taskId?.priority}</Tag>
                        <Tag color="purple">Approval Pending</Tag>
                        <Text type="secondary" style={{ fontSize: 12 }}>{approval.taskId?.department}</Text>
                        {approval.round > 1 && <Text style={{ fontSize: 12, color: '#ea580c', fontWeight: 600 }}>Round #{approval.round}</Text>}
                      </div>
                      <Text strong>{approval.taskId?.title}</Text>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 8, flexWrap: 'wrap', fontSize: 13 }}>
                        <Text type="secondary">Submitted by: <Text strong>{approval.requestedBy?.firstName} {approval.requestedBy?.lastName}</Text> <Text type="secondary" style={{ fontSize: 11 }}>({approval.requestedBy?.role})</Text></Text>
                        <Text type="secondary" style={{ fontSize: 12 }}><ClockCircleOutlined /> {formatDistanceToNow(new Date(approval.requestedAt), { addSuffix: true })}</Text>
                      </div>
                      {(() => { const lbl = approverLabel(approval); return <Tag color={lbl.color} style={{ marginTop: 8 }}>{lbl.text}</Tag>; })()}
                      {approval.requestNotes && <Paragraph italic ellipsis={{ rows: 2 }} type="secondary" style={{ fontSize: 13, marginTop: 8, marginBottom: 0 }}>"{approval.requestNotes}"</Paragraph>}
                    </div>
                    {canUserApprove(approval, currentUser) ? (
                      <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'flex-start' }}>
                        <Button danger size="small" icon={<CloseOutlined />} onClick={() => setRejectTarget(approval._id)}>Reject</Button>
                        <Button size="small" onClick={() => setSelected(approval)}>Review</Button>
                        <Button type="primary" size="small" icon={<CheckOutlined />} style={{ background: '#16a34a', borderColor: '#16a34a' }} onClick={() => approveMutation.mutate({ id: approval._id, notes: '' })}>Approve</Button>
                      </div>
                    ) : isManagerOrAbove() && (
                      <Text type="secondary" italic style={{ fontSize: 12, flexShrink: 0 }}>Not your task to approve</Text>
                    )}
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        )
      )}

      {activeTab === 'extensions' && (
        extLoading ? (
          <div style={{ textAlign: 'center', padding: 48 }}><Spin size="large" /></div>
        ) : extensionTasks.length === 0 ? (
          <Card><Empty description="No team members have requested deadline extensions" image={<CalendarOutlined style={{ fontSize: 48, color: '#d1d5db' }} />} /></Card>
        ) : (
          <div className="space-y-3">
            {extensionTasks.map((task) =>
              task.extensionRequests.map((ext) => (
                <motion.div key={ext._id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}>
                  <Card size="small" style={{ borderInlineStart: '4px solid #fb923c' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                          <Tag color={PRIORITY_TAG[task.priority]}>{task.priority}</Tag>
                          <Tag color="orange">Extension Requested</Tag>
                          <Text type="secondary" style={{ fontSize: 12 }}>{task.department}</Text>
                        </div>
                        <Text strong>{task.title}</Text>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 8, flexWrap: 'wrap', fontSize: 13 }}>
                          <Text type="secondary">By: <Text strong>{(ext.requestedBy?.firstName || task.assignedTo?.firstName)} {(ext.requestedBy?.lastName || task.assignedTo?.lastName)}</Text></Text>
                          {task.dueDate && <Text style={{ color: '#dc2626', fontSize: 12 }}><ClockCircleOutlined /> Current: {format(new Date(task.dueDate), 'dd MMM yyyy')}</Text>}
                          {ext.requestedDueDate && <Text style={{ color: '#16a34a', fontSize: 12 }}><CalendarOutlined /> Requested: {format(new Date(ext.requestedDueDate), 'dd MMM yyyy')}</Text>}
                        </div>
                        {ext.reason && <Paragraph italic type="secondary" style={{ fontSize: 13, marginTop: 8, marginBottom: 0 }}>"{ext.reason}"</Paragraph>}
                        <Text type="secondary" style={{ fontSize: 11 }}>Requested {ext.requestedAt ? formatDistanceToNow(new Date(ext.requestedAt), { addSuffix: true }) : ''}</Text>
                      </div>
                      {isManagerOrAbove() && (
                        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                          <Button danger size="small" icon={<CloseOutlined />} loading={reviewExtensionMutation.isPending} onClick={() => reviewExtensionMutation.mutate({ taskId: task._id, reqId: ext._id, status: 'rejected' })}>Reject</Button>
                          <Button type="primary" size="small" icon={<CheckOutlined />} style={{ background: '#16a34a', borderColor: '#16a34a' }} loading={reviewExtensionMutation.isPending} onClick={() => reviewExtensionMutation.mutate({ taskId: task._id, reqId: ext._id, status: 'approved' })}>Approve</Button>
                        </div>
                      )}
                    </div>
                  </Card>
                </motion.div>
              ))
            )}
          </div>
        )
      )}

      {activeTab === 'history' && (
        historyLoading ? (
          <div style={{ textAlign: 'center', padding: 48 }}><Spin size="large" /></div>
        ) : !historyData?.length ? (
          <Card><Empty description="Approved and rejected approvals will appear here" image={<CheckCircleFilled style={{ fontSize: 48, color: '#d1d5db' }} />} /></Card>
        ) : (
          <div className="space-y-3">
            {historyData.map((approval) => {
              const isApproved = approval.status === 'approved';
              return (
                <motion.div key={approval._id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}>
                  <Card size="small" style={{ borderInlineStart: `4px solid ${isApproved ? '#22c55e' : '#ef4444'}` }}>
                    <div style={{ display: 'flex', gap: 12 }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: isApproved ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                        {isApproved ? <CheckCircleFilled style={{ color: '#16a34a' }} /> : <StopFilled style={{ color: '#dc2626' }} />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                          <Tag color={isApproved ? 'green' : 'red'}>{isApproved ? 'Approved' : 'Rejected'}</Tag>
                          <Tag color={PRIORITY_TAG[approval.taskId?.priority]}>{approval.taskId?.priority}</Tag>
                          <Text type="secondary" style={{ fontSize: 12 }}>{approval.taskId?.department}</Text>
                        </div>
                        <Text strong>{approval.taskId?.title}</Text>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 6, flexWrap: 'wrap', fontSize: 13 }}>
                          <Text type="secondary">By: <Text strong>{approval.requestedBy?.firstName} {approval.requestedBy?.lastName}</Text></Text>
                          <Text type="secondary">{isApproved ? 'Approved' : 'Rejected'} by: <Text strong>{approval.reviewedBy?.firstName} {approval.reviewedBy?.lastName}</Text></Text>
                          {approval.reviewedAt && <Text type="secondary" style={{ fontSize: 12 }}><ClockCircleOutlined /> {format(new Date(approval.reviewedAt), 'dd MMM yyyy, hh:mm a')}</Text>}
                        </div>
                        {approval.reviewNotes && (
                          <Paragraph italic style={{ fontSize: 13, marginTop: 8, marginBottom: 0, padding: '6px 10px', borderRadius: 8, background: isApproved ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)' }}>
                            "{approval.reviewNotes}"
                          </Paragraph>
                        )}
                      </div>
                    </div>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        )
      )}

      {selected && (
        <ApprovalModal
          approval={selected}
          onApprove={(id, notes) => approveMutation.mutate({ id, notes })}
          onReject={(id, notes) => rejectMutation.mutate({ id, notes })}
          onClose={() => setSelected(null)}
        />
      )}

      {rejectTarget && (
        <RejectPrompt onConfirm={handleRejectConfirm} onCancel={() => setRejectTarget(null)} />
      )}
    </div>
  );
}
