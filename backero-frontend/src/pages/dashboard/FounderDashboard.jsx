import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, AreaChart, Area,
} from 'recharts';
import {
  FileText, Users, LayoutGrid, Zap, DollarSign,
  AlertTriangle, CheckCircle2, Clock,
  BarChart3, Landmark, ShoppingBag, FlaskConical,
  ArrowRight, Bell, UserPlus, File, LayoutDashboard,
  HelpCircle, Check,
} from 'lucide-react';
import { Avatar, Badge, Card, Col, Empty, Progress, Row, Space, Spin, Tag, Typography } from 'antd';
import api from '../../api/axios';
import { ProductionStatBoxes } from './ProductionSnapshot';
import { useAuthStore } from '../../store/useAuthStore';
import { formatDistanceToNow, format } from 'date-fns';

const { Title, Text } = Typography;

const PRIORITY_COLOR = { critical: 'red', urgent: 'red', high: 'orange', medium: 'gold', low: 'default' };
const STATUS_COLOR = { Completed: 'green', Achieved: 'gold', 'In Progress': 'gold', Assigned: 'blue', 'Approval Pending': 'purple', 'Changes Requested': 'red', Pending: 'default' };
const DEPT_COLORS = ['#3b82f6', '#22c55e', '#f97316', '#9333ea', '#06b6d4', '#ec4899', '#f59e0b', '#6366f1'];

const fmt = (n) => (n || 0).toLocaleString('en-IN');
const pct = (n) => `${Math.round(n || 0)}%`;

function StatCard({ icon, label, value, sub, to, badge }) {
  const card = (
    <Card hoverable={!!to} size="small" style={{ height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ fontSize: 18, color: 'var(--ant-color-primary)' }}>{icon}</div>
        {badge !== undefined && (
          <Tag color={badge > 0 ? 'red' : 'default'} style={{ marginInlineEnd: 0 }}>{badge > 0 ? badge : <Check size={11} />}</Tag>
        )}
      </div>
      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>{value}</div>
        <Text style={{ fontSize: 12, fontWeight: 500 }}>{label}</Text>
        {sub && <div><Text type="secondary" style={{ fontSize: 11 }}>{sub}</Text></div>}
      </div>
    </Card>
  );
  return to ? <Link to={to}>{card}</Link> : card;
}

function SectionHeader({ title, sub, to, toLabel }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
      <div>
        <Text strong>{title}</Text>
        {sub && <div><Text type="secondary" style={{ fontSize: 12 }}>{sub}</Text></div>}
      </div>
      {to && <Link to={to}>{toLabel || 'View all'} <ArrowRight /></Link>}
    </div>
  );
}

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#fff', border: '1px solid #f0f0f0', borderRadius: 8, padding: '8px 12px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', fontSize: 12 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
      {payload.map((p) => <div key={p.name} style={{ color: p.color }}>{p.name}: <strong>₹{fmt(p.value)}</strong></div>)}
    </div>
  );
};

const QUICK_NAV = [
  { label: 'Task Board', sub: 'Kanban view', icon: <FileText />, to: '/tasks/kanban' },
  { label: 'CRM Pipeline', sub: 'Leads & follow-ups', icon: <Users />, to: '/crm/pipeline' },
  { label: 'Product Catalog', sub: 'Finished goods', icon: <LayoutGrid />, to: '/inventory/catalog' },
  { label: 'Raw Materials', sub: 'RM stock levels', icon: <FlaskConical />, to: '/inventory/rawmaterials' },
  { label: 'Production', sub: 'Orders & batches', icon: <Zap />, to: '/production/orders' },
  { label: 'Finance', sub: 'Ledger & invoices', icon: <DollarSign />, to: '/finance/ledger' },
  { label: 'Team', sub: 'Employees', icon: <UserPlus />, to: '/management/team' },
  { label: 'Approvals', sub: 'Review queue', icon: <CheckCircle2 />, to: '/tasks/approvals' },
  { label: 'Analytics', sub: 'Task reports', icon: <BarChart3 />, to: '/tasks/analytics' },
  { label: 'Departments', sub: 'Dept overview', icon: <Landmark />, to: '/management/departments' },
  { label: 'Settings', sub: 'Org settings', icon: <File />, to: '/settings' },
];

