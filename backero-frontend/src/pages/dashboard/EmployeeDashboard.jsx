import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import {
  FileText, AlertTriangle, CheckCircle2, Clock,
  ArrowRight, ChevronRight, Zap, LayoutGrid,
  HelpCircle,
} from 'lucide-react';
import { Alert, Button, Card, Col, Empty, Progress, Row, Space, Spin, Tag, Typography } from 'antd';
import api from '../../api/axios';
import { useAuthStore } from '../../store/useAuthStore';
import ProductionSnapshot from './ProductionSnapshot';
import { format, isToday, isTomorrow, isPast, formatDistanceToNow } from 'date-fns';

const { Title, Text, Paragraph } = Typography;

const PRIORITY_COLOR = { critical: 'red', urgent: 'red', high: 'orange', medium: 'gold', low: 'default' };
const STATUS_COLOR = { Pending: 'default', Assigned: 'blue', 'In Progress': 'gold', 'Approval Pending': 'purple', 'Changes Requested': 'red', Completed: 'green' };

function getDueLabel(dueDate) {
  const d = new Date(dueDate);
  if (isPast(d) && !isToday(d)) return { label: 'OVERDUE', color: 'red' };
  if (isToday(d)) return { label: 'Due Today', color: 'orange' };
  if (isTomorrow(d)) return { label: 'Due Tomorrow', color: 'gold' };
  return { label: format(d, 'dd MMM yyyy'), color: 'default' };
}

function StatCard({ icon, label, value, sub, to }) {
  const content = (
    <Card hoverable={!!to} style={{ height: '100%' }}>
      <div style={{ fontSize: 20, marginBottom: 8, color: 'var(--ant-color-primary)' }}>{icon}</div>
      <div style={{ fontSize: 24, fontWeight: 700 }}>{value}</div>
      <Text style={{ fontSize: 13, fontWeight: 500 }}>{label}</Text>
      {sub && <div><Text type="secondary" style={{ fontSize: 12 }}>{sub}</Text></div>}
    </Card>
  );
  return to ? <Link to={to}>{content}</Link> : content;
}

