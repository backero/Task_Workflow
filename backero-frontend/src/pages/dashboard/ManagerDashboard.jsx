import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import {
  List, AlertTriangle, Clock, CheckCircle2,
  Users, LayoutGrid, ArrowRight, Zap, Menu as MenuIcon,
  HelpCircle, Star,
} from 'lucide-react';
import { Avatar, Badge, Button, Card, Col, Empty as AntEmpty, Progress, Row, Space, Spin, Table, Tag, Typography } from 'antd';
import api from '../../api/axios';
import { useAuthStore } from '../../store/useAuthStore';
import ProductionSnapshot from './ProductionSnapshot';
import { format, isToday, isTomorrow, isPast, formatDistanceToNow } from 'date-fns';

const { Title, Text } = Typography;

function useElapsedMs(startDate, isRunning) {
  const [ms, setMs] = useState(() => startDate && isRunning ? Date.now() - new Date(startDate).getTime() : 0);
  useEffect(() => {
    if (!startDate || !isRunning) return;
    const start = new Date(startDate).getTime();
    const id = setInterval(() => setMs(Date.now() - start), 1000);
    return () => clearInterval(id);
  }, [startDate, isRunning]);
  return ms;
}
function formatDuration(ms) {
  if (!ms || ms <= 0) return null;
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `<1m`;
}
function InProgressTimer({ startDate }) {
  const ms = useElapsedMs(startDate, true);
  const label = formatDuration(ms);
  if (!label) return null;
  return <Tag color="gold" icon={<Clock />} style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 10 }}>{label}</Tag>;
}

const PRIORITY_COLOR = { critical: 'red', urgent: 'red', high: 'orange', medium: 'gold', low: 'default' };
const STATUS_COLOR = { Completed: 'green', Achieved: 'gold', 'In Progress': 'gold', Assigned: 'blue', 'Approval Pending': 'purple', 'Changes Requested': 'red', Pending: 'default' };
const STATUS_BAR_COLOR = { Completed: '#22c55e', Achieved: '#f59e0b', 'In Progress': '#f97316', Assigned: '#3b82f6', 'Approval Pending': '#9333ea', 'Changes Requested': '#ef4444', Pending: '#94a3b8' };
const AVATAR_COLORS = ['#3b82f6', '#8b5cf6', '#14b8a6', '#f59e0b', '#ec4899', '#22c55e', '#f43f5e', '#06b6d4'];

function getDueLabel(dueDate) {
  const d = new Date(dueDate);
  if (isPast(d) && !isToday(d)) return { label: 'Overdue', color: '#ef4444', bold: true };
  if (isToday(d)) return { label: 'Due Today', color: '#f97316', bold: true };
  if (isTomorrow(d)) return { label: 'Due Tomorrow', color: '#f59e0b', bold: false };
  return { label: format(d, 'dd MMM'), color: '#94a3b8', bold: false };
}

function KPICard({ icon, label, value, sub, color = '#3b82f6', to, alert }) {
  const card = (
    <Card hoverable={!!to} size="small" style={{ height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: color, color: '#fff', fontSize: 18 }}>
          {icon}
        </div>
        {alert > 0 && <Tag color="red">{alert}</Tag>}
      </div>
      <div style={{ marginTop: 10 }}>
        <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1 }}>{value}</div>
        <Text style={{ fontSize: 13, fontWeight: 600 }}>{label}</Text>
        {sub && <div><Text type="secondary" style={{ fontSize: 12 }}>{sub}</Text></div>}
      </div>
    </Card>
  );
  return to ? <Link to={to}>{card}</Link> : card;
}

function SectionHead({ title, sub, to, toLabel = 'View all' }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
      <div>
        <Text strong style={{ fontSize: 15 }}>{title}</Text>
        {sub && <div><Text type="secondary" style={{ fontSize: 12 }}>{sub}</Text></div>}
      </div>
      {to && <Link to={to}>{toLabel} <ArrowRight /></Link>}
    </div>
  );
}

