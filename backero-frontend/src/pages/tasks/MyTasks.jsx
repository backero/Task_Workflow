import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ClockCircleOutlined, CheckCircleFilled, SendOutlined, PlayCircleFilled,
  RedoOutlined, MessageOutlined, ThunderboltOutlined, CalendarOutlined,
  ExclamationCircleFilled, FilterOutlined,
} from '@ant-design/icons';
import { Button, DatePicker, Drawer, Empty, Input, Progress, Segmented, Slider, Spin, Tabs, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import api from '../../api/axios';
import { useAuthStore } from '../../store/useAuthStore';
import { useSocketStore } from '../../store/useSocketStore';
import { format, isPast, isToday, formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';
import TaskTimer from '../../components/tasks/TaskTimer';

const { Text, Title, Paragraph } = Typography;

const STATUS_TAG = {
  Pending: 'default', Assigned: 'blue', 'In Progress': 'gold', 'Under Review': 'purple',
  'Approval Pending': 'purple', 'Changes Requested': 'red', Completed: 'green', Achieved: 'gold', Reopened: 'orange',
};
const PRIORITY_COLOR = { critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#9ca3af', urgent: '#f87171' };

function formatDuration(ms, mode = 'compact') {
  if (!ms || ms < 0) return null;
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (mode === 'clock') {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

function useElapsedMs(startDate, status, completedAt) {
  const [ms, setMs] = useState(() => {
    if (!startDate) return 0;
    if (status === 'In Progress') return Date.now() - new Date(startDate).getTime();
    if (completedAt) return new Date(completedAt).getTime() - new Date(startDate).getTime();
    return 0;
  });
  useEffect(() => {
    if (!startDate || status !== 'In Progress') return;
    const start = new Date(startDate).getTime();
    const id = setInterval(() => setMs(Date.now() - start), 1000);
    return () => clearInterval(id);
  }, [startDate, status]);
  return ms;
}

function TaskTimerBadge({ startDate, status, completedAt }) {
  const ms = useElapsedMs(startDate, status, completedAt);
  if (!ms || ms <= 0) return null;
  return (
    <Tag color={status === 'In Progress' ? 'gold' : 'green'} icon={<ClockCircleOutlined />} style={{ fontFamily: 'monospace' }}>
      {formatDuration(ms, 'compact')}
    </Tag>
  );
}

// ── Task Detail Drawer ────────────────────────────────────────────────────────

function TaskDrawer({ task: initialTask, onClose, onUpdated }) {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const elapsedMs = useElapsedMs(initialTask.startDate, initialTask.status, initialTask.completedAt);

  const [tab, setTab] = useState('updates');
  const [updateText, setUpdateText] = useState('');
  const [progress, setProgress] = useState(initialTask.progress || 0);
  const [hours, setHours] = useState('');
  const [showCompletion, setShowCompletion] = useState(false);
  const [completionNotes, setCompletionNotes] = useState('');
  const [commentText, setCommentText] = useState('');
  const [extDate, setExtDate] = useState(null);
  const [extReason, setExtReason] = useState('');

  const { data: taskData } = useQuery({
    queryKey: ['task-detail', initialTask._id],
    queryFn: () => api.get(`/tasks/${initialTask._id}`).then((r) => r.data.task),
    refetchInterval: 5 * 60 * 1000,
  });
  const task = taskData || initialTask;

  const { data: approvalsData } = useQuery({
    queryKey: ['task-approvals', initialTask._id],
    queryFn: () => api.get(`/tasks/${initialTask._id}/approvals`).then((r) => r.data.approvals),
    enabled: ['Changes Requested', 'Approval Pending', 'Completed'].includes(task.status),
  });

  const lastRejection = approvalsData?.find((a) => a.status === 'rejected' || a.status === 'changes_requested');
  const pendingApproval = approvalsData?.find((a) => a.status === 'pending');

  const updates = (task.comments || []).filter((c) => c.type === 'daily_update');
  const realComments = (task.comments || []).filter((c) => c.type === 'comment');

  const isAssignee = (task.assignedTo?._id || task.assignedTo)?.toString() === user._id?.toString();
  const hasPendingExtension = (task.extensionRequests || []).some((e) => e.status === 'pending');
  const canRequestExtension = isAssignee && !!task.dueDate && !['Completed', 'Cancelled'].includes(task.status);
  const canAct = ['Assigned', 'In Progress', 'Changes Requested', 'Reopened'].includes(task.status);

  useEffect(() => { setProgress(task.progress || 0); }, [task.progress]);

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['task-detail', task._id] });
    qc.invalidateQueries({ queryKey: ['tasks', 'my'] });
    if (onUpdated) onUpdated();
  };

  const startMutation = useMutation({
    mutationFn: () => api.post(`/tasks/${task._id}/start`),
    onSuccess: () => { toast.success('Task started — moved to In Progress'); invalidateAll(); },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  });

  const dailyMutation = useMutation({
    mutationFn: (payload) => api.post(`/tasks/${task._id}/daily-update`, payload),
    onSuccess: (res) => {
      setProgress(res.data.task?.progress ?? progress);
      setUpdateText('');
      setHours('');
      toast.success('Update posted!');
      invalidateAll();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  });

  const completionMutation = useMutation({
    mutationFn: (notes) => api.post(`/tasks/${task._id}/request-completion`, { notes }),
    onSuccess: () => {
      toast.success('Submitted for review!');
      qc.invalidateQueries({ queryKey: ['tasks', 'my'] });
      setShowCompletion(false);
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  });

  const commentMutation = useMutation({
    mutationFn: (content) => api.post(`/tasks/${task._id}/comment`, { content }),
    onSuccess: () => {
      setCommentText('');
      qc.invalidateQueries({ queryKey: ['task-detail', task._id] });
      toast.success('Comment posted');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  });

  const extensionMutation = useMutation({
    mutationFn: (data) => api.post(`/tasks/${task._id}/extension-request`, data),
    onSuccess: () => {
      setExtDate(null);
      setExtReason('');
      qc.invalidateQueries({ queryKey: ['task-detail', task._id] });
      toast.success('Extension request submitted — your manager has been notified');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  });

  const handlePostUpdate = () => {
    if (!updateText.trim()) return toast.error('Please write what you did today');
    dailyMutation.mutate({ content: updateText, progress, hoursWorked: hours ? Number(hours) : undefined });
  };

  const dueDate = task.dueDate ? new Date(task.dueDate) : null;
  const isOverdue = dueDate && isPast(dueDate) && task.status !== 'Completed';
  const minExtDate = dueDate ? dayjs(Math.max(Date.now(), dueDate.getTime()) + 86400000) : dayjs().add(1, 'day');

  const tabItems = [
    {
      key: 'updates',
      label: `Updates (${updates.length})`,
      children: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {updates.length === 0 ? (
            <Empty description="No updates yet — post your first daily update below" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : updates.map((upd, i) => (
            <div key={upd._id || i} style={{ display: 'flex', gap: 10 }}>
              <span style={{ width: 26, height: 26, borderRadius: '50%', background: 'rgba(102,156,44,0.12)', color: '#669c2c', fontSize: 11, fontWeight: 700, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>
                {upd.author?.firstName?.[0]}{upd.author?.lastName?.[0]}
              </span>
              <div style={{ flex: 1, background: 'rgba(15,23,42,0.03)', borderRadius: 10, padding: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text strong style={{ fontSize: 12 }}>{upd.author?.firstName} {upd.author?.lastName}</Text>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {upd.hoursWorked > 0 && <Text type="secondary" style={{ fontSize: 11 }}><ClockCircleOutlined /> {upd.hoursWorked}h</Text>}
                    {upd.progress !== undefined && <Text style={{ fontSize: 11, color: '#669c2c', fontWeight: 600 }}>{upd.progress}%</Text>}
                    <Text type="secondary" style={{ fontSize: 11 }}>{upd.createdAt ? formatDistanceToNow(new Date(upd.createdAt), { addSuffix: true }) : ''}</Text>
                  </div>
                </div>
                <Text style={{ fontSize: 13 }}>{upd.content}</Text>
              </div>
            </div>
          ))}
        </div>
      ),
    },
    {
      key: 'comments',
      label: `Comments (${realComments.length})`,
      children: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {realComments.length === 0 ? (
            <Empty description="No comments yet — start a discussion below" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : realComments.map((c, i) => (
            <div key={c._id || i} style={{ display: 'flex', gap: 10 }}>
              <span style={{ width: 26, height: 26, borderRadius: '50%', background: 'rgba(79,70,229,0.1)', color: '#4f46e5', fontSize: 11, fontWeight: 700, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>
                {c.author?.firstName?.[0]}{c.author?.lastName?.[0]}
              </span>
              <div style={{ flex: 1, background: 'rgba(15,23,42,0.03)', borderRadius: 10, padding: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text strong style={{ fontSize: 12 }}>{c.author?.firstName} {c.author?.lastName}</Text>
                  <Text type="secondary" style={{ fontSize: 11 }}>{c.createdAt ? formatDistanceToNow(new Date(c.createdAt), { addSuffix: true }) : ''}</Text>
                </div>
                <Text style={{ fontSize: 13 }}>{c.content}</Text>
              </div>
            </div>
          ))}
        </div>
      ),
    },
  ];

  if (canRequestExtension) {
    tabItems.push({
      key: 'extension',
      label: hasPendingExtension ? 'Extension ⚠' : 'Extension',
      children: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {(task.extensionRequests || []).length > 0 && (
            <div>
              <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 8 }}>Request History</Text>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(task.extensionRequests || []).map((ext, i) => (
                  <div key={ext._id || i} style={{ padding: 10, borderRadius: 10, border: '1px solid rgba(15,23,42,0.08)', background: ext.status === 'approved' ? 'rgba(34,197,94,0.06)' : ext.status === 'rejected' ? 'rgba(239,68,68,0.06)' : 'rgba(249,115,22,0.06)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Tag color={ext.status === 'approved' ? 'green' : ext.status === 'rejected' ? 'red' : 'orange'} style={{ textTransform: 'uppercase', fontSize: 10 }}>{ext.status}</Tag>
                      <Text type="secondary" style={{ fontSize: 11 }}>{ext.requestedAt ? format(new Date(ext.requestedAt), 'dd MMM') : ''}</Text>
                    </div>
                    <Text style={{ fontSize: 12 }}>Requested deadline: <Text strong>{ext.requestedDueDate ? format(new Date(ext.requestedDueDate), 'dd MMM yyyy') : '—'}</Text></Text>
                    {ext.reason && <Paragraph italic type="secondary" style={{ fontSize: 12, margin: '4px 0 0' }}>"{ext.reason}"</Paragraph>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {hasPendingExtension ? (
            <div style={{ padding: 12, borderRadius: 10, background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.2)' }}>
              <Text style={{ fontSize: 13, color: '#9a3412' }}>You have a pending extension request. Wait for your manager to review it before submitting a new one.</Text>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label className="label">New Requested Deadline</label>
                <DatePicker value={extDate} minDate={minExtDate} onChange={setExtDate} style={{ width: '100%' }} suffixIcon={<CalendarOutlined />} />
              </div>
              <div>
                <label className="label">Reason for Extension</label>
                <Input.TextArea value={extReason} onChange={(e) => setExtReason(e.target.value)} rows={3} placeholder="Explain why you need more time and what's blocking you..." />
              </div>
              <Text type="secondary" style={{ fontSize: 12 }}>Your manager will be notified via WhatsApp and can approve or reject this request.</Text>
              <Button
                type="primary"
                block
                loading={extensionMutation.isPending}
                disabled={!extDate || !extReason.trim()}
                onClick={() => extensionMutation.mutate({ requestedDueDate: extDate.toISOString(), reason: extReason })}
              >
                Submit Extension Request
              </Button>
            </div>
          )}
        </div>
      ),
    });
  }

  return (
    <Drawer
      open
      onClose={onClose}
      width={480}
      title={
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
            <Tag color={STATUS_TAG[task.status] || 'default'}>{task.status}</Tag>
            <Text strong style={{ color: PRIORITY_COLOR[task.priority], fontSize: 12 }}>{task.priority?.toUpperCase()}</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>{task.department}</Text>
          </div>
          <Text strong style={{ fontSize: 15 }}>{task.title}</Text>
          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Assigned by {task.assignedBy?.firstName} {task.assignedBy?.lastName}
              {dueDate && <span style={{ color: isOverdue ? '#dc2626' : undefined, fontWeight: isOverdue ? 600 : 400 }}> · {isOverdue ? 'Overdue' : 'Due'} {format(dueDate, 'dd MMM')}</span>}
            </Text>
          </div>
        </div>
      }
      extra={
        <Button size="small" icon={<ThunderboltOutlined />} onClick={() => { onClose(); navigate(`/workflow/${initialTask._id}`); }}>
          Workflow
        </Button>
      }
      footer={
        tab !== 'updates' ? null : task.status === 'Completed' ? (
          <div style={{ textAlign: 'center', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <CheckCircleFilled /> <Text strong style={{ color: 'inherit' }}>Task Completed</Text>
          </div>
        ) : task.status === 'Approval Pending' ? (
          <div style={{ textAlign: 'center', color: '#7c3aed' }}>Waiting for manager approval…</div>
        ) : canAct ? (
          <div>
            {task.status === 'Assigned' && (
              <div style={{ marginBottom: 12, padding: 12, borderRadius: 10, background: 'rgba(59,130,246,0.08)' }}>
                <Text style={{ display: 'block', marginBottom: 8, fontSize: 13 }}>Ready to start? Click below to begin working.</Text>
                <Button type="primary" icon={<PlayCircleFilled />} loading={startMutation.isPending} onClick={() => startMutation.mutate()}>Start Working</Button>
              </div>
            )}
            <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>Post Today's Update</Text>
            <Input.TextArea value={updateText} onChange={(e) => setUpdateText(e.target.value)} rows={2} placeholder="What did you work on today? Any blockers?" style={{ marginTop: 6, marginBottom: 8 }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                  <span>Progress</span><Text strong style={{ fontSize: 11, color: '#669c2c' }}>{progress}%</Text>
                </div>
                <Slider min={0} max={100} step={5} value={progress} onChange={setProgress} />
              </div>
              <div style={{ width: 80 }}>
                <Text type="secondary" style={{ fontSize: 11 }}>Hours</Text>
                <Input type="number" min={0} max={24} step={0.5} value={hours} onChange={(e) => setHours(e.target.value)} placeholder="0" />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button icon={<SendOutlined />} loading={dailyMutation.isPending} disabled={!updateText.trim()} onClick={handlePostUpdate} block>Post Update</Button>
              {progress === 100 && !pendingApproval && (
                <Button type="primary" icon={<CheckCircleFilled />} onClick={() => setShowCompletion(true)}>Request Completion</Button>
              )}
            </div>
            {progress < 100 && !pendingApproval && (
              <Button type="link" size="small" onClick={() => setShowCompletion(true)} style={{ marginTop: 4, padding: 0 }}>
                Done with the task? → Request Completion
              </Button>
            )}
          </div>
        ) : null
      }
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Progress percent={task.progress || 0} style={{ flex: 1 }} />
        {task.actualHours > 0 && <Text type="secondary" style={{ fontSize: 12 }}><ClockCircleOutlined /> {task.actualHours}h</Text>}
      </div>
      {(task.status === 'In Progress' || (task.status === 'Completed' && task.startDate)) && elapsedMs > 0 && (
        <Tag color={task.status === 'In Progress' ? 'gold' : 'green'} style={{ marginBottom: 16, fontFamily: 'monospace' }} icon={<ClockCircleOutlined />}>
          {task.status === 'In Progress' ? `${formatDuration(elapsedMs, 'clock')} elapsed` : `Completed in ${formatDuration(elapsedMs, 'compact')}`}
        </Tag>
      )}

      <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 8 }}>Time Tracker</Text>
      <TaskTimer task={task} />

      {task.description && (
        <Paragraph type="secondary" style={{ marginTop: 16 }}>{task.description}</Paragraph>
      )}

      {task.status === 'Changes Requested' && lastRejection?.reviewNotes && (
        <div style={{ marginTop: 16, padding: 12, borderRadius: 10, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <ExclamationCircleFilled style={{ color: '#dc2626', marginTop: 2 }} />
            <div>
              <Text strong style={{ color: '#b91c1c', fontSize: 12, display: 'block' }}>
                Returned by {lastRejection.reviewedBy?.firstName} {lastRejection.reviewedBy?.lastName}
                {task.rejectionCount > 1 && <span> (Round #{task.rejectionCount})</span>}
              </Text>
              <Text style={{ fontSize: 13, color: '#991b1b' }}>{lastRejection.reviewNotes}</Text>
            </div>
          </div>
        </div>
      )}

      <Tabs activeKey={tab} onChange={setTab} items={tabItems} style={{ marginTop: 16 }} />

      {tab === 'comments' && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <Input
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            onPressEnter={() => commentText.trim() && commentMutation.mutate(commentText.trim())}
            placeholder="Write a comment…"
          />
          <Button icon={<SendOutlined />} type="primary" loading={commentMutation.isPending} disabled={!commentText.trim()} onClick={() => commentMutation.mutate(commentText.trim())} />
        </div>
      )}

      <Drawer
        open={showCompletion}
        onClose={() => setShowCompletion(false)}
        title={`Request Task Completion${task.rejectionCount > 0 ? ` (Resubmission #${task.rejectionCount + 1})` : ''}`}
        height="auto"
        placement="bottom"
      >
        <Text strong style={{ display: 'block', marginBottom: 12 }}>{task.title}</Text>
        {task.status === 'Changes Requested' && lastRejection?.reviewNotes && (
          <div style={{ padding: 10, borderRadius: 10, background: 'rgba(239,68,68,0.06)', marginBottom: 12 }}>
            <Text strong style={{ fontSize: 11, color: '#b91c1c', display: 'block' }}>Previous feedback to address:</Text>
            <Text style={{ fontSize: 12, color: '#991b1b' }}>{lastRejection.reviewNotes}</Text>
          </div>
        )}
        <label className="label">Summary of completed work</label>
        <Input.TextArea value={completionNotes} onChange={(e) => setCompletionNotes(e.target.value)} rows={3} placeholder="Describe what you completed, any attachments or proof of work..." />
        <Text type="secondary" style={{ fontSize: 12, display: 'block', margin: '10px 0' }}>Your manager will review this and mark it complete or send it back with feedback.</Text>
        <div style={{ display: 'flex', gap: 10 }}>
          <Button onClick={() => setShowCompletion(false)} block>Cancel</Button>
          <Button type="primary" loading={completionMutation.isPending} onClick={() => completionMutation.mutate(completionNotes)} block>Submit for Review</Button>
        </div>
      </Drawer>
    </Drawer>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function MyTasks() {
  const [filter, setFilter] = useState('active');
  const [openTask, setOpenTask] = useState(null);
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const { socket } = useSocketStore();

  const refreshMyTasks = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['tasks', 'my'] });
  }, [qc]);

  useEffect(() => {
    if (!socket) return;
    socket.on('task_updated', refreshMyTasks);
    socket.on('task_created', refreshMyTasks);
    return () => {
      socket.off('task_updated', refreshMyTasks);
      socket.off('task_created', refreshMyTasks);
    };
  }, [socket, refreshMyTasks]);

  const params = {
    assignedTo: user._id,
    limit: 50,
    ...(filter === 'active'    ? { status: 'Assigned,In Progress,Changes Requested,Reopened' } : {}),
    ...(filter === 'pending'   ? { status: 'Approval Pending' } : {}),
    ...(filter === 'completed' ? { status: 'Completed' } : {}),
    ...(filter === 'achieved'  ? { status: 'Achieved' } : {}),
    ...(filter === 'overdue'   ? { isOverdue: 'true' } : {}),
  };

  const { data, isLoading } = useQuery({
    queryKey: ['tasks', 'my', filter],
    queryFn: () => api.get('/tasks', { params }).then((r) => r.data),
    refetchInterval: 5 * 60 * 1000,
  });

  const tasks = data?.data || [];

  const FILTERS = [
    { value: 'active',    label: 'Active' },
    { value: 'pending',   label: 'Pending Approval' },
    { value: 'overdue',   label: 'Overdue' },
    { value: 'completed', label: 'Completed' },
    { value: 'achieved',  label: '🏆 Achieved' },
    { value: 'all',       label: 'All' },
  ];

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <Title level={4} style={{ marginBottom: 0 }}>My Tasks</Title>
          <Text type="secondary">{tasks.length} tasks</Text>
        </div>
      </div>

      <Segmented options={FILTERS} value={filter} onChange={setFilter} />

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
      ) : tasks.length === 0 ? (
        <Empty description="No tasks in this filter" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: 40 }} />
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => {
            const dueDate   = task.dueDate ? new Date(task.dueDate) : null;
            const isOverdue = dueDate && isPast(dueDate) && task.status !== 'Completed';
            const isDueToday = dueDate && isToday(dueDate);
            const lastUpdate = task.comments?.filter((c) => c.type === 'daily_update').slice(-1)[0];
            const commentCount = task.comments?.filter((c) => c.type === 'comment').length || 0;

            return (
              <motion.div
                key={task._id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={() => setOpenTask(task)}
                style={{
                  background: '#fbfaf7', borderRadius: 14, padding: 16, cursor: 'pointer',
                  border: '1px solid rgba(15,23,42,0.08)',
                  borderInlineStart: `4px solid ${PRIORITY_COLOR[task.priority] || '#e5e7eb'}`,
                  boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                      <Tag color={STATUS_TAG[task.status] || 'default'}>{task.status}</Tag>
                      <Text strong style={{ color: PRIORITY_COLOR[task.priority], fontSize: 11 }}>{task.priority?.toUpperCase()}</Text>
                      <Text type="secondary" style={{ fontSize: 11 }}>{task.department}</Text>
                    </div>
                    <Text strong style={{ fontSize: 13 }}>{task.title}</Text>

                    {lastUpdate ? (
                      <Paragraph type="secondary" italic ellipsis style={{ fontSize: 12, margin: '4px 0 0' }}>
                        Last update: "{lastUpdate.content}"
                      </Paragraph>
                    ) : (
                      <Text style={{ fontSize: 12, color: '#ea580c', display: 'block', marginTop: 4 }}>No updates posted yet</Text>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
                      {dueDate && (
                        <Text style={{ fontSize: 12, fontWeight: 500, color: isOverdue ? '#dc2626' : isDueToday ? '#ea580c' : '#94a3b8' }}>
                          {isOverdue && <ExclamationCircleFilled style={{ marginRight: 4 }} />}
                          {isOverdue ? 'Overdue · ' : isDueToday ? 'Due Today · ' : 'Due '}{format(dueDate, 'dd MMM')}
                        </Text>
                      )}
                      {(task.status === 'In Progress' || (task.status === 'Completed' && task.startDate)) && (
                        <TaskTimerBadge startDate={task.startDate} status={task.status} completedAt={task.completedAt} />
                      )}
                      {task.actualHours > 0 && (
                        <Text type="secondary" style={{ fontSize: 12 }}><ClockCircleOutlined /> {task.actualHours}h logged</Text>
                      )}
                      {commentCount > 0 && (
                        <Text type="secondary" style={{ fontSize: 12 }}><MessageOutlined /> {commentCount}</Text>
                      )}
                    </div>
                  </div>

                  <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                    <Progress type="circle" percent={task.progress || 0} size={48} strokeColor="#669c2c" />
                    <Text style={{ fontSize: 11, color: '#669c2c', fontWeight: 600 }}>Update</Text>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {openTask && (
          <TaskDrawer
            task={openTask}
            onClose={() => setOpenTask(null)}
            onUpdated={() => { qc.invalidateQueries({ queryKey: ['tasks', 'my'] }); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
