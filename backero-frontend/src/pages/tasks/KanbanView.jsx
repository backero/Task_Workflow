import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  PlusOutlined, CloseOutlined, CheckOutlined, PlayCircleFilled, SendOutlined,
  RedoOutlined, UserOutlined, ExclamationCircleFilled, CalendarOutlined,
} from '@ant-design/icons';
import { Button, Empty, Input, Modal, Progress, Select, Spin, Tabs, Tag, Typography } from 'antd';
import api from '../../api/axios';
import { useAuthStore } from '../../store/useAuthStore';
import { format, isPast, isToday, formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';
import TaskForm from './TaskForm';

const { Text, Title, Paragraph } = Typography;

const COLUMNS = [
  { key: 'Pending',          label: 'Pending',          bg: 'rgba(15,23,42,0.04)', dot: '#94a3b8' },
  { key: 'Assigned',         label: 'Assigned',          bg: 'rgba(59,130,246,0.06)', dot: '#3b82f6' },
  { key: 'In Progress',      label: 'In Progress',       bg: 'rgba(234,179,8,0.07)',  dot: '#eab308' },
  { key: 'Approval Pending', label: 'Under Review',      bg: 'rgba(249,115,22,0.07)', dot: '#f97316' },
  { key: 'Completed',        label: 'Completed',         bg: 'rgba(34,197,94,0.07)',  dot: '#22c55e' },
  { key: 'Achieved',         label: '🏆 Achieved',        bg: 'rgba(245,158,11,0.07)', dot: '#f59e0b' },
];

const PRIORITY_BORDER = {
  critical: '#ef4444', urgent: '#f87171', high: '#f97316', medium: '#eab308', low: '#d1d5db',
};

const PRIORITY_TAG = {
  critical: 'red', urgent: 'volcano', high: 'orange', medium: 'gold', low: 'default',
};

const STATUS_TAG = {
  Assigned: 'blue', 'In Progress': 'gold', 'Approval Pending': 'orange', Completed: 'green', Pending: 'default',
};

const DEPARTMENTS = ['Marketing', 'Marketplace', 'Sales', 'Production', 'R&D', 'Operations', 'Accounts & Finance'];

// ─────────────────────────────────────────────────────────────────────────────
// Task Detail Modal
// ─────────────────────────────────────────────────────────────────────────────
function TaskDetailModal({ taskId, onClose }) {
  const { user, isManagerOrAbove } = useAuthStore();
  const qc = useQueryClient();
  const [updateText, setUpdateText] = useState('');
  const [progress, setProgress] = useState('');
  const [approvalNotes, setApprovalNotes] = useState('');
  const [showRejectBox, setShowRejectBox] = useState(false);
  const [activeTab, setActiveTab] = useState('updates');

  const { data, isLoading } = useQuery({
    queryKey: ['task-detail', taskId],
    queryFn: () => api.get(`/tasks/${taskId}`).then((r) => r.data.task),
    enabled: !!taskId,
    staleTime: 10_000,
  });

  const task = data;

  const { data: approvalsData } = useQuery({
    queryKey: ['task-approvals', taskId],
    queryFn: () => api.get(`/tasks/${taskId}/approvals`).then((r) => r.data.approvals),
    enabled: !!taskId && task?.status === 'Approval Pending',
  });
  const pendingApproval = (approvalsData || []).find((a) => a.status === 'pending');

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['task-detail', taskId] });
    qc.invalidateQueries({ queryKey: ['tasks'] });
    qc.invalidateQueries({ queryKey: ['task-approvals', taskId] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const startMutation = useMutation({
    mutationFn: () => api.post(`/tasks/${taskId}/start`),
    onSuccess: () => { toast.success('Task started — moved to In Progress'); invalidate(); },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ content, progress: p }) =>
      api.post(`/tasks/${taskId}/daily-update`, { content, progress: p || undefined }),
    onSuccess: () => {
      toast.success('Update posted');
      setUpdateText('');
      setProgress('');
      invalidate();
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const requestCompletionMutation = useMutation({
    mutationFn: () => api.post(`/tasks/${taskId}/request-completion`, { notes: updateText || 'Requesting approval' }),
    onSuccess: () => {
      toast.success('Completion request submitted — waiting for manager review');
      setUpdateText('');
      invalidate();
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const approveMutation = useMutation({
    mutationFn: ({ approvalId, notes }) => api.post(`/approvals/${approvalId}/approve`, { reviewNotes: notes }),
    onSuccess: () => { toast.success('Task approved and marked Completed!'); invalidate(); },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ approvalId, notes }) => api.post(`/approvals/${approvalId}/reject`, { reviewNotes: notes }),
    onSuccess: () => {
      toast.success('Changes requested — task moved back to In Progress');
      setShowRejectBox(false);
      setApprovalNotes('');
      invalidate();
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const isAssignee = task?.assignedTo?._id === user?._id;
  const userLevel = { super_admin: 7, chairman: 6, founder: 5, admin: 4, manager: 3, team_lead: 2, member: 1 }[user?.role] || 1;
  const canManage = isManagerOrAbove() && (userLevel >= 4 || !user?.department || task?.department === user?.department);

  const dueDate = task?.dueDate ? new Date(task.dueDate) : null;
  const isOverdue = dueDate && isPast(dueDate) && task.status !== 'Completed';
  const isDueToday = dueDate && isToday(dueDate);

  const dailyUpdates = (task?.comments || []).filter((c) => c.type === 'daily_update');
  const activityLog = task?.activity || [];

  return (
    <Modal open={!!taskId} onCancel={onClose} footer={null} width={720} styles={{ body: { maxHeight: '80vh', overflowY: 'auto' } }}>
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
      ) : task ? (
        <div>
          <div style={{ marginBottom: 8 }}>
            <Text type="secondary" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>{task.department}</Text>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2, flexWrap: 'wrap' }}>
              <Tag color={PRIORITY_TAG[task.priority]}>{task.priority}</Tag>
              <Tag color={STATUS_TAG[task.status] || 'default'}>{task.status}</Tag>
              {isOverdue && <Tag color="red" icon={<ExclamationCircleFilled />}>Overdue</Tag>}
            </div>
          </div>
          <Title level={4} style={{ marginTop: 4 }}>{task.title}</Title>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13, padding: '12px 0', borderTop: '1px solid rgba(15,23,42,0.06)', borderBottom: '1px solid rgba(15,23,42,0.06)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <UserOutlined style={{ color: '#94a3b8' }} />
              <Text type="secondary">Assigned to:</Text>
              <Text strong>{task.assignedTo ? `${task.assignedTo.firstName} ${task.assignedTo.lastName}` : '—'}</Text>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <UserOutlined style={{ color: '#94a3b8' }} />
              <Text type="secondary">By:</Text>
              <Text strong>{task.assignedBy ? `${task.assignedBy.firstName} ${task.assignedBy.lastName}` : '—'}</Text>
            </div>
            {dueDate && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: isOverdue ? '#dc2626' : isDueToday ? '#ea580c' : undefined }}>
                <CalendarOutlined />
                <Text type="secondary">Due:</Text>
                <Text strong>{format(dueDate, 'dd MMM yyyy')}{isDueToday ? ' (Today)' : isOverdue ? ' (Overdue)' : ''}</Text>
              </div>
            )}
            {task.platform && (
              <div><Text type="secondary">Platform: </Text><Text strong>{task.platform}</Text></div>
            )}
          </div>

          {task.description && <Paragraph style={{ margin: '12px 0' }} type="secondary">{task.description}</Paragraph>}

          <div style={{ margin: '12px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>Progress</Text>
              <Text strong style={{ fontSize: 12 }}>{task.progress || 0}%</Text>
            </div>
            <Progress percent={task.progress || 0} showInfo={false} />
          </div>

          {/* Status-specific action panel */}
          <div style={{ padding: '16px 0', borderBottom: '1px solid rgba(15,23,42,0.06)' }}>
            {task.status === 'Assigned' && isAssignee && (
              <div style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 12, padding: 16 }}>
                <Text strong style={{ display: 'block', marginBottom: 10, color: '#1e40af' }}>Ready to start this task?</Text>
                <Button type="primary" icon={<PlayCircleFilled />} loading={startMutation.isPending} onClick={() => startMutation.mutate()}>
                  Start Working
                </Button>
              </div>
            )}

            {task.status === 'In Progress' && isAssignee && (
              <div>
                <Text strong style={{ display: 'block', marginBottom: 8 }}>Post a progress update</Text>
                <Input.TextArea
                  value={updateText}
                  onChange={(e) => setUpdateText(e.target.value)}
                  placeholder="What did you work on? Any blockers?"
                  rows={3}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                    <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>Progress %</Text>
                    <Input type="number" min={0} max={100} value={progress} onChange={(e) => setProgress(e.target.value)} placeholder={String(task.progress || 0)} style={{ width: 90 }} />
                  </div>
                  <Button icon={<SendOutlined />} loading={updateMutation.isPending} disabled={!updateText.trim()} onClick={() => updateMutation.mutate({ content: updateText, progress })}>
                    Post Update
                  </Button>
                  <Button type="primary" icon={<CheckOutlined />} loading={requestCompletionMutation.isPending} onClick={() => requestCompletionMutation.mutate()}>
                    Request Completion
                  </Button>
                </div>
              </div>
            )}

            {task.status === 'Approval Pending' && canManage && pendingApproval && (
              <div style={{ background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.2)', borderRadius: 12, padding: 16 }}>
                <Text strong style={{ color: '#9a3412' }}>Completion requested by {task.assignedTo?.firstName}</Text>
                {pendingApproval.requestNotes && (
                  <Paragraph italic type="secondary" style={{ fontSize: 12, marginTop: 4, marginBottom: 12 }}>"{pendingApproval.requestNotes}"</Paragraph>
                )}
                {showRejectBox ? (
                  <div>
                    <Input.TextArea value={approvalNotes} onChange={(e) => setApprovalNotes(e.target.value)} placeholder="Explain what changes are needed…" rows={3} />
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <Button danger icon={<RedoOutlined />} loading={rejectMutation.isPending} disabled={!approvalNotes.trim()} onClick={() => rejectMutation.mutate({ approvalId: pendingApproval._id, notes: approvalNotes })}>
                        Request Changes
                      </Button>
                      <Button onClick={() => setShowRejectBox(false)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button type="primary" icon={<CheckOutlined />} loading={approveMutation.isPending} onClick={() => approveMutation.mutate({ approvalId: pendingApproval._id, notes: '' })}>
                      Approve &amp; Complete
                    </Button>
                    <Button danger icon={<RedoOutlined />} onClick={() => setShowRejectBox(true)}>Request Changes</Button>
                  </div>
                )}
              </div>
            )}

            {task.status === 'Completed' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#16a34a' }}>
                <CheckOutlined />
                <Text strong style={{ color: 'inherit' }}>
                  Completed {task.completedAt ? formatDistanceToNow(new Date(task.completedAt), { addSuffix: true }) : ''}
                </Text>
              </div>
            )}

            {task.status === 'Pending' && canManage && (
              <Text type="secondary" italic>This task is not yet assigned to anyone.</Text>
            )}
          </div>

          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            style={{ marginTop: 12 }}
            items={[
              {
                key: 'updates',
                label: `Updates${dailyUpdates.length ? ` (${dailyUpdates.length})` : ''}`,
                children: dailyUpdates.length === 0 ? (
                  <Text type="secondary" style={{ display: 'block', textAlign: 'center', padding: 24 }}>No updates posted yet</Text>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {[...dailyUpdates].reverse().map((upd, i) => (
                      <div key={upd._id || i} style={{ background: 'rgba(15,23,42,0.03)', borderRadius: 10, padding: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                          <Text strong style={{ fontSize: 12 }}>{upd.author?.firstName} {upd.author?.lastName}</Text>
                          <div style={{ display: 'flex', gap: 10 }}>
                            {upd.progress !== undefined && <Text style={{ fontSize: 12, color: '#a8781f', fontWeight: 600 }}>{upd.progress}%</Text>}
                            <Text type="secondary" style={{ fontSize: 12 }}>{upd.createdAt ? formatDistanceToNow(new Date(upd.createdAt), { addSuffix: true }) : ''}</Text>
                          </div>
                        </div>
                        <Text style={{ fontSize: 13 }}>{upd.content}</Text>
                      </div>
                    ))}
                  </div>
                ),
              },
              {
                key: 'activity',
                label: 'Activity Log',
                children: activityLog.length === 0 ? (
                  <Text type="secondary" style={{ display: 'block', textAlign: 'center', padding: 24 }}>No activity yet</Text>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {[...activityLog].reverse().map((act, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12, color: '#6b6155' }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#d1d5db', marginTop: 5, flexShrink: 0 }} />
                        <span>
                          <Text strong style={{ fontSize: 12, textTransform: 'capitalize' }}>
                            {typeof act.action === 'string' ? act.action.replace(/_/g, ' ') : act.action}
                          </Text>
                          {act.performedBy && <span> by {act.performedBy.firstName} {act.performedBy.lastName}</span>}
                          {act.createdAt && <span> · {formatDistanceToNow(new Date(act.createdAt), { addSuffix: true })}</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                ),
              },
            ]}
          />
        </div>
      ) : (
        <Text type="secondary">Task not found</Text>
      )}
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Task Card
// ─────────────────────────────────────────────────────────────────────────────
function TaskCard({ task, onClick }) {
  const dueDate = task.dueDate ? new Date(task.dueDate) : null;
  const isOverdue = dueDate && isPast(dueDate) && task.status !== 'Completed';
  const isDueToday = dueDate && isToday(dueDate);

  return (
    <div
      onClick={onClick}
      style={{
        background: '#fbfaf7',
        borderRadius: 10,
        border: '1px solid rgba(15,23,42,0.08)',
        borderInlineStart: `3px solid ${PRIORITY_BORDER[task.priority] || '#e5e7eb'}`,
        padding: 12,
        marginBottom: 8,
        cursor: 'pointer',
        boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
        <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 }} ellipsis>{task.department}</Text>
        {task.platform && <Tag color="orange" style={{ fontSize: 10, marginInlineEnd: 0 }}>{task.platform}</Tag>}
      </div>

      <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>{task.title}</Text>

      {task.progress > 0 && (
        <Progress percent={task.progress} showInfo={false} size="small" style={{ marginBottom: 8 }} />
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {task.assignedTo && (
            <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(168,120,31,0.12)', color: '#a8781f', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {task.assignedTo.firstName?.[0]}
            </span>
          )}
          {dueDate && (
            <Text style={{ fontSize: 11, color: isOverdue ? '#dc2626' : isDueToday ? '#ea580c' : '#94a3b8', fontWeight: isOverdue || isDueToday ? 600 : 400 }}>
              {isOverdue ? '⚠ Overdue' : isDueToday ? 'Due Today' : format(dueDate, 'dd MMM')}
            </Text>
          )}
        </div>
        <Tag color={PRIORITY_TAG[task.priority]} style={{ fontSize: 10, marginInlineEnd: 0 }}>{task.priority}</Tag>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// KanbanView
// ─────────────────────────────────────────────────────────────────────────────
export default function KanbanView() {
  const [showForm, setShowForm] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [department, setDepartment] = useState('');
  const { isManagerOrAbove } = useAuthStore();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['tasks', { department }],
    queryFn: () =>
      api.get('/tasks', { params: { limit: 200, department: department || undefined } }).then((r) => r.data),
  });

  const tasks = data?.data || [];
  const grouped = COLUMNS.reduce((acc, col) => {
    acc[col.key] = tasks.filter((t) => t.status === col.key);
    return acc;
  }, {});

  return (
    <div className="h-full flex flex-col">
      <div className="page-header flex-shrink-0">
        <div>
          <Title level={4} style={{ marginBottom: 0 }}>Kanban Board</Title>
          <Text type="secondary">{tasks.length} tasks total</Text>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Select
            value={department || undefined}
            onChange={(v) => setDepartment(v || '')}
            allowClear
            placeholder="All Departments"
            style={{ width: 180 }}
            options={DEPARTMENTS.map((d) => ({ label: d, value: d }))}
          />
          {isManagerOrAbove() && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setShowForm(true)}>New Task</Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4 flex-1 min-h-0">
          {COLUMNS.map((col) => (
            <div key={col.key} style={{ flexShrink: 0, width: 288, display: 'flex', flexDirection: 'column' }}>
              <div style={{ background: col.bg, borderRadius: 12, padding: 12, flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: col.dot, flexShrink: 0 }} />
                  <Text strong style={{ fontSize: 13 }}>{col.label}</Text>
                  <Tag style={{ marginInlineStart: 'auto', marginInlineEnd: 0 }}>{grouped[col.key]?.length || 0}</Tag>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', minHeight: 120 }}>
                  <AnimatePresence>
                    {(grouped[col.key] || []).map((task) => (
                      <motion.div
                        key={task._id}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        layout
                      >
                        <TaskCard task={task} onClick={() => setSelectedTaskId(task._id)} />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  {(grouped[col.key] || []).length === 0 && (
                    <Empty description="No tasks" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ marginTop: 24 }} />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <TaskDetailModal taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} />

      {showForm && (
        <TaskForm
          onClose={() => setShowForm(false)}
          onSuccess={() => {
            setShowForm(false);
            qc.invalidateQueries({ queryKey: ['tasks'] });
          }}
        />
      )}
    </div>
  );
}