function Empty({ text }) {
  return <AntEmpty description={text} image={AntEmpty.PRESENTED_IMAGE_SIMPLE} style={{ padding: '24px 0' }} />;
}

export default function ManagerDashboard() {
  const { user } = useAuthStore();
  const navigate = useNavigate();

  const toWorkflow = (task) => {
    const parentId = task.parentTask?._id || task.parentTask;
    navigate(parentId ? `/workflow/${parentId}?view=dept` : `/workflow/${task._id}`);
  };

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', 'manager'],
    queryFn: () => api.get('/dashboard/manager').then((r) => r.data.dashboard),
    staleTime: 0,
    refetchInterval: 30 * 1000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });

  if (isLoading) {
    return <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>;
  }

  const d = data || {};
  const approvals = d.pendingApprovals || [];
  const teamTasks = d.teamTasks || [];
  const dueSoon = d.dueSoonTasks || [];
  const teamPerf = d.teamPerformance || [];
  const lowStock = d.lowStockItems || [];
  const techQueries = d.technicalQueries || { pendingCount: 0, recent: [] };

  const statusChartData = (d.taskStats || []).map((s) => ({ name: s._id, count: s.count, fill: STATUS_BAR_COLOR[s._id] || '#94a3b8' }));

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const teamPerfColumns = [
    {
      title: 'Employee',
      key: 'employee',
      render: (_, emp, i) => (
        <Space>
          <Avatar style={{ backgroundColor: AVATAR_COLORS[i % AVATAR_COLORS.length] }}>{emp.user?.firstName?.[0]}{emp.user?.lastName?.[0]}</Avatar>
          <div>
            <div><Text strong style={{ fontSize: 13 }}>{emp.user?.firstName} {emp.user?.lastName}</Text></div>
            <Text type="secondary" style={{ fontSize: 11 }}>{emp.user?.department || '—'}</Text>
          </div>
        </Space>
      ),
    },
    { title: 'Total', dataIndex: 'total', key: 'total', align: 'center' },
    { title: 'Active', dataIndex: 'inProgress', key: 'inProgress', align: 'center', render: (v) => <Text style={{ color: '#d48806', fontWeight: 600 }}>{v || 0}</Text> },
    { title: 'Done', dataIndex: 'completed', key: 'completed', align: 'center', render: (v) => <Text style={{ color: '#389e0d', fontWeight: 700 }}>{v}</Text> },
    { title: 'Overdue', dataIndex: 'overdue', key: 'overdue', align: 'center', render: (v) => <Text type={v > 0 ? 'danger' : 'secondary'} strong>{v || 0}</Text> },
    {
      title: 'Completion', key: 'completion',
      render: (_, emp) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Progress percent={emp.completionRate || 0} showInfo={false} size="small" style={{ flex: 1 }}
            strokeColor={emp.completionRate >= 70 ? '#22c55e' : emp.completionRate >= 40 ? '#3b82f6' : '#ef4444'} />
          <Text strong style={{ fontSize: 12, width: 36, textAlign: 'right' }}>{Math.round(emp.completionRate || 0)}%</Text>
        </div>
      ),
    },
  ];

  return (
    <div>
      <Card style={{ marginBottom: 16, overflow: 'hidden' }} styles={{ body: { padding: 0 } }}>
        <div style={{ background: 'linear-gradient(135deg,#1d4ed8 0%,#4f46e5 60%,#7c3aed 100%)', padding: '20px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <Text style={{ color: '#bfdbfe', fontSize: 13, fontWeight: 500 }}><Star /> {greeting}, {user?.firstName}</Text>
              <Title level={4} style={{ color: '#fff', margin: '2px 0' }}>Team Dashboard</Title>
              <Text style={{ color: 'rgba(191,219,254,0.7)', fontSize: 13 }}>
                {user?.department ? `${user.department} Department` : 'All Departments'} · {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
              </Text>
            </div>
            <Space>
              <Link to="/tasks/approvals">
                <Button style={{ background: 'rgba(255,255,255,0.15)', borderColor: 'rgba(255,255,255,0.25)', color: '#fff' }}>
                  <Badge count={approvals.length} size="small" offset={[6, -2]}>
                    <span style={{ color: '#fff' }}>Approvals</span>
                  </Badge>
                </Button>
              </Link>
              <Link to="/workflow">
                <Button type="primary" style={{ background: '#fff', color: '#1d4ed8', fontWeight: 700 }}>
                  Workflow Board <ArrowRight />
                </Button>
              </Link>
            </Space>
          </div>
        </div>
        <Row>
          {[
            { label: 'Total Tasks', value: d.totalTasks || 0, color: '#3b82f6' },
            { label: 'Completed', value: d.completedThisMonth || 0, color: '#22c55e', sub: 'this month' },
            { label: 'Overdue', value: d.overdueCount || 0, color: d.overdueCount > 0 ? '#ef4444' : '#94a3b8' },
            { label: 'Need Approval', value: approvals.length, color: approvals.length > 0 ? '#a855f7' : '#94a3b8' },
          ].map((s) => (
            <Col span={6} key={s.label} style={{ textAlign: 'center', padding: '16px 0', borderRight: '1px solid #f0f0f0' }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
              <Text type="secondary" style={{ fontSize: 12, fontWeight: 500 }}>{s.label}</Text>
              {s.sub && <div><Text type="secondary" style={{ fontSize: 10 }}>{s.sub}</Text></div>}
            </Col>
          ))}
        </Row>
      </Card>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} lg={6}><KPICard icon={<List />} color="#3b82f6" label="Total Tasks" value={d.totalTasks || 0} sub={`${d.completedThisMonth || 0} completed this month`} to="/workflow" /></Col>
        <Col xs={12} lg={6}><KPICard icon={<AlertTriangle />} color="#ef4444" label="Overdue" value={d.overdueCount || 0} sub="Need immediate action" alert={d.overdueCount || 0} to="/workflow" /></Col>
        <Col xs={12} lg={6}><KPICard icon={<Clock />} color="#a855f7" label="Pending Approvals" value={approvals.length} sub="Waiting for your review" alert={approvals.length} to="/tasks/approvals" /></Col>
        <Col xs={12} lg={6}><KPICard icon={<Users />} color="#22c55e" label="Team Members" value={d.teamSize || 0} sub={user?.department ? `in ${user.department}` : 'across all depts'} to="/management/team" /></Col>
        <Col xs={12} lg={6}><KPICard icon={<HelpCircle />} color="#f43f5e" label="Pending Queries" value={techQueries.pendingCount} sub="Awaiting production reply" alert={techQueries.pendingCount} to="/crm/queries" /></Col>
      </Row>

      <div style={{ marginBottom: 16 }}><ProductionSnapshot department={user?.department} /></div>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={12}>
          <Card>
            <SectionHead title="Task Status Breakdown" sub={`${d.totalTasks || 0} total tasks`} to="/tasks/analytics" toLabel="Analytics" />
            {statusChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={statusChartData} layout="vertical" margin={{ left: 20, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={115} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v) => [v, 'Tasks']} />
                  <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                    {statusChartData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <Empty text="No tasks yet" />}
          </Card>
        </Col>

        <Col span={12}>
          <Card>
            <SectionHead title="Due in Next 3 Days" sub={`${dueSoon.length} task${dueSoon.length !== 1 ? 's' : ''} coming up`} to="/workflow" toLabel="View Board" />
            {dueSoon.length === 0 ? <Empty text="No tasks due in the next 3 days" /> : (
              <Space direction="vertical" style={{ width: '100%' }}>
                {dueSoon.map((task) => {
                  const due = task.dueDate ? getDueLabel(task.dueDate) : null;
                  return (
                    <Card size="small" key={task._id} hoverable onClick={() => toWorkflow(task)}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <Text strong style={{ fontSize: 13 }} ellipsis>{task.title}</Text>
                          <div style={{ marginTop: 4 }}>
                            <Space size={8} wrap>
                              <Tag color={PRIORITY_COLOR[task.priority] || 'default'}>{task.priority}</Tag>
                              {task.assignedTo && <Text type="secondary" style={{ fontSize: 12 }}>{task.assignedTo.firstName} {task.assignedTo.lastName}</Text>}
                            </Space>
                          </div>
                        </div>
                        {due && <Text style={{ fontSize: 12, color: due.color, fontWeight: due.bold ? 700 : 500 }}>{due.label}</Text>}
                        <Zap style={{ color: '#94a3b8' }} onClick={(e) => { e.stopPropagation(); toWorkflow(task); }} />
                      </div>
                    </Card>
                  );
                })}
              </Space>
            )}
          </Card>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={12}>
          <Card>
            <SectionHead title="Pending Approvals" sub={`${approvals.length} task${approvals.length !== 1 ? 's' : ''} waiting`} to="/tasks/approvals" toLabel="Review All" />
            {approvals.length === 0 ? <Empty text="No pending approvals — all clear!" /> : (
              <Space direction="vertical" style={{ width: '100%' }}>
                {approvals.map((ap) => (
                  <Card size="small" key={ap._id} hoverable style={{ background: '#fffbe6', borderColor: '#ffe58f' }} onClick={() => ap.taskId && toWorkflow(ap.taskId)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Text strong style={{ fontSize: 13 }} ellipsis>{ap.taskId?.title}</Text>
                        <div style={{ marginTop: 4 }}>
                          <Space size={8} wrap>
                            <Tag color={PRIORITY_COLOR[ap.taskId?.priority] || 'default'}>{ap.taskId?.priority}</Tag>
                            <Text type="secondary" style={{ fontSize: 12 }}>{ap.requestedBy?.firstName} {ap.requestedBy?.lastName}</Text>
                            <Text type="secondary" style={{ fontSize: 12 }}>{ap.requestedAt ? formatDistanceToNow(new Date(ap.requestedAt), { addSuffix: true }) : ''}</Text>
                          </Space>
                        </div>
                      </div>
                      <Link to="/tasks/approvals" onClick={(e) => e.stopPropagation()}><Button type="primary" size="small">Review</Button></Link>
                    </div>
                  </Card>
                ))}
              </Space>
            )}
          </Card>
        </Col>

        <Col span={12}>
          <Card>
            <SectionHead title="Low Stock Alerts" sub={lowStock.length > 0 ? `${lowStock.length} product${lowStock.length !== 1 ? 's' : ''} below minimum` : 'All stock levels healthy'} to="/inventory/alerts" toLabel="View Alerts" />
            {lowStock.length === 0 ? <Empty text="All products are well stocked" /> : (
              <Space direction="vertical" style={{ width: '100%' }}>
                {lowStock.map((p) => (
                  <Card size="small" key={p._id} style={{ background: '#fff1f0', borderColor: '#ffccc7' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <Avatar shape="square" style={{ background: '#ffccc7' }} icon={<LayoutGrid style={{ color: '#cf1322' }} />} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Text strong style={{ fontSize: 13 }} ellipsis>{p.name}</Text>
                        <div><Text type="secondary" style={{ fontSize: 12 }}>{p.sku} · {p.category}</Text></div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div><Text strong type="danger">{p.currentStock} {p.unit}</Text></div>
                        <Text type="secondary" style={{ fontSize: 10 }}>min: {p.minStockLevel}</Text>
                      </div>
                    </div>
                  </Card>
                ))}
              </Space>
            )}
          </Card>
        </Col>
      </Row>

      <Card style={{ marginBottom: 16 }}>
        <SectionHead title="Team Performance" sub="Task completion by member" to="/management/employees" toLabel="Full Report" />
        {teamPerf.length === 0 ? <Empty text="No task data for team yet" /> : (
          <Table rowKey={(r, i) => r._id || i} columns={teamPerfColumns} dataSource={teamPerf} pagination={false} size="small" />
        )}
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <SectionHead title="Technical Queries" sub={`${techQueries.pendingCount} pending from Sales team`} to="/crm/queries" toLabel="View All" />
        {techQueries.recent.length === 0 ? <Empty text="No pending technical queries" /> : (
          <Space direction="vertical" style={{ width: '100%' }}>
            {techQueries.recent.map((q) => (
              <Card size="small" key={q._id} style={{ background: '#fff0f6', borderColor: '#ffadd2' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <Space align="start">
                    <HelpCircle style={{ color: '#eb2f96' }} />
                    <div>
                      <Space size={4}>
                        <Tag color={q.urgency === 'high' ? 'red' : q.urgency === 'medium' ? 'gold' : 'default'}>{q.urgency}</Tag>
                        {q.leadName && <Text type="secondary" style={{ fontSize: 12 }}>Lead: {q.leadName}</Text>}
                      </Space>
                      <div><Text strong style={{ fontSize: 13 }}>{q.title}</Text></div>
                      <Space size={12} wrap>
                        <Text type="secondary" style={{ fontSize: 12 }}>By: {q.raisedBy?.firstName} {q.raisedBy?.lastName}</Text>
                        {q.assignedTo ? <Text type="secondary" style={{ fontSize: 12 }}>→ {q.assignedTo.firstName} {q.assignedTo.lastName}</Text> : <Text type="warning" style={{ fontSize: 12 }}>Unassigned</Text>}
                        <Text type="secondary" style={{ fontSize: 12 }}>{q.createdAt ? formatDistanceToNow(new Date(q.createdAt), { addSuffix: true }) : ''}</Text>
                      </Space>
                    </div>
                  </Space>
                  <Link to="/crm/queries"><Button type="primary" size="small">Reply</Button></Link>
                </div>
              </Card>
            ))}
          </Space>
        )}
      </Card>

      <Card>
        <SectionHead title="Active Team Tasks" sub="Sorted by due date" to="/workflow" toLabel="Full Board" />
        {teamTasks.length === 0 ? <Empty text="No active tasks" /> : (
          <Space direction="vertical" style={{ width: '100%' }} split={<div style={{ borderBottom: '1px solid #f0f0f0' }} />}>
            {teamTasks.map((task) => {
              const due = task.dueDate ? getDueLabel(task.dueDate) : null;
              return (
                <div key={task._id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 4px', cursor: 'pointer', background: task.isOverdue ? '#fff1f0' : undefined, borderLeft: task.isOverdue ? '3px solid #ef4444' : undefined }}
                  onClick={() => toWorkflow(task)}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Space size={4} wrap>
                      <Tag color={STATUS_COLOR[task.status] || 'default'}>{task.status}</Tag>
                      <Tag color={PRIORITY_COLOR[task.priority] || 'default'}>{task.priority}</Tag>
                      {task.status === 'In Progress' && task.startDate && <InProgressTimer startDate={task.startDate} />}
                    </Space>
                    <div><Text strong style={{ fontSize: 13 }}>{task.title}</Text></div>
                    <Space size={12}>
                      <Text type="secondary" style={{ fontSize: 12 }}>{task.department}</Text>
                      {task.assignedTo && <Text type="secondary" style={{ fontSize: 12 }}>→ {task.assignedTo.firstName} {task.assignedTo.lastName}</Text>}
                    </Space>
                  </div>
                  <Space size={4} onClick={(e) => e.stopPropagation()}>
                    {due && <Text style={{ fontSize: 12, color: due.color, fontWeight: due.bold ? 700 : 500 }}>{due.label}</Text>}
                    <Zap style={{ color: '#94a3b8', cursor: 'pointer' }} onClick={() => toWorkflow(task)} />
                    <Link to="/workflow"><MenuIcon style={{ color: '#94a3b8' }} /></Link>
                  </Space>
                </div>
              );
            })}
          </Space>
        )}
      </Card>
    </div>
  );
}
