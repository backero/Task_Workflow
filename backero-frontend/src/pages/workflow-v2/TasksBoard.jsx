import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Card,
  Col,
  DatePicker,
  Drawer,
  Empty,
  Form,
  Input,
  message,
  Row,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import workflowApi from '../../api/workflowApi';
import { useWorkflowAuthStore } from '../../store/useWorkflowAuthStore';
import { PRIORITY_COLOR, STATUS_COLUMNS } from './taskConstants';
import TaskDetailDrawer from './TaskDetailDrawer';

const { Text, Title } = Typography;

function TaskCard({ task, onClick }) {
  return (
    <Card
      size="small"
      hoverable
      onClick={onClick}
      style={{ marginBottom: 10, borderLeft: `3px solid var(--ant-color-primary)` }}
      styles={{ body: { padding: 12 } }}
    >
      <Space size={4} style={{ marginBottom: 6 }} wrap>
        <Tag color={PRIORITY_COLOR[task.priority]} style={{ marginInlineEnd: 0 }}>
          {task.priority}
        </Tag>
        {task.due_date && (
          <Text type="secondary" style={{ fontSize: 11 }}>
            Due {dayjs(task.due_date).format('DD MMM')}
          </Text>
        )}
      </Space>
      <div style={{ fontSize: 13, fontWeight: 600 }}>{task.title}</div>
      {task.progress > 0 && (
        <div style={{ marginTop: 6, height: 4, background: 'rgba(0,0,0,0.06)', borderRadius: 99 }}>
          <div
            style={{
              height: '100%',
              width: `${task.progress}%`,
              background: 'var(--ant-color-primary)',
              borderRadius: 99,
            }}
          />
        </div>
      )}
    </Card>
  );
}

function CreateTaskDrawer({ open, onClose }) {
  const [form] = Form.useForm();
  const qc = useQueryClient();

  const createMutation = useMutation({
    mutationFn: (values) =>
      workflowApi.post('/workflow/tasks', {
        ...values,
        due_date: values.due_date ? values.due_date.format('YYYY-MM-DD') : null,
        assigned_to_id: values.assigned_to_id || null,
      }),
    onSuccess: () => {
      message.success('Task created');
      qc.invalidateQueries({ queryKey: ['workflow-tasks'] });
      form.resetFields();
      onClose();
    },
    onError: (err) => message.error(err.response?.data?.error?.message || 'Failed to create task'),
  });

  return (
    <Drawer title="New Task" open={open} onClose={onClose} width={420}>
      <Form layout="vertical" form={form} onFinish={createMutation.mutate} requiredMark={false}>
        <Form.Item name="title" label="Title" rules={[{ required: true }]}>
          <Input placeholder="Task title" />
        </Form.Item>
        <Form.Item name="description" label="Description">
          <Input.TextArea rows={3} placeholder="What needs to be done?" />
        </Form.Item>
        <Form.Item name="priority" label="Priority" initialValue="medium">
          <Select
            options={['low', 'medium', 'high', 'critical', 'urgent'].map((p) => ({ label: p, value: p }))}
          />
        </Form.Item>
        <Form.Item name="due_date" label="Due date">
          <DatePicker style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item
          name="assigned_to_id"
          label="Assignee user ID"
          extra="Paste a workflow user's UUID — a user directory page is planned for Phase 1b."
        >
          <Input placeholder="Optional — UUID" />
        </Form.Item>
        <Button type="primary" htmlType="submit" block loading={createMutation.isPending}>
          Create Task
        </Button>
      </Form>
    </Drawer>
  );
}

export default function TasksBoard() {
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const isManagerOrAbove = useWorkflowAuthStore((s) => s.isManagerOrAbove);

  const { data, isLoading } = useQuery({
    queryKey: ['workflow-tasks', 'board'],
    queryFn: () => workflowApi.get('/workflow/tasks', { params: { page_size: 100 } }).then((r) => r.data),
  });

  const tasks = data?.items || [];
  const grouped = STATUS_COLUMNS.reduce((acc, col) => {
    acc[col.key] = tasks.filter((t) => t.status === col.key);
    return acc;
  }, {});

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <Title level={4} style={{ marginBottom: 0 }}>Kanban Board</Title>
          <Text type="secondary">{tasks.length} tasks total</Text>
        </div>
        {isManagerOrAbove() && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            New Task
          </Button>
        )}
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <Spin size="large" />
        </div>
      ) : (
        <Row gutter={12} style={{ flexWrap: 'nowrap', overflowX: 'auto', paddingBottom: 8 }}>
          {STATUS_COLUMNS.map((col) => (
            <Col key={col.key} style={{ minWidth: 260 }}>
              <div
                style={{
                  background: 'rgba(0,0,0,0.03)',
                  borderRadius: 12,
                  padding: 10,
                  minHeight: 400,
                }}
              >
                <Space style={{ marginBottom: 10, width: '100%', justifyContent: 'space-between' }}>
                  <Text strong style={{ fontSize: 13 }}>{col.label}</Text>
                  <Tag>{grouped[col.key]?.length || 0}</Tag>
                </Space>
                {(grouped[col.key] || []).length === 0 ? (
                  <Empty description="No tasks" style={{ marginTop: 24 }} image={Empty.PRESENTED_IMAGE_SIMPLE} />
                ) : (
                  grouped[col.key].map((task) => (
                    <TaskCard key={task.id} task={task} onClick={() => setSelectedTaskId(task.id)} />
                  ))
                )}
              </div>
            </Col>
          ))}
        </Row>
      )}

      <CreateTaskDrawer open={createOpen} onClose={() => setCreateOpen(false)} />
      <TaskDetailDrawer taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} />
    </div>
  );
}