export default function FounderDashboard() {
  const { user } = useAuthStore();
  const navigate = useNavigate();

  const toWorkflow = (task) => {
    const parentId = task.parentTask?._id || task.parentTask;
    navigate(parentId ? `/workflow/${parentId}?view=dept` : `/workflow/${task._id}`);
  };

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', 'founder'],
    queryFn: () => api.get('/dashboard/founder').then((r) => r.data.dashboard),
    staleTime: 0,
    refetchInterval: 30 * 1000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });

  const { data: rmStatsData } = useQuery({
    queryKey: ['inventory', 'rm-stats'],
    queryFn: () => api.get('/inventory/raw-materials/stats').then((r) => r.data),
    staleTime: 60 * 1000,
  });
  const rmStats = {
    total: rmStatsData?.total || 0,
    low: rmStatsData?.lowStockCount || 0,
    out: rmStatsData?.outOfStockCount || 0,
  };

  if (isLoading) {
    return <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>;
  }

  const d = data || {};
  const company = d.company || {};
  const crm = d.crm || {};
  const finance = d.finance || {};
  const depts = d.departments || [];
  const topEmps = d.topEmployees || [];
  const approvals = d.pendingApprovals || [];
  const alerts = d.recentAlerts || [];
  const recentTasks = d.recentTasks || [];
  const techQueries = d.technicalQueries || { pendingCount: 0, recent: [] };

  const taskPieData = [
    { name: 'Completed', value: company.completedTasks || 0, color: '#22c55e' },
    { name: 'In Progress', value: company.inProgressTasks || 0, color: '#f97316' },
    { name: 'Assigned', value: company.pendingTasks || 0, color: '#3b82f6' },
    { name: 'Approval', value: company.approvalPendingTasks || 0, color: '#9333ea' },
    { name: 'Overdue', value: company.overdueTaskCount || 0, color: '#ef4444' },
  ].filter((x) => x.value > 0);

  const deptBarData = depts.map((x) => ({ name: x._id || 'Unknown', Total: x.total || 0, Done: x.completed || 0, Overdue: x.overdue || 0 }));

  const crmPipeData = [
    { name: 'New', value: crm.newLeads || 0, fill: '#3b82f6' },
    { name: 'Follow-up', value: crm.followUp || 0, fill: '#f97316' },
    { name: 'Interested', value: crm.interested || 0, fill: '#9333ea' },
    { name: 'Payment Pending', value: crm.wonLeads || 0, fill: '#22c55e' },
    { name: 'Lost', value: crm.lostLeads || 0, fill: '#ef4444' },
  ].filter((x) => x.value > 0);

  const revenueData = finance.revenueChart || [];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <Title level={4} style={{ marginBottom: 0 }}>Command Center</Title>
          <Text type="secondary">{greeting}, {user?.firstName}. Here's your complete business overview.</Text>
        </div>
        <Space>
          <Text type="secondary">{format(new Date(), 'EEEE, dd MMMM yyyy')}</Text>
          <Badge status="processing" text="Live" />
        </Space>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} lg={6}><StatCard icon={<FileText />} label="Total Tasks" value={company.totalTasks || 0} sub={`${pct(company.completionRate)} completion rate`} to="/workflow" /></Col>
        <Col xs={12} lg={6}><StatCard icon={<CheckCircle2 />} label="Completed Tasks" value={company.completedTasks || 0} sub={`${company.inProgressTasks || 0} in progress`} to="/workflow" /></Col>
        <Col xs={12} lg={6}><StatCard icon={<AlertTriangle />} label="Overdue Tasks" value={company.overdueTaskCount || 0} sub="Need immediate attention" badge={company.overdueTaskCount || 0} to="/workflow" /></Col>
        <Col xs={12} lg={6}><StatCard icon={<Clock />} label="Pending Approvals" value={company.pendingApprovalsCount || 0} sub="Waiting for your review" badge={company.pendingApprovalsCount || 0} to="/tasks/approvals" /></Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} lg={4}><StatCard icon={<UserPlus />} label="Active Employees" value={company.totalEmployees || 0} sub="Across all departments" to="/management/team" /></Col>
        <Col xs={12} lg={4}><StatCard icon={<Users />} label="Total Leads" value={crm.totalLeads || 0} sub={`${pct(crm.conversionRate)} conversion rate`} to="/crm/pipeline" /></Col>
        <Col xs={12} lg={4}><StatCard icon={<LayoutGrid />} label="Product Catalog" value={d.inventory?.catalogProductCount || 0} sub="Finished goods catalog" to="/inventory/catalog" /></Col>
        <Col xs={12} lg={4}>
          <StatCard
            icon={<FlaskConical />} label="Raw Materials" value={rmStats.total}
            sub={rmStats.out > 0 ? `${rmStats.out} out of stock${rmStats.low > 0 ? `, ${rmStats.low} low` : ''}` : rmStats.low > 0 ? `${rmStats.low} low stock` : 'All levels healthy'}
            badge={rmStats.out + rmStats.low} to="/inventory/rawmaterials"
          />
        </Col>
        <Col xs={12} lg={4}><StatCard icon={<Zap />} label="Active Production" value={d.production?.activeOrders || 0} sub="Orders in progress" to="/samples" /></Col>
        <Col xs={12} lg={4}><StatCard icon={<HelpCircle />} label="Pending Queries" value={techQueries.pendingCount} sub="Technical queries from Sales" badge={techQueries.pendingCount} to="/crm/queries" /></Col>
      </Row>

      <div style={{ marginBottom: 16 }}><ProductionStatBoxes department="Production" /></div>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Card>
            <SectionHeader title="Finance Overview" sub="Income vs Expense" to="/finance/ledger" toLabel="Ledger" />
            <Space direction="vertical" style={{ width: '100%' }} split={<div style={{ borderBottom: '1px solid #f0f0f0' }} />}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><Text type="secondary">Today's Income</Text><Text strong style={{ color: '#389e0d' }}>₹{fmt(finance.todayIncome)}</Text></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><Text type="secondary">Today's Expense</Text><Text strong type="danger">₹{fmt(finance.todayExpense)}</Text></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><Text>Today Net</Text><Text strong style={{ color: (finance.todayNet || 0) >= 0 ? '#389e0d' : '#cf1322' }}>₹{fmt(finance.todayNet)}</Text></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><Text type="secondary">This Month Income</Text><Text strong style={{ color: '#389e0d' }}>₹{fmt(finance.monthIncome)}</Text></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><Text type="secondary">This Month Expense</Text><Text strong type="danger">₹{fmt(finance.monthExpense)}</Text></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><Text>Total Revenue</Text><Text strong style={{ color: 'var(--ant-color-primary)' }}>₹{fmt(finance.totalRevenue)}</Text></div>
              {d.inventory?.totalStockValue > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><Text type="secondary">Inventory Value</Text><Text strong style={{ color: '#1677ff' }}>₹{fmt(d.inventory?.totalStockValue)}</Text></div>
              )}
            </Space>
            {revenueData.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>Monthly Revenue Trend</Text>
                <ResponsiveContainer width="100%" height={80}>
                  <AreaChart data={revenueData}>
                    <defs>
                      <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area type="monotone" dataKey="revenue" stroke="#3b82f6" fill="url(#revGrad)" strokeWidth={2} dot={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip />} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        </Col>

        <Col span={8}>
          <Card>
            <SectionHeader title="Task Status Breakdown" sub={`${company.totalTasks || 0} total tasks`} to="/tasks/analytics" toLabel="Analytics" />
            {taskPieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={taskPieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                    {taskPieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Legend iconType="circle" iconSize={8} />
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : <Empty description="No tasks yet" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: '40px 0' }} />}
          </Card>
        </Col>

        <Col span={8}>
          <Card>
            <SectionHeader title="CRM Pipeline" sub={`${crm.totalLeads || 0} leads · ${pct(crm.conversionRate)} win rate`} to="/crm/pipeline" toLabel="Pipeline" />
            {crmPipeData.length > 0 ? (
              <Space direction="vertical" style={{ width: '100%' }} size={12}>
                {crmPipeData.map((item) => (
                  <div key={item.name}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                      <Text type="secondary">{item.name}</Text>
                      <Text strong>{item.value}</Text>
                    </div>
                    <Progress percent={crm.totalLeads > 0 ? (item.value / crm.totalLeads) * 100 : 0} showInfo={false} strokeColor={item.fill} size="small" />
                  </div>
                ))}
              </Space>
            ) : <Empty description="No leads yet" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: '40px 0' }} />}
          </Card>
        </Col>
      </Row>

      {deptBarData.length > 0 && (
        <Card style={{ marginBottom: 16 }}>
          <SectionHeader title="Department Performance" sub="Tasks by department — completed vs overdue" to="/management/departments" toLabel="Full Report" />
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={deptBarData} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend iconType="circle" iconSize={8} />
              <Bar dataKey="Total" fill="#3b82f6" radius={[3, 3, 0, 0]} name="Total" />
              <Bar dataKey="Done" fill="#22c55e" radius={[3, 3, 0, 0]} name="Completed" />
              <Bar dataKey="Overdue" fill="#ef4444" radius={[3, 3, 0, 0]} name="Overdue" />
            </BarChart>
          </ResponsiveContainer>

          <Row gutter={[12, 12]} style={{ marginTop: 16 }}>
            {depts.map((dept, i) => (
              <Col key={dept._id || i} xs={12} sm={8} lg={6} xl={3}>
                <Card size="small" style={{ textAlign: 'center' }}>
                  <Avatar style={{ backgroundColor: DEPT_COLORS[i % DEPT_COLORS.length] }}>{(dept._id || 'U')[0]}</Avatar>
                  <div style={{ marginTop: 8 }}>
                    <Text style={{ fontSize: 12, fontWeight: 500 }} ellipsis>{dept._id || 'Unknown'}</Text>
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{pct(dept.completionRate)}</div>
                  <Text type="secondary" style={{ fontSize: 12 }}>{dept.total} tasks</Text>
                  <Progress percent={dept.completionRate || 0} showInfo={false} strokeColor={DEPT_COLORS[i % DEPT_COLORS.length]} size="small" style={{ marginTop: 8 }} />
                </Card>
              </Col>
            ))}
          </Row>
        </Card>
      )}

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={12}>
          <Card>
            <SectionHeader title="Pending Approvals" sub={`${approvals.length} task${approvals.length !== 1 ? 's' : ''} waiting for review`} to="/tasks/approvals" toLabel="Review All" />
            {approvals.length === 0 ? (
              <Empty description="All approvals are clear!" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <Space direction="vertical" style={{ width: '100%' }}>
                {approvals.map((ap) => (
                  <Card size="small" key={ap._id}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Text strong style={{ cursor: 'pointer' }} onClick={() => ap.taskId && toWorkflow(ap.taskId)}>{ap.taskId?.title}</Text>
                        <Space size={4} style={{ marginTop: 4 }} wrap>
                          <Tag color={PRIORITY_COLOR[ap.taskId?.priority] || 'default'}>{ap.taskId?.priority}</Tag>
                          <Text type="secondary" style={{ fontSize: 12 }}>{ap.requestedBy?.firstName} {ap.requestedBy?.lastName}</Text>
                          <Text type="secondary" style={{ fontSize: 12 }}>{ap.requestedAt ? formatDistanceToNow(new Date(ap.requestedAt), { addSuffix: true }) : ''}</Text>
                        </Space>
                      </div>
                      <Link to="/tasks/approvals">Review</Link>
                    </div>
                  </Card>
                ))}
              </Space>
            )}
          </Card>
        </Col>

        <Col span={12}>
          <Card>
            <SectionHeader title="Top Performers" sub="Ranked by completed tasks" to="/management/employees" toLabel="All Employees" />
            {topEmps.length === 0 ? (
              <Empty description="No task data yet" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <Space direction="vertical" style={{ width: '100%' }} size={12}>
                {topEmps.map((emp, i) => (
                  <div key={emp.userId || i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Text type="secondary" style={{ width: 20, fontSize: 12, textAlign: 'center' }}>#{i + 1}</Text>
                    <Avatar size={32}>{emp.firstName?.[0]}{emp.lastName?.[0]}</Avatar>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Text style={{ fontSize: 13, fontWeight: 500 }} ellipsis>{emp.firstName} {emp.lastName}</Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>{emp.completed}/{emp.total}</Text>
                      </div>
                      <Progress percent={emp.completionRate || 0} showInfo={false} strokeColor={DEPT_COLORS[i % DEPT_COLORS.length]} size="small" />
                    </div>
                    <Text strong style={{ width: 40, textAlign: 'right' }}>{pct(emp.completionRate)}</Text>
                  </div>
                ))}
              </Space>
            )}
          </Card>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={12}>
          <Card>
            <SectionHeader title="Recent Tasks" sub="Latest tasks across all departments" to="/workflow" toLabel="View Board" />
            {recentTasks.length === 0 ? (
              <Empty description="No tasks created yet" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <Space direction="vertical" style={{ width: '100%' }}>
                {recentTasks.map((task) => (
                  <div key={task._id} style={{ padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
                    <Space size={4} wrap>
                      <Tag color={STATUS_COLOR[task.status] || 'default'}>{task.status}</Tag>
                      <Tag color={PRIORITY_COLOR[task.priority] || 'default'}>{task.priority}</Tag>
                    </Space>
                    <div><Text strong style={{ cursor: 'pointer' }} onClick={() => toWorkflow(task)}>{task.title}</Text></div>
                    <Space size={12}>
                      <Text type="secondary" style={{ fontSize: 12 }}>{task.department}</Text>
                      {task.assignedTo && <Text type="secondary" style={{ fontSize: 12 }}>→ {task.assignedTo.firstName} {task.assignedTo.lastName}</Text>}
                      {task.isOverdue && <Text type="danger" style={{ fontSize: 12, fontWeight: 500 }}>Overdue</Text>}
                    </Space>
                  </div>
                ))}
              </Space>
            )}
          </Card>
        </Col>

        <Col span={12}>
          <Card>
            <SectionHeader title="Critical Alerts" sub="High priority unread notifications" to="/settings" toLabel="All Notifications" />
            {alerts.length === 0 ? (
              <Empty description="No critical alerts" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <Space direction="vertical" style={{ width: '100%' }}>
                {alerts.map((alert) => (
                  <Card size="small" key={alert._id} style={{ background: '#fff2f0', borderColor: '#ffccc7' }}>
                    <Space align="start">
                      <Bell style={{ color: '#ff4d4f' }} />
                      <div>
                        <Text strong style={{ fontSize: 13 }}>{alert.title}</Text>
                        <div><Text type="secondary" style={{ fontSize: 12 }}>{alert.message}</Text></div>
                        <Text type="secondary" style={{ fontSize: 11 }}>{alert.createdAt ? formatDistanceToNow(new Date(alert.createdAt), { addSuffix: true }) : ''}</Text>
                      </div>
                    </Space>
                  </Card>
                ))}
              </Space>
            )}
          </Card>
        </Col>
      </Row>

      <Card style={{ marginBottom: 16 }}>
        <SectionHeader title="Technical Queries" sub={`${techQueries.pendingCount} pending queries from Sales team`} to="/crm/queries" toLabel="View All" />
        {techQueries.recent.length === 0 ? (
          <Empty description="No pending technical queries" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
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
                        {q.assignedTo ? (
                          <Text type="secondary" style={{ fontSize: 12 }}>Assigned: {q.assignedTo.firstName} {q.assignedTo.lastName}</Text>
                        ) : <Text type="warning" style={{ fontSize: 12 }}>Unassigned</Text>}
                        <Text type="secondary" style={{ fontSize: 12 }}>{q.createdAt ? formatDistanceToNow(new Date(q.createdAt), { addSuffix: true }) : ''}</Text>
                      </Space>
                    </div>
                  </Space>
                  <Link to="/crm/queries">Reply</Link>
                </div>
              </Card>
            ))}
          </Space>
        )}
      </Card>

      <Title level={5} style={{ marginBottom: 16 }}>Quick Navigation</Title>
      <Row gutter={[12, 12]}>
        {QUICK_NAV.map((item) => (
          <Col key={item.to} xs={12} sm={8} lg={6} xl={4}>
            <Link to={item.to}>
              <Card hoverable size="small">
                <div style={{ fontSize: 18, color: 'var(--ant-color-primary)', marginBottom: 8 }}>{item.icon}</div>
                <Text strong style={{ fontSize: 13 }}>{item.label}</Text>
                <div><Text type="secondary" style={{ fontSize: 12 }}>{item.sub}</Text></div>
              </Card>
            </Link>
          </Col>
        ))}
      </Row>
    </div>
  );
}
