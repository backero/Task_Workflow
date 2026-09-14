import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import {
  Zap, TrendingUp, Clock, AlertTriangle, CheckCircle2, Users, BarChart3, ArrowRight,
} from 'lucide-react';
import { Avatar, Badge, Card, Col, Empty, Progress, Row, Space, Spin, Table, Tag, Typography } from 'antd';
import { format, startOfWeek, endOfWeek, eachDayOfInterval, isWithinInterval, isPast, subWeeks, startOfDay } from 'date-fns';
import api from '../../api/axios';

const { Title, Text } = Typography;

const STATUS_COLOR = {
  'Completed':         '#22c55e',
  'In Progress':       '#eab308',
  'Assigned':          '#3b82f6',
  'Pending':           '#94a3b8',
  'Approval Pending':  '#6366f1',
  'Changes Requested': '#f97316',
  'Reopened':          '#ef4444',
  'Cancelled':         '#6b7280',
};

const PRIORITY_COLOR = {
  critical: '#ef4444', urgent: '#f97316',
  high: '#f59e0b', medium: '#3b82f6', low: '#94a3b8',
};

const AVATAR_COLORS = ['#3b82f6', '#8b5cf6', '#14b8a6', '#f59e0b', '#ec4899', '#22c55e', '#f43f5e', '#06b6d4'];

function Ring({ pct, color, size = 64 }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f1f5f9" strokeWidth={7} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={7}
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dasharray 0.6s ease' }}
      />
      <text x={size / 2} y={size / 2 + 4} textAnchor="middle" fontSize={11} fontWeight="700" fill={color}>{pct}%</text>
    </svg>
  );
}

