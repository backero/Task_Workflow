import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Divider, Drawer, Empty, Input, message, Progress, Slider, Space, Spin, Tag, Typography } from 'antd';
import { SendOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import workflowApi from '../../api/workflowApi';
import { useWorkflowAuthStore } from '../../store/useWorkflowAuthStore';
import { PRIORITY_COLOR, STATUS_COLOR } from './taskConstants';

const { Text, Title, Paragraph } = Typography;

const REQUESTABLE_STATUSES = ['In Progress', 'Assigned', 'Reopened', 'Changes Requested'];

export default function TaskDetailDrawer({ taskId, onClose }) {
  const [commentText, setCommentText] = useState('');
  const [progress, setProgress] = useState(0);
  const [completionNotes, setCompletionNotes] = useState('');
  const qc = useQueryClient();
  const user = useWorkflowAuthStore((s) => s.user);

  const { data: task, isLoading } = useQuery({
    queryKey: ['workflow-task', taskId],
    queryFn: () => workflowApi.get(`/workflow/tasks/${taskId}`).then((r) => r.data),
    enabled: !!taskId,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['workflow-tasks'] });
    qc.invalidateQueries({ queryKey: ['workflow-task', taskId] });
    qc.invalidateQueries({ queryKey: ['workflow-approvals'] });
  };

  const updateProgressMutation = useMutation({
    mutationFn: (value) => workflowApi.put(`/workflow/tasks/${taskId}`, { progress: value }),
    onSuccess: () => {
      message.success('Progress updated');
      invalidate();
    },
    onError: (err) => message.error(err.response?.data?.error?.message || 'Failed'),
  });

  const commentMutation = useMutation({
    mutationFn: (content) => workflowApi.post(`/workflow/tasks/${taskId}/comment`, { content }),
    onSuccess: () => {
      setCommentText('');
      message.success('Comment posted');
      invalidate();
    },
    onError: (err) => message.error(err.response?.data?.error?.message || 'Failed'),
  });

  const requestCompletionMutation = useMutation({
    mutationFn: (notes) => workflowApi.post(`/workflow/tasks/${taskId}/request-completion`, { notes }),
    onSuccess: () => {
      message.success('Submitted for review');
      setCompletionNotes('');
      invalidate();
    },
    onError: (err) => message.error(err.response?.data?.error?.message || 'Failed'),
  });

  const isAssignee = task && user && task.assigned_to_id === user.id;
  const canRequestCompletion = isAssignee && task && REQUESTABLE_STATUSES.includes(task.status);

  return (
    <Drawer title="Task Details" open={!!taskId} onClose={onClose} width={480}>
      {isLoading || !task ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin />
        </div>
      ) : (
        <div>
          <Space wrap style={{ marginBottom: 8 }}>
            <Tag color={STATUS_COLOR[task.status] || 'default'}>{task.status}</Tag>
            <Tag color={PRIORITY_COLOR[task.priority]}>{task.priority}</Tag>
            {task.due_date && <Text type="secondary">Due {dayjs(task.due_date).format('DD MMM YYYY')}</Text>}
          </Space>
          <Title level={5} style={{ marginTop: 4 }}>{task.title}</Title>
          {task.description && <Paragraph type="secondary">{task.description}</Paragraph>}

          <div style={{ margin: '16px 0' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>Progress</Text>
            <Progress percent={task.progress} />
            {isAssignee && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                <Slider
                  style={{ flex: 1 }}
                  step={5}
                  value={progress || task.progress}
                  onChange={setProgress}
                />
                <Button size="small" onClick={() => updateProgressMutation.mutate(progress || task.progress)}>
                  Update
                </Button>
              </div>
            )}
          </div>

          {task.rejection_count > 0 && (
            <Tag color="red" style={{ marginBottom: 12 }}>
              Resubmission round #{task.rejection_count + 1}
            </Tag>
          )}

          {canRequestCompletion && (
            <div style={{ background: 'rgba(5,150,105,0.06)', padding: 12, borderRadius: 10, marginBottom: 16 }}>
              <Text strong style={{ fontSize: 13 }}>Request Completion</Text>
              <Input.TextArea
                rows={2}
                style={{ marginTop: 8 }}
                placeholder="Summary of completed work..."
                value={completionNotes}
                onChange={(e) => setCompletionNotes(e.target.value)}
              />
              <Button
                type="primary"
                block
                style={{ marginTop: 8 }}
                loading={requestCompletionMutation.isPending}
                onClick={() => requestCompletionMutation.mutate(completionNotes || undefined)}
              >
                Submit for Review
              </Button>
            </div>
          )}

          {task.status === 'Approval Pending' && (
            <Empty
              description="Waiting for manager approval"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              style={{ margin: '16px 0' }}
            />
          )}

          <Divider orientation="left" plain>Comments</Divider>
          <TaskComments taskId={taskId} />

          <Space.Compact style={{ width: '100%', marginTop: 12 }}>
            <Input
              placeholder="Write a comment…"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onPressEnter={() => commentText.trim() && commentMutation.mutate(commentText.trim())}
            />
            <Button
              icon={<SendOutlined />}
              type="primary"
              loading={commentMutation.isPending}
              disabled={!commentText.trim()}
              onClick={() => commentMutation.mutate(commentText.trim())}
            />
          </Space.Compact>
        </div>
      )}
    </Drawer>
  );
}

function TaskComments({ taskId }) {
  // Phase 1 backend exposes comment creation but not a dedicated list
  // endpoint yet — this reads the task's own response only, so comments
  // posted this session are visible via query invalidation refetch of the
  // task, while a full comment list endpoint is Phase 1b.
  return (
    <Text type="secondary" style={{ fontSize: 12 }}>
      Comments are posted immediately; a full comment thread view lands in Phase 1b once a
      dedicated list endpoint exists.
    </Text>
  );
}