export default function EmployeeDashboard() {
  const { user } = useAuthStore();
  const navigate = useNavigate();

  const toWorkflow = (task) => {
    const parentId = task.parentTask?._id || task.parentTask;
    navigate(parentId ? `/workflow/${parentId}?view=dept` : `/workflow/${task._id}`);
  };

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', 'employee'],
    queryFn: () => api.get('/dashboard/employee').then((r) => r.data.dashboard),
    staleTime: 0,
    refetchInterval: 30 * 1000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });

  if (isLoading) {
    return <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>;
  }

  const d = data || {};
  const myTasks = d.myTasks || [];
  const myLeads = d.myLeads || [];
  const myQueries = d.myQueries || [];

  const overdueTasks = myTasks.filter((t) => t.isOverdue);
  const activeTasks = myTasks.filter((t) => !t.isOverdue);
  const sortedTasks = [
    ...myTasks.filter((t) => t.dueDate && isToday(new Date(t.dueDate))),
    ...overdueTasks.filter((t) => !t.dueDate || !isToday(new Date(t.dueDate))),
    ...activeTasks.filter((t) => !t.dueDate || !isToday(new Date(t.dueDate))),
  ];
  const uniqueTasks = sortedTasks.filter((t, i, arr) => arr.findIndex((x) => x._id === t._id) === i);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <Title level={4} style={{ marginBottom: 0 }}>My Workspace</Title>
          <Text type="secondary">{greeting}, {user?.firstName}!{user?.department && ` · ${user.department}`}</Text>
        </div>
        <Link to="/workflow"><Button type="primary">Workflow Board</Button></Link>
      </div>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={myQueries.length > 0 ? 4 : 6}>
          <StatCard icon={<FileText />} label="Active Tasks" value={myTasks.length} sub="Not yet completed" to="/workflow" />
        </Col>
        <Col span={myQueries.length > 0 ? 4 : 6}>
          <StatCard icon={<AlertTriangle />} label="Overdue" value={d.overdueTasks || 0} sub="Need immediate attention" to="/workflow" />
        </Col>
        <Col span={myQueries.length > 0 ? 4 : 6}>
          <StatCard icon={<CheckCircle2 />} label="Done This Month" value={d.completedThisMonth || 0} sub="Tasks completed" />
        </Col>
        <Col span={myQueries.length > 0 ? 4 : 6}>
          <StatCard icon={<Clock />} label="Pending Approval" value={d.pendingApprovals || 0} sub="Awaiting manager review" to="/workflow" />
        </Col>
        {myQueries.length > 0 && (
          <Col span={4}>
            <StatCard icon={<HelpCircle />} label="My Queries" value={myQueries.length} sub="Awaiting your reply" to="/crm/queries" />
          </Col>
        )}
      </Row>

      <div style={{ marginBottom: 16 }}>
        <ProductionSnapshot department={user?.department} />
      </div>

      {overdueTasks.length > 0 && (
        <Alert
          style={{ marginBottom: 16 }}
          type="error"
          showIcon
          message={`You have ${overdueTasks.length} overdue task${overdueTasks.length > 1 ? 's' : ''}`}
          description={overdueTasks.map((t) => t.title).join(', ')}
          action={<Link to="/workflow"><Button size="small" danger type="primary">View Now</Button></Link>}
        />
      )}

      <Row gutter={16}>
        <Col span={16}>
          <Card
            title={<div><div style={{ fontWeight: 700 }}>My Active Tasks</div><Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>{myTasks.length} task{myTasks.length !== 1 ? 's' : ''} in progress</Text></div>}
            extra={<Link to="/workflow">View all <ArrowRight /></Link>}
          >
            {uniqueTasks.length === 0 ? (
              <Empty description="No active tasks — you're all caught up!" />
            ) : (
              <Space direction="vertical" style={{ width: '100%' }} split={<div style={{ borderBottom: '1px solid #f0f0f0' }} />}>
                {uniqueTasks.map((task) => {
                  const due = task.dueDate ? getDueLabel(task.dueDate) : null;
                  return (
                    <div key={task._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '8px 0' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Space size={4} style={{ marginBottom: 4 }} wrap>
                          <Tag color={STATUS_COLOR[task.status] || 'default'}>{task.status}</Tag>
                          <Tag color={PRIORITY_COLOR[task.priority] || 'default'}>{task.priority}</Tag>
                          {task.status === 'Changes Requested' && <Text type="danger" style={{ fontSize: 12, fontWeight: 600 }}>Action needed</Text>}
                        </Space>
                        <div>
                          <Button type="link" style={{ padding: 0, height: 'auto', fontWeight: 500 }} onClick={() => toWorkflow(task)}>{task.title}</Button>
                        </div>
                        <Space size={12}>
                          <Text type="secondary" style={{ fontSize: 12 }}>{task.department}</Text>
                          {task.assignedBy && <Text type="secondary" style={{ fontSize: 12 }}>from {task.assignedBy.firstName} {task.assignedBy.lastName}</Text>}
                        </Space>
                        {task.progress > 0 && <Progress percent={task.progress} size="small" style={{ maxWidth: 240, marginTop: 4 }} />}
                      </div>
                      <Space size={4} style={{ flexShrink: 0 }}>
                        {due && <Tag color={due.color}>{due.label}</Tag>}
                        <Button type="text" size="small" icon={<Zap />} title="Open in Workflow Builder" onClick={() => toWorkflow(task)} />
                        <Link to="/tasks/kanban"><Button type="text" size="small" icon={<LayoutGrid />} title="Open Kanban Board" /></Link>
                      </Space>
                    </div>
                  );
                })}
              </Space>
            )}
          </Card>
        </Col>

        <Col span={8}>
          <Space direction="vertical" style={{ width: '100%' }} size={16}>
            <Card title="Quick Actions">
              <Space direction="vertical" style={{ width: '100%' }}>
                {[
                  { label: 'View My Tasks', sub: 'All tasks assigned to me', to: '/tasks/my' },
                  { label: 'Kanban Board', sub: 'Visual task board', to: '/tasks/kanban' },
                  { label: 'CRM Follow-ups', sub: 'My leads & clients', to: '/crm/pipeline' },
                  { label: 'Calendar', sub: 'Due dates & follow-ups', to: '/tasks/calendar' },
                ].map((item) => (
                  <Link key={item.to} to={item.to} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{item.label}</div>
                      <Text type="secondary" style={{ fontSize: 12 }}>{item.sub}</Text>
                    </div>
                    <ChevronRight style={{ fontSize: 11, color: '#bbb' }} />
                  </Link>
                ))}
              </Space>
            </Card>

            <Card title="My Follow-ups" extra={<Link to="/crm/calendar">Calendar</Link>}>
              {myLeads.length === 0 ? (
                <Empty description="No follow-ups scheduled" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              ) : (
                <Space direction="vertical" style={{ width: '100%' }}>
                  {myLeads.map((lead) => (
                    <Link key={lead._id} to={`/crm/leads/${lead._id}`}>
                      <Card size="small" hoverable>
                        <div style={{ fontWeight: 500, fontSize: 13 }}>{lead.name}</div>
                        <Text type="secondary" style={{ fontSize: 12 }}>{lead.phone}</Text>
                        <div style={{ marginTop: 4 }}>
                          <Space size={4}>
                            <Tag color="blue">{lead.status}</Tag>
                            {lead.nextFollowUpAt && <Text type="warning" style={{ fontSize: 12 }}>{formatDistanceToNow(new Date(lead.nextFollowUpAt), { addSuffix: true })}</Text>}
                          </Space>
                        </div>
                      </Card>
                    </Link>
                  ))}
                </Space>
              )}
            </Card>

            {myQueries.length > 0 && (
              <Card
                title={<div><div style={{ fontWeight: 700 }}>My Queries</div><Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>{myQueries.length} pending</Text></div>}
                extra={<Link to="/crm/queries">View all <ArrowRight /></Link>}
              >
                <Space direction="vertical" style={{ width: '100%' }}>
                  {myQueries.map((q) => (
                    <Card key={q._id} size="small" style={{ background: '#fff1f0', borderColor: '#ffccc7' }}>
                      <Space size={4} style={{ marginBottom: 4 }}>
                        <HelpCircle style={{ color: '#ff4d4f' }} />
                        <Tag color={q.urgency === 'high' ? 'red' : q.urgency === 'medium' ? 'gold' : 'default'}>{q.urgency}</Tag>
                      </Space>
                      <div style={{ fontWeight: 500, fontSize: 13 }}>{q.title}</div>
                      {q.leadName && <Text type="secondary" style={{ fontSize: 12 }}>Lead: {q.leadName}</Text>}
                      <div><Text type="secondary" style={{ fontSize: 12 }}>By: {q.raisedBy?.firstName} {q.raisedBy?.lastName}</Text></div>
                      <Link to="/crm/queries"><Button size="small" type="primary" style={{ marginTop: 8 }}>Reply</Button></Link>
                    </Card>
                  ))}
                </Space>
              </Card>
            )}
          </Space>
        </Col>
      </Row>
    </div>
  );
}
