import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { PlusOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { Avatar, Button, Progress, Select, Spin, Table, Tag, Typography } from 'antd';
import { format, isPast } from 'date-fns';
import api from '../../api/axios';
import { useAuthStore } from '../../store/useAuthStore';
import TaskForm from './TaskForm';

const { Title, Text } = Typography;

const STATUS_COLOR = {
  Pending: 'default', Assigned: 'blue', 'In Progress': 'gold', 'Approval Pending': 'purple',
  'Changes Requested': 'red', Completed: 'green', Achieved: 'gold', Reopened: 'orange',
  Cancelled: 'default', 'Under Review': 'purple',
};
const PRIORITY_COLOR = { critical: 'red', urgent: 'volcano', high: 'orange', medium: 'gold', low: 'default' };

const DEPTS = ['Marketing', 'Marketplace', 'Sales', 'Production', 'R&D', 'Operations', 'Accounts & Finance'];
const STATUSES = ['Pending', 'Assigned', 'In Progress', 'Approval Pending', 'Changes Requested', 'Completed', 'Cancelled'];

export default function TeamTasks() {
  const [showForm, setShowForm] = useState(false);
  const [dept, setDept] = useState();
  const [status, setStatus] = useState();
  const { isManagerOrAbove } = useAuthStore();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['tasks', 'team', dept, status],
    queryFn: () => api.get('/tasks', { params: { limit: 50, department: dept, status } }).then((r) => r.data),
  });

  const tasks = data?.data || [];

  const columns = [
    {
      title: 'Task',
      dataIndex: 'title',
      render: (title, task) => (
        <div>
          <div style={{ fontWeight: 500 }}>{title}</div>
          <Text type="secondary" style={{ fontSize: 12 }}>{task.department}{task.platform ? ` • ${task.platform}` : ''}</Text>
        </div>
      ),
    },
    {
      title: 'Assigned To',
      dataIndex: 'assignedTo',
      render: (assignedTo) => assignedTo ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Avatar size={24}>{assignedTo.firstName?.[0]}</Avatar>
          <span>{assignedTo.firstName} {assignedTo.lastName}</span>
        </div>
      ) : <Text type="secondary">Unassigned</Text>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      align: 'center',
      render: (s) => <Tag color={STATUS_COLOR[s] || 'default'}>{s}</Tag>,
    },
    {
      title: 'Priority',
      dataIndex: 'priority',
      align: 'center',
      render: (p) => <Tag color={PRIORITY_COLOR[p]}>{p?.toUpperCase()}</Tag>,
    },
    {
      title: 'Progress',
      dataIndex: 'progress',
      align: 'center',
      width: 140,
      render: (progress) => <Progress percent={progress || 0} size="small" />,
    },
    {
      title: 'Due Date',
      dataIndex: 'dueDate',
      align: 'right',
      render: (dueDate, task) => {
        const due = dueDate ? new Date(dueDate) : null;
        const isOverdue = due && isPast(due) && task.status !== 'Completed';
        return <Text type={isOverdue ? 'danger' : 'secondary'} style={{ fontSize: 12 }}>{due ? format(due, 'dd MMM yyyy') : '—'}</Text>;
      },
    },
    {
      title: '',
      key: 'actions',
      align: 'right',
      render: (_, task) => (
        <Button type="link" size="small" icon={<ThunderboltOutlined />} onClick={() => navigate(`/workflow/${task._id}`)}>
          Workflow
        </Button>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <Title level={4} style={{ marginBottom: 0 }}>Team Tasks</Title>
          <Text type="secondary">{tasks.length} tasks</Text>
        </div>
        {isManagerOrAbove() && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setShowForm(true)}>New Task</Button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <Select
          allowClear
          placeholder="All Departments"
          style={{ width: 200 }}
          value={dept}
          onChange={setDept}
          options={DEPTS.map((d) => ({ label: d, value: d }))}
        />
        <Select
          allowClear
          placeholder="All Statuses"
          style={{ width: 200 }}
          value={status}
          onChange={setStatus}
          options={STATUSES.map((s) => ({ label: s, value: s }))}
        />
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
      ) : (
        <Table rowKey="_id" columns={columns} dataSource={tasks} pagination={false} />
      )}

      {showForm && (
        <TaskForm
          onClose={() => setShowForm(false)}
          onSuccess={() => { setShowForm(false); qc.invalidateQueries({ queryKey: ['tasks'] }); }}
        />
      )}
    </div>
  );
}