export default function DeptDashboard({ dept, color, description, icon: Icon, quickLinks = [] }) {
  const navigate = useNavigate();
  const deptParam = encodeURIComponent(dept);

  const { data: allTasksData, isLoading } = useQuery({
    queryKey: ['dept-dashboard', dept, 'all'],
    queryFn: () => api.get(`/tasks?department=${deptParam}&limit=300`).then(r => r.data),
    refetchInterval: 5 * 60 * 1000,
  });

  const tasks = useMemo(() => allTasksData?.data || [], [allTasksData]);

  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd   = endOfWeek(now,   { weekStartsOn: 1 });
  const prevWeekStart = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
  const prevWeekEnd   = endOfWeek(subWeeks(now, 1),   { weekStartsOn: 1 });

  const inThisWeek = (d) => d && isWithinInterval(new Date(d), { start: weekStart, end: weekEnd });
  const inPrevWeek = (d) => d && isWithinInterval(new Date(d), { start: prevWeekStart, end: prevWeekEnd });

  const stats = useMemo(() => {
    const total       = tasks.length;
    const completed   = tasks.filter(t => t.status === 'Completed').length;
    const inProgress  = tasks.filter(t => t.status === 'In Progress').length;
    const overdue     = tasks.filter(t => t.dueDate && isPast(new Date(t.dueDate)) && t.status !== 'Completed').length;
    const approval    = tasks.filter(t => t.status === 'Approval Pending').length;
    const completedThisWeek = tasks.filter(t => t.status === 'Completed' && inThisWeek(t.updatedAt)).length;
    const completedPrevWeek = tasks.filter(t => t.status === 'Completed' && inPrevWeek(t.updatedAt)).length;
    const createdThisWeek   = tasks.filter(t => inThisWeek(t.createdAt)).length;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    const onTimeRate = completed > 0
      ? Math.round((tasks.filter(t => t.status === 'Completed' && t.dueDate && new Date(t.updatedAt) <= new Date(t.dueDate)).length / completed) * 100)
      : 0;
    const weekChange = completedPrevWeek > 0
      ? Math.round(((completedThisWeek - completedPrevWeek) / completedPrevWeek) * 100)
      : completedThisWeek > 0 ? 100 : 0;
    return { total, completed, inProgress, overdue, approval, completedThisWeek, completedPrevWeek, createdThisWeek, completionRate, onTimeRate, weekChange };
  }, [tasks]);

  const weeklyTrend = useMemo(() => {
    const days = eachDayOfInterval({ start: weekStart, end: weekEnd });
    return days.map(day => {
      const dayStr = format(day, 'EEE');
      const dayStart = startOfDay(day);
      const dayEnd = new Date(dayStart.getTime() + 86400000 - 1);
      const completedOnDay = tasks.filter(t =>
        t.status === 'Completed' && t.updatedAt &&
        isWithinInterval(new Date(t.updatedAt), { start: dayStart, end: dayEnd })
      ).length;
      const updatedOnDay = tasks.filter(t =>
        t.updatedAt && isWithinInterval(new Date(t.updatedAt), { start: dayStart, end: dayEnd }) && t.status !== 'Completed'
      ).length;
      return { day: dayStr, Completed: completedOnDay, Active: updatedOnDay };
    });
  }, [tasks, weekStart, weekEnd]);

  const statusDist = useMemo(() => {
    const map = {};
    tasks.forEach(t => { map[t.status] = (map[t.status] || 0) + 1; });
    return Object.entries(map).map(([name, value]) => ({ name, value, color: STATUS_COLOR[name] || '#94a3b8' })).sort((a, b) => b.value - a.value);
  }, [tasks]);

  const priorityDist = useMemo(() => {
    const map = {};
    tasks.forEach(t => { map[t.priority] = (map[t.priority] || 0) + 1; });
    return Object.entries(map).map(([name, value]) => ({ name, value, color: PRIORITY_COLOR[name] || '#94a3b8' }));
  }, [tasks]);

  const teamPerf = useMemo(() => {
    const memberMap = {};
    tasks.forEach(t => {
      if (!t.assignedTo) return;
      const id = t.assignedTo._id;
      if (!memberMap[id]) {
        memberMap[id] = { id, name: `${t.assignedTo.firstName} ${t.assignedTo.lastName}`, total: 0, completed: 0, inProgress: 0, overdue: 0 };
      }
      memberMap[id].total++;
      if (t.status === 'Completed') memberMap[id].completed++;
      if (t.status === 'In Progress') memberMap[id].inProgress++;
      if (t.dueDate && isPast(new Date(t.dueDate)) && t.status !== 'Completed') memberMap[id].overdue++;
    });
    return Object.values(memberMap)
      .map((m, i) => ({ ...m, rate: m.total > 0 ? Math.round((m.completed / m.total) * 100) : 0, color: AVATAR_COLORS[i % AVATAR_COLORS.length] }))
      .sort((a, b) => b.completed - a.completed)
      .slice(0, 8);
  }, [tasks]);

  const overdueTasks = useMemo(() =>
    tasks.filter(t => t.dueDate && isPast(new Date(t.dueDate)) && t.status !== 'Completed')
         .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate)).slice(0, 6),
  [tasks]);

  const recentDone = useMemo(() =>
    tasks.filter(t => t.status === 'Completed')
         .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, 5),
  [tasks]);

  if (isLoading) {
    return <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>;
  }

  const teamColumns = [
    {
      title: 'Member', key: 'member',
      render: (_, m, i) => (
        <Space>
          <Avatar style={{ backgroundColor: m.color }}>{m.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}</Avatar>
          <Text strong style={{ fontSize: 13 }}>{m.name}</Text>
          {i === 0 && <Tag color="gold">TOP</Tag>}
        </Space>
      ),
    },
    { title: 'Total', dataIndex: 'total', key: 'total', align: 'center' },
    { title: 'Done', dataIndex: 'completed', key: 'completed', align: 'center', render: (v) => <Text style={{ color: '#059669', fontWeight: 700 }}>{v}</Text> },
    { title: 'Active', dataIndex: 'inProgress', key: 'inProgress', align: 'center', render: (v) => <Text style={{ color: '#d97706', fontWeight: 600 }}>{v}</Text> },
    { title: 'Overdue', dataIndex: 'overdue', key: 'overdue', align: 'center', render: (v) => <Text type={v > 0 ? 'danger' : 'secondary'} strong>{v}</Text> },
    {
      title: 'Completion', key: 'completion',
      render: (_, m) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Progress percent={m.rate} showInfo={false} size="small" style={{ flex: 1 }} strokeColor={m.rate >= 70 ? '#22c55e' : m.rate >= 40 ? color : '#ef4444'} />
          <Text strong style={{ fontSize: 12, width: 36, textAlign: 'right' }}>{m.rate}%</Text>
        </div>
      ),
    },
  ];

  return (
    <div>
      <Card style={{ marginBottom: 16, overflow: 'hidden' }} styles={{ body: { padding: 0 } }}>
        <div style={{ background: `linear-gradient(135deg, ${color}ee 0%, ${color}99 100%)`, padding: '20px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
            <Space size={16}>
              <div style={{ width: 48, height: 48, borderRadius: 16, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={22} color="#fff" />
              </div>
              <div>
                <Title level={4} style={{ color: '#fff', margin: 0 }}>{dept} Department</Title>
                <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>{description}</Text>
              </div>
            </Space>
            <Space wrap>
              {quickLinks.map(link => (
                <button
                  key={link.to} onClick={() => navigate(link.to)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', background: 'rgba(255,255,255,0.15)', color: '#fff', fontSize: 12, fontWeight: 600, borderRadius: 10, border: '1px solid rgba(255,255,255,0.25)', cursor: 'pointer' }}
                >
                  {link.icon && <link.icon className="w-3.5 h-3.5" />}
                  {link.label}
                </button>
              ))}
              <button
                onClick={() => navigate('/workflow')}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: 'rgba(255,255,255,0.15)', color: '#fff', fontSize: 13, fontWeight: 600, borderRadius: 10, border: '1px solid rgba(255,255,255,0.25)', cursor: 'pointer' }}
              >
                <Zap size={14} /> Workflow <ArrowRight size={13} />
              </button>
            </Space>
          </div>
        </div>
        <Row>
          {[
            { label: 'Total Tasks', value: stats.total, color },
            { label: 'Completed', value: stats.completed, color: '#22c55e' },
            { label: 'In Progress', value: stats.inProgress, color: '#eab308' },
            { label: 'Overdue', value: stats.overdue, color: stats.overdue > 0 ? '#ef4444' : '#94a3b8' },
          ].map((s) => (
            <Col span={6} key={s.label} style={{ textAlign: 'center', padding: '16px 0', borderRight: '1px solid #f0f0f0' }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
              <Text type="secondary" style={{ fontSize: 12, fontWeight: 500 }}>{s.label}</Text>
            </Col>
          ))}
        </Row>
      </Card>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={16}>
          <Card>
            <Title level={5} style={{ marginBottom: 16 }}>This Week <Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>{format(weekStart, 'dd MMM')} – {format(weekEnd, 'dd MMM')}</Text></Title>
            <Row gutter={16} style={{ marginBottom: 20 }}>
              <Col span={8} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 700, color }}>{stats.createdThisWeek}</div>
                <Text type="secondary" style={{ fontSize: 11 }}>Created</Text>
              </Col>
              <Col span={8} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#22c55e' }}>{stats.completedThisWeek}</div>
                <Text type="secondary" style={{ fontSize: 11 }}>Completed</Text>
                {stats.weekChange !== 0 && <div><Text style={{ fontSize: 10, fontWeight: 700, color: stats.weekChange >= 0 ? '#16a34a' : '#dc2626' }}>{stats.weekChange > 0 ? '+' : ''}{stats.weekChange}% vs last wk</Text></div>}
              </Col>
              <Col span={8} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#6366f1' }}>{stats.approval}</div>
                <Text type="secondary" style={{ fontSize: 11 }}>Need Approval</Text>
              </Col>
            </Row>
            <ResponsiveContainer width="100%" height={130}>
              <BarChart data={weeklyTrend} barSize={14} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={20} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="Completed" fill="#22c55e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Active" fill={color} radius={[4, 4, 0, 0]} opacity={0.55} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>

        <Col span={8}>
          <Card>
            <Title level={5} style={{ marginBottom: 16 }}>Performance</Title>
            <Space direction="vertical" size={20} style={{ width: '100%' }}>
              {[
                { label: 'Completion Rate', sub: `${stats.completed} of ${stats.total} done`, pct: stats.completionRate, color: '#22c55e' },
                { label: 'On-Time Delivery', sub: 'Tasks done before due date', pct: stats.onTimeRate, color },
                { label: 'Health Score', sub: `${stats.overdue} overdue task${stats.overdue !== 1 ? 's' : ''}`, pct: stats.total > 0 ? Math.round(((stats.total - stats.overdue) / stats.total) * 100) : 100, color: '#6366f1' },
              ].map((p) => (
                <Space key={p.label} size={12}>
                  <Ring pct={p.pct} color={p.color} />
                  <div>
                    <Text strong style={{ fontSize: 13, display: 'block' }}>{p.label}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>{p.sub}</Text>
                  </div>
                </Space>
              ))}
            </Space>
          </Card>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={12}>
          <Card>
            <Title level={5} style={{ marginBottom: 16 }}>Status Breakdown</Title>
            {statusDist.length === 0 ? <Empty description="No tasks yet" image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
              <Space direction="vertical" style={{ width: '100%' }} size={12}>
                {statusDist.map((s) => (
                  <div key={s.name}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Space size={6}><span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, display: 'inline-block' }} /><Text style={{ fontSize: 12, fontWeight: 600 }}>{s.name}</Text></Space>
                      <Text strong style={{ fontSize: 12 }}>{s.value} <Text type="secondary" style={{ fontWeight: 400, fontSize: 12 }}>({stats.total > 0 ? Math.round((s.value / stats.total) * 100) : 0}%)</Text></Text>
                    </div>
                    <Progress percent={stats.total > 0 ? (s.value / stats.total) * 100 : 0} showInfo={false} size="small" strokeColor={s.color} />
                  </div>
                ))}
              </Space>
            )}
          </Card>
        </Col>

        <Col span={12}>
          <Card>
            <Title level={5} style={{ marginBottom: 16 }}>Priority Distribution</Title>
            {priorityDist.length === 0 ? <Empty description="No tasks yet" image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={priorityDist} cx="50%" cy="50%" innerRadius={48} outerRadius={76} paddingAngle={3} dataKey="value">
                    {priorityDist.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip formatter={(val) => [`${val} tasks`, '']} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>
      </Row>

      <Card style={{ marginBottom: 16 }}>
        <Space style={{ marginBottom: 16 }}>
          <Users size={16} color="#64748b" />
          <Title level={5} style={{ marginBottom: 0 }}>Team Performance</Title>
          <Text type="secondary" style={{ fontSize: 12 }}>{teamPerf.length} members</Text>
        </Space>
        {teamPerf.length === 0 ? <Empty description="No assigned tasks yet" /> : (
          <Table rowKey="id" columns={teamColumns} dataSource={teamPerf} pagination={false} size="small" />
        )}
      </Card>

      <Row gutter={16}>
        <Col span={12}>
          <Card>
            <Space style={{ marginBottom: 16 }}>
              <AlertTriangle size={16} color="#ef4444" />
              <Title level={5} style={{ marginBottom: 0 }}>Overdue Tasks</Title>
              {stats.overdue > 0 && <Badge count={stats.overdue} />}
            </Space>
            {overdueTasks.length === 0 ? (
              <Empty image={<CheckCircle2 size={32} color="#22c55e" style={{ margin: '0 auto' }} />} description="All clear! No overdue tasks" />
            ) : (
              <Space direction="vertical" style={{ width: '100%' }} size={8}>
                {overdueTasks.map((t) => {
                  const daysLate = Math.floor((Date.now() - new Date(t.dueDate)) / 86400000);
                  return (
                    <Card key={t._id} size="small" hoverable style={{ background: '#fff1f0', borderColor: '#ffccc7' }} onClick={() => navigate(`/workflow/${t._id}`)}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444', flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <Text strong style={{ fontSize: 12 }} ellipsis>{t.title}</Text>
                          <div><Text type="secondary" style={{ fontSize: 11 }}>{t.assignedTo ? `${t.assignedTo.firstName} ${t.assignedTo.lastName}` : 'Unassigned'} · {format(new Date(t.dueDate), 'dd MMM')}</Text></div>
                        </div>
                        <Tag color="red">{daysLate}d late</Tag>
                      </div>
                    </Card>
                  );
                })}
              </Space>
            )}
          </Card>
        </Col>

        <Col span={12}>
          <Card>
            <Space style={{ marginBottom: 16 }}>
              <CheckCircle2 size={16} color="#22c55e" />
              <Title level={5} style={{ marginBottom: 0 }}>Recently Completed</Title>
            </Space>
            {recentDone.length === 0 ? (
              <Empty image={<Clock size={32} color="#d1d5db" style={{ margin: '0 auto' }} />} description="No completed tasks yet" />
            ) : (
              <Space direction="vertical" style={{ width: '100%' }} size={8}>
                {recentDone.map((t) => (
                  <Card key={t._id} size="small" hoverable style={{ background: '#f6ffed', borderColor: '#b7eb8f' }} onClick={() => navigate(`/workflow/${t._id}`)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <CheckCircle2 size={14} color="#22c55e" style={{ flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Text strong style={{ fontSize: 12 }} ellipsis>{t.title}</Text>
                        <div><Text type="secondary" style={{ fontSize: 11 }}>{t.assignedTo ? `${t.assignedTo.firstName} ${t.assignedTo.lastName}` : '—'}{t.updatedAt ? ` · ${format(new Date(t.updatedAt), 'dd MMM, h:mm a')}` : ''}</Text></div>
                      </div>
                      <Tag color="green">Done</Tag>
                    </div>
                  </Card>
                ))}
              </Space>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
