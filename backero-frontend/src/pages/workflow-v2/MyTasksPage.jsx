import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Empty, Segmented, Spin, Table, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import workflowApi from '../../api/workflowApi';
import { useWorkflowAuthStore } from '../../store/useWorkflowAuthStore';
import { PRIORITY_COLOR, STATUS_COLOR } from './taskConstants';
import TaskDetailDrawer from './TaskDetailDrawer';

const { Title, Text } = Typography;

const FILTERS = [
  { label: 'Active', value: 'active', statuses: ['Assigned', 'In Progress', 'Changes Requested', 'Reopened'] },
  { label: 'Pending Approval', value: 'pending', statuses: ['Approval Pending'] },
  { label: 'Completed', value: 'completed', statuses: ['Completed'] },
  { label: 'All', value: 'all', statuses: null },
];

export default function MyTasksPage() {
  const [filter, setFilter] = useState('active');
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const user = useWorkflowAuthStore((s) => s.user);

  const { data, isLoading } = useQuery({
    queryKey: ['workflow-tasks', 'my', user?.id],
    queryFn: () =>
      workflowApi
        .get('/workflow/tasks', { params: { assigned_to_id: user?.id, page_size: 100 } })
        .then((r) => r.data),
    enabled: !!user?.id,
  });

  const activeFilter = FILTERS.find((f) => f.value === filter);
  const tasks = (data?.items || []).filter((t) => !activeFilter.statuses || activeFilter.statuses.includes(t.status));

  const columns = [
    {
      title: 'Task',
      dataIndex: 'title',
      render: (title, task) => (
        <div>
          <div style={{ fontWeight: 600 }}>{title}</div>
          {task.due_date && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              Due {dayjs(task.due_date).format('DD MMM YYYY')}
            </Text>
          )}
        </div>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 160,
      render: (status) => <Tag color={STATUS_COLOR[status] || 'default'}>{status}</Tag>,
    },
    {
      title: 'Priority',
      dataIndex: 'priority',
      width: 110,
      render: (p) => <Tag color={PRIORITY_COLOR[p]}>{p}</Tag>,
    },
    {
      title: 'Progress',
      dataIndex: 'progress',
      width: 100,
      render: (p) => `${p || 0}%`,
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Title level={4} style={{ marginBottom: 0 }}>My Tasks</Title>
        <Text type="secondary">{tasks.length} tasks</Text>
      </div>

      <Segmented
        options={FILTERS.map((f) => ({ label: f.label, value: f.value }))}
        value={filter}
        onChange={setFilter}
        style={{ marginBottom: 16 }}
      />

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <Spin size="large" />
        </div>
      ) : tasks.length === 0 ? (
        <Empty description="No tasks in this filter" />
      ) : (
        <Table
          rowKey="id"
          dataSource={tasks}
          columns={columns}
          pagination={false}
          onRow={(task) => ({ onClick: () => setSelectedTaskId(task.id), style: { cursor: 'pointer' } })}
        />
      )}

      <TaskDetailDrawer taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} />
    </div>
  );
}
