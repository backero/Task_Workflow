import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarCheck, CalendarDays, Search, TriangleAlert, Settings as SettingsIcon, X, Clock, ShieldCheck } from 'lucide-react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { Button, Card, Col, DatePicker, Drawer, Empty, Input, Row, Select, Space, Table, Tabs, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { usePermissions } from '../../store/usePermissions';
import HolidaysCard from '../../components/attendance/HolidaysCard';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

const STATUS_COLOR = {
  PRESENT: 'green', ABSENT: 'red', LATE: 'gold', HALF_DAY: 'orange',
  ON_LEAVE: 'blue', HOLIDAY: 'purple', WEEK_OFF: 'default', MISSING_PUNCH: 'red', INCOMPLETE: 'volcano',
};

function fmtTime(v) {
  return v ? dayjs(v).format('HH:mm') : '—';
}
function fmtDateTime(v) {
  return v ? dayjs(v).format('DD MMM, HH:mm') : '—';
}

// ── Employee history + correction drawer ────────────────────────────────────
function EmployeeAttendanceDrawer({ employeeId, employeeLabel, open, onClose, hasPermission }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [pendingCorrection, setPendingCorrection] = useState(null); // { attendanceId, correctionId } — session-local only

  const { data, isLoading } = useQuery({
    queryKey: ['attendance-history', employeeId],
    queryFn: () => api.get(`/attendance/${employeeId}`).then((r) => r.data),
    enabled: open && !!employeeId,
  });
  const rows = data?.attendance || [];

  const correctMutation = useMutation({
    mutationFn: ({ attendanceId, body }) => api.post(`/attendance/${attendanceId}/correct`, body),
    onSuccess: (res, { attendanceId }) => {
      qc.invalidateQueries({ queryKey: ['attendance-history', employeeId] });
      qc.invalidateQueries({ queryKey: ['attendance-today'] });
      if (res.data.correction) {
        setPendingCorrection({ attendanceId, correctionId: res.data.correction._id });
        toast.success('Correction submitted for approval (period is finalized)');
      } else {
        toast.success('Correction applied');
      }
      setReason(''); setCheckIn(''); setCheckOut('');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to request correction'),
  });

  const approveMutation = useMutation({
    mutationFn: ({ attendanceId, correctionId }) => api.post(`/attendance/${attendanceId}/correct/${correctionId}/approve`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attendance-history', employeeId] });
      qc.invalidateQueries({ queryKey: ['attendance-today'] });
      setPendingCorrection(null);
      toast.success('Correction approved');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to approve — a different approver than the requester is required'),
  });

  const latest = rows[0];

  return (
    <Drawer open={open} onClose={onClose} width={480} closeIcon={<X size={18} />} title={employeeLabel || 'Attendance History'}>
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><Text type="secondary">Loading…</Text></div>
      ) : (
        <Space direction="vertical" style={{ width: '100%' }} size={20}>
          {hasPermission('attendance:correct') && latest && (
            <Card size="small" title="Request Correction (most recent day)">
              <Space direction="vertical" style={{ width: '100%' }} size={10}>
                <Text type="secondary" style={{ fontSize: 12 }}>{dayjs(latest.attendanceDate).format('DD MMM YYYY')} — current: {fmtTime(latest.checkIn)} → {fmtTime(latest.checkOut)}</Text>
                <Row gutter={8}>
                  <Col span={12}>
                    <Text style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>New Check-in</Text>
                    <Input type="datetime-local" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
                  </Col>
                  <Col span={12}>
                    <Text style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>New Check-out</Text>
                    <Input type="datetime-local" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
                  </Col>
                </Row>
                <TextArea rows={2} placeholder="Reason (min 5 characters)" value={reason} onChange={(e) => setReason(e.target.value)} />
                <Button
                  type="primary" size="small" loading={correctMutation.isPending}
                  disabled={reason.trim().length < 5 || (!checkIn && !checkOut)}
                  onClick={() => correctMutation.mutate({
                    attendanceId: latest._id,
                    body: { reason, check_in: checkIn || undefined, check_out: checkOut || undefined },
                  })}
                >
                  Submit Correction
                </Button>

                {pendingCorrection?.attendanceId === latest._id && hasPermission('period:finalize') && (
                  <Card size="small" style={{ background: '#fffbeb', borderColor: '#fde68a' }}>
                    <Space size={6} style={{ marginBottom: 8 }}><Clock size={13} /><Text style={{ fontSize: 12 }}>Pending approval — you just submitted this.</Text></Space>
                    <Button size="small" type="primary" loading={approveMutation.isPending} onClick={() => approveMutation.mutate(pendingCorrection)}>Approve Correction</Button>
                    <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>A different admin than the requester must approve — self-approval is blocked.</Text>
                  </Card>
                )}
              </Space>
            </Card>
          )}

          <div>
            <Title level={5} style={{ marginBottom: 8 }}>History</Title>
            {!rows.length ? <Empty description="No attendance records yet" /> : (
              <Space direction="vertical" style={{ width: '100%' }} size={8}>
                {rows.map((r) => (
                  <Card key={r._id} size="small">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text strong style={{ fontSize: 13 }}>{dayjs(r.attendanceDate).format('DD MMM YYYY')}</Text>
                      <Tag color={STATUS_COLOR[r.status] || 'default'}>{r.status || 'NO RECORD'}</Tag>
                    </div>
                    {r.sessions?.length > 1 ? (
                      <Space direction="vertical" size={2}>
                        {r.sessions.map((s, i) => (
                          <Text key={i} type="secondary" style={{ fontSize: 12 }}>{fmtTime(s.checkIn)} → {fmtTime(s.checkOut)}</Text>
                        ))}
                        <Text type="secondary" style={{ fontSize: 11 }}>{r.workedHours?.toFixed(2)}h worked across {r.sessions.length} sessions</Text>
                      </Space>
                    ) : (
                      <Text type="secondary" style={{ fontSize: 12 }}>{fmtTime(r.checkIn)} → {fmtTime(r.checkOut)}</Text>
                    )}
                    {r.isCorrected && <Tag color="blue" style={{ marginLeft: 8, fontSize: 10 }}>Corrected</Tag>}
                  </Card>
                ))}
              </Space>
            )}
          </div>
        </Space>
      )}
    </Drawer>
  );
}

// ── Manage Periods drawer ────────────────────────────────────────────────────
function ManagePeriodsDrawer({ open, onClose, hasPermission }) {
  const qc = useQueryClient();
  const [configForm, setConfigForm] = useState({ period_start_day: 21, period_end_day: 20, effective_from: '' });
  const [reprocessForm, setReprocessForm] = useState({ employee_id: '', date_from: '', date_to: '' });

  const { data: currentData } = useQuery({
    queryKey: ['period-current'],
    queryFn: () => api.get('/attendance/periods/current').then((r) => r.data),
    enabled: open,
  });
  const { data: configsData } = useQuery({
    queryKey: ['period-configs'],
    queryFn: () => api.get('/attendance/periods/config').then((r) => r.data),
    enabled: open,
  });
  const period = currentData?.period;
  const configs = configsData?.configs || [];

  const addConfig = useMutation({
    mutationFn: (body) => api.post('/attendance/periods/config', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['period-configs'] }); toast.success('Period config added'); },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to add config'),
  });

  const finalize = useMutation({
    mutationFn: (periodId) => api.post(`/attendance/periods/${periodId}/finalize`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['period-current'] }); toast.success('Period finalized'); },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to finalize'),
  });

  const reprocess = useMutation({
    mutationFn: (body) => api.post('/attendance/admin/reprocess', body),
    onSuccess: (res) => {
      const { processedCount, flaggedForReviewCount } = res.data;
      toast.success(`Reprocessed ${processedCount}, flagged ${flaggedForReviewCount} for review`);
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Reprocess failed'),
  });

  return (
    <Drawer open={open} onClose={onClose} width={440} closeIcon={<X size={18} />} title="Manage Attendance Periods">
      <Space direction="vertical" style={{ width: '100%' }} size={20}>
        <Card size="small" title="Current Period">
          {period ? (
            <Space direction="vertical" size={4}>
              <Text style={{ fontSize: 13 }}>{dayjs(period.periodStart).format('DD MMM')} — {dayjs(period.periodEnd).format('DD MMM YYYY')}</Text>
              <Tag color={period.status === 'FINALIZED' ? 'green' : 'blue'}>{period.status}</Tag>
              {hasPermission('period:finalize') && period.status !== 'FINALIZED' && (
                <Button size="small" danger onClick={() => finalize.mutate(period._id)} loading={finalize.isPending} style={{ marginTop: 8 }}>
                  Finalize Period
                </Button>
              )}
            </Space>
          ) : <Text type="secondary">No current period.</Text>}
        </Card>

        {hasPermission('period:configure') && (
          <Card size="small" title="Period Configs">
            <Space direction="vertical" style={{ width: '100%' }} size={8}>
              {configs.map((c) => (
                <Text key={c._id} style={{ fontSize: 12, display: 'block' }}>
                  Day {c.periodStartDay} → Day {c.periodEndDay}, effective {dayjs(c.effectiveFrom).format('DD MMM YYYY')}
                </Text>
              ))}
              <Row gutter={8}>
                <Col span={8}><Input type="number" size="small" placeholder="Start day" value={configForm.period_start_day} onChange={(e) => setConfigForm((f) => ({ ...f, period_start_day: Number(e.target.value) }))} /></Col>
                <Col span={8}><Input type="number" size="small" placeholder="End day" value={configForm.period_end_day} onChange={(e) => setConfigForm((f) => ({ ...f, period_end_day: Number(e.target.value) }))} /></Col>
                <Col span={8}><Input type="date" size="small" value={configForm.effective_from} onChange={(e) => setConfigForm((f) => ({ ...f, effective_from: e.target.value }))} /></Col>
              </Row>
              <Button size="small" type="primary" loading={addConfig.isPending} onClick={() => addConfig.mutate(configForm)}>Add Config</Button>
            </Space>
          </Card>
        )}

        {hasPermission('attendance:reprocess') && (
          <Card size="small" title="Advanced: Reprocess">
            <Paragraph type="secondary" style={{ fontSize: 11 }}>Re-derive attendance from raw device events for one employee. Open-period dates recompute directly; finalized dates only get flagged for review.</Paragraph>
            <Space direction="vertical" style={{ width: '100%' }} size={8}>
              <Input size="small" placeholder="Employee ID" value={reprocessForm.employee_id} onChange={(e) => setReprocessForm((f) => ({ ...f, employee_id: e.target.value }))} />
              <Row gutter={8}>
                <Col span={12}><Input type="date" size="small" value={reprocessForm.date_from} onChange={(e) => setReprocessForm((f) => ({ ...f, date_from: e.target.value }))} /></Col>
                <Col span={12}><Input type="date" size="small" value={reprocessForm.date_to} onChange={(e) => setReprocessForm((f) => ({ ...f, date_to: e.target.value }))} /></Col>
              </Row>
              <Button size="small" loading={reprocess.isPending} disabled={!reprocessForm.employee_id} onClick={() => reprocess.mutate(reprocessForm)}>Reprocess</Button>
            </Space>
          </Card>
        )}
      </Space>
    </Drawer>
  );
}

// ── Work Hours / Holidays / Week-off drawer ──────────────────────────────────
const WEEKDAY_OPTIONS = [
  { label: 'Sunday', value: 0 }, { label: 'Monday', value: 1 }, { label: 'Tuesday', value: 2 },
  { label: 'Wednesday', value: 3 }, { label: 'Thursday', value: 4 }, { label: 'Friday', value: 5 }, { label: 'Saturday', value: 6 },
];

function WorkHoursDrawer({ open, onClose }) {
  const qc = useQueryClient();
  const [ruleForm, setRuleForm] = useState({ rule_key: 'SHIFT_START_TIME', value: '', effective_from: '' });
  const [holidayForm, setHolidayForm] = useState({ name: '', date: '', is_recurring_annually: false });
  const [scheduleForm, setScheduleForm] = useState({ week_off_days: [0], effective_from: '' });

  const { data: rulesData } = useQuery({ queryKey: ['attendance-rules'], queryFn: () => api.get('/attendance/rules').then((r) => r.data), enabled: open });
  const { data: holidaysData } = useQuery({ queryKey: ['attendance-holidays'], queryFn: () => api.get('/attendance/holidays').then((r) => r.data), enabled: open });
  const { data: schedulesData } = useQuery({ queryKey: ['work-schedules'], queryFn: () => api.get('/attendance/work-schedule').then((r) => r.data), enabled: open });
  const rules = rulesData?.rules || [];
  const holidays = holidaysData?.holidays || [];
  const schedules = schedulesData?.schedules || [];

  const addRule = useMutation({
    mutationFn: (body) => api.post('/attendance/rules', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['attendance-rules'] }); toast.success('Rule added'); setRuleForm((f) => ({ ...f, value: '', effective_from: '' })); },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to add rule'),
  });
  const addHoliday = useMutation({
    mutationFn: (body) => api.post('/attendance/holidays', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['attendance-holidays'] }); toast.success('Holiday added'); setHolidayForm({ name: '', date: '', is_recurring_annually: false }); },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to add holiday'),
  });
  const deleteHoliday = useMutation({
    mutationFn: (id) => api.delete(`/attendance/holidays/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['attendance-holidays'] }); toast.success('Holiday removed'); },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to remove holiday'),
  });
  const addSchedule = useMutation({
    mutationFn: (body) => api.post('/attendance/work-schedule', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['work-schedules'] }); toast.success('Week-off schedule saved'); setScheduleForm((f) => ({ ...f, effective_from: '' })); },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to save schedule'),
  });

  return (
    <Drawer open={open} onClose={onClose} width={460} closeIcon={<X size={18} />} title="Work Hours & Holidays">
      <Space direction="vertical" style={{ width: '100%' }} size={20}>
        <Card size="small" title="Work Hours">
          <Space direction="vertical" style={{ width: '100%' }} size={8}>
            {rules.map((r) => (
              <Text key={r._id} style={{ fontSize: 12, display: 'block' }}>
                {r.ruleKey} = {String(r.value)}, effective {dayjs(r.effectiveFrom).format('DD MMM YYYY')}
              </Text>
            ))}
            <Row gutter={8}>
              <Col span={10}>
                <Select
                  size="small" style={{ width: '100%' }} value={ruleForm.rule_key}
                  onChange={(v) => setRuleForm((f) => ({ ...f, rule_key: v }))}
                  options={['SHIFT_START_TIME', 'SHIFT_END_TIME', 'LATE_THRESHOLD_MINUTES', 'HALF_DAY_MIN_HOURS'].map((k) => ({ label: k, value: k }))}
                />
              </Col>
              <Col span={7}><Input size="small" placeholder="Value" value={ruleForm.value} onChange={(e) => setRuleForm((f) => ({ ...f, value: e.target.value }))} /></Col>
              <Col span={7}><Input type="date" size="small" value={ruleForm.effective_from} onChange={(e) => setRuleForm((f) => ({ ...f, effective_from: e.target.value }))} /></Col>
            </Row>
            <Text type="secondary" style={{ fontSize: 11 }}>Times as HH:MM (24h). Minutes/hours as plain numbers.</Text>
            <Button
              size="small" type="primary" loading={addRule.isPending}
              disabled={!ruleForm.value || !ruleForm.effective_from}
              onClick={() => addRule.mutate(ruleForm)}
            >
              Add Rule
            </Button>
          </Space>
        </Card>

        <Card size="small" title="Weekly Off">
          <Space direction="vertical" style={{ width: '100%' }} size={8}>
            {schedules.map((s) => (
              <Text key={s._id} style={{ fontSize: 12, display: 'block' }}>
                {s.weekOffDays.map((d) => WEEKDAY_OPTIONS[d].label).join(', ')} — effective {dayjs(s.effectiveFrom).format('DD MMM YYYY')}
              </Text>
            ))}
            <Select
              mode="multiple" size="small" style={{ width: '100%' }} value={scheduleForm.week_off_days} options={WEEKDAY_OPTIONS}
              onChange={(v) => setScheduleForm((f) => ({ ...f, week_off_days: v }))}
            />
            <Input type="date" size="small" value={scheduleForm.effective_from} onChange={(e) => setScheduleForm((f) => ({ ...f, effective_from: e.target.value }))} />
            <Button
              size="small" type="primary" loading={addSchedule.isPending}
              disabled={!scheduleForm.week_off_days.length || !scheduleForm.effective_from}
              onClick={() => addSchedule.mutate(scheduleForm)}
            >
              Save Week-off Schedule
            </Button>
          </Space>
        </Card>

        <Card size="small" title="Holiday Calendar">
          <Space direction="vertical" style={{ width: '100%' }} size={8}>
            {holidays.map((h) => (
              <div key={h._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 12 }}>
                  {h.name} — {dayjs(h.date).format('DD MMM YYYY')}{h.isRecurringAnnually ? ' (yearly)' : ''}
                </Text>
                <Button size="small" type="text" danger onClick={() => deleteHoliday.mutate(h._id)}>Remove</Button>
              </div>
            ))}
            <Input size="small" placeholder="Holiday name" value={holidayForm.name} onChange={(e) => setHolidayForm((f) => ({ ...f, name: e.target.value }))} />
            <Row gutter={8}>
              <Col span={14}><Input type="date" size="small" value={holidayForm.date} onChange={(e) => setHolidayForm((f) => ({ ...f, date: e.target.value }))} /></Col>
              <Col span={10}>
                <Select
                  size="small" style={{ width: '100%' }} value={holidayForm.is_recurring_annually}
                  onChange={(v) => setHolidayForm((f) => ({ ...f, is_recurring_annually: v }))}
                  options={[{ label: 'One-off', value: false }, { label: 'Repeats yearly', value: true }]}
                />
              </Col>
            </Row>
            <Button
              size="small" type="primary" loading={addHoliday.isPending}
              disabled={!holidayForm.name || !holidayForm.date}
              onClick={() => addHoliday.mutate(holidayForm)}
            >
              Add Holiday
            </Button>
          </Space>
        </Card>
      </Space>
    </Drawer>
  );
}

// ── Today's Board ─────────────────────────────────────────────────────────────
function TodayBoard({ hasPermission }) {
  const [date, setDate] = useState(dayjs());
  const [search, setSearch] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [selected, setSelected] = useState(null);

  const { data: deptsData } = useQuery({ queryKey: ['departments'], queryFn: () => api.get('/departments').then((r) => r.data) });
  const departments = deptsData?.departments || [];

  const { data, isLoading } = useQuery({
    queryKey: ['attendance-today', date.format('YYYY-MM-DD'), search, filterDept, filterStatus],
    queryFn: () => api.get('/attendance/today', {
      params: { attendance_date: date.format('YYYY-MM-DD'), limit: 200, search: search || undefined, department_id: filterDept || undefined, status: filterStatus || undefined },
    }).then((r) => r.data),
  });
  const rows = data?.data || [];

  const columns = [
    { title: 'Code', dataIndex: 'employeeCode', key: 'employeeCode', render: (v) => <Text style={{ fontFamily: 'monospace', fontSize: 12 }}>{v}</Text> },
    { title: 'Name', dataIndex: 'fullName', key: 'fullName' },
    { title: 'Department', dataIndex: 'departmentName', key: 'departmentName', render: (v) => v || '—' },
    { title: 'Status', dataIndex: 'status', key: 'status', align: 'center', render: (v) => v ? <Tag color={STATUS_COLOR[v] || 'default'}>{v}</Tag> : <Tag>NO RECORD</Tag> },
    { title: 'Check-in', dataIndex: 'checkIn', key: 'checkIn', render: fmtTime },
    { title: 'Check-out', dataIndex: 'checkOut', key: 'checkOut', render: fmtTime },
    { title: '', dataIndex: 'isCorrected', key: 'isCorrected', width: 40, render: (v) => v ? <Tag color="blue" style={{ fontSize: 10 }}>Corr.</Tag> : null },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16, width: '100%' }} wrap>
        <DatePicker value={date} onChange={(d) => setDate(d || dayjs())} allowClear={false} />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or code..." prefix={<Search size={14} color="#9ca3af" />} style={{ width: 240 }} />
        <Select value={filterDept || undefined} onChange={(v) => setFilterDept(v || '')} allowClear style={{ width: 200 }} placeholder="All Departments" options={departments.map((d) => ({ label: d.name, value: d._id }))} />
        <Select value={filterStatus || undefined} onChange={(v) => setFilterStatus(v || '')} allowClear style={{ width: 160 }} placeholder="All Status" options={Object.keys(STATUS_COLOR).map((s) => ({ label: s, value: s }))} />
      </Space>

      <Card styles={{ body: { padding: 0 } }}>
        <Table
          rowKey="employeeId" columns={columns} dataSource={rows} loading={isLoading} pagination={false}
          onRow={(r) => ({ onClick: () => setSelected(r), style: { cursor: 'pointer' } })}
          locale={{ emptyText: <Empty description="No employees found" /> }}
        />
      </Card>

      {selected && (
        <EmployeeAttendanceDrawer
          employeeId={selected.employeeId} employeeLabel={`${selected.fullName} (${selected.employeeCode})`}
          open={!!selected} onClose={() => setSelected(null)} hasPermission={hasPermission}
        />
      )}
    </div>
  );
}

// ── Exceptions tab ────────────────────────────────────────────────────────────
function ExceptionsTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['attendance-exceptions'],
    queryFn: () => api.get('/attendance/exceptions', { params: { limit: 100 } }).then((r) => r.data),
  });
  const rows = data?.data || [];

  const columns = [
    { title: 'Device Ref', dataIndex: 'deviceEmployeeRef', key: 'deviceEmployeeRef', render: (v) => <Text style={{ fontFamily: 'monospace', fontSize: 12 }}>{v}</Text> },
    { title: 'Event Type', dataIndex: 'eventType', key: 'eventType', render: (v) => <Tag>{v}</Tag> },
    { title: 'Source', dataIndex: 'source', key: 'source' },
    { title: 'Timestamp', dataIndex: 'eventTimestamp', key: 'eventTimestamp', render: fmtDateTime },
  ];

  return (
    <Card styles={{ body: { padding: 0 } }}>
      <Table
        rowKey="_id" columns={columns} dataSource={rows} loading={isLoading} pagination={false}
        locale={{ emptyText: <Empty description="No unmatched punches — every device event matched a known employee" /> }}
      />
    </Card>
  );
}

// ── Audit Log tab ─────────────────────────────────────────────────────────────
function AuditLogTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['attendance-audit'],
    queryFn: () => api.get('/attendance/audit-logs', { params: { limit: 100 } }).then((r) => r.data),
  });
  const rows = data?.data || [];

  const columns = [
    { title: 'Action', dataIndex: 'action', key: 'action', render: (v) => <Tag color="geekblue">{v}</Tag> },
    { title: 'Entity', key: 'entity', render: (_, r) => r.reference ? `${r.reference.model} · ${String(r.reference.id).slice(-6)}` : '—' },
    { title: 'Reason', dataIndex: 'reason', key: 'reason', render: (v) => v || '—' },
    { title: 'When', dataIndex: 'createdAt', key: 'createdAt', render: fmtDateTime },
  ];

  return (
    <Card styles={{ body: { padding: 0 } }}>
      <Table
        rowKey="_id" columns={columns} dataSource={rows} loading={isLoading} pagination={false}
        locale={{ emptyText: <Empty description="No audit events yet" /> }}
      />
    </Card>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function AttendanceBoard() {
  const [periodsOpen, setPeriodsOpen] = useState(false);
  const [workHoursOpen, setWorkHoursOpen] = useState(false);
  const { hasPermission } = usePermissions();

  const tabItems = [
    { key: 'today', label: <Space size={6}><CalendarCheck size={14} />Today's Board</Space>, children: <TodayBoard hasPermission={hasPermission} /> },
    { key: 'holidays', label: <Space size={6}><CalendarDays size={14} />Holidays</Space>, children: <HolidaysCard full /> },
    { key: 'exceptions', label: <Space size={6}><TriangleAlert size={14} />Exceptions</Space>, children: <ExceptionsTab /> },
    ...(hasPermission('audit:read')
      ? [{ key: 'audit', label: <Space size={6}><ShieldCheck size={14} />Audit Log</Space>, children: <AuditLogTab /> }]
      : []),
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <Title level={4} style={{ marginBottom: 0 }}>Attendance Board</Title>
          <Text type="secondary">Daily attendance, exceptions, and corrections</Text>
        </div>
        <Space>
          {hasPermission('rules:configure') && (
            <Button icon={<Clock size={14} />} onClick={() => setWorkHoursOpen(true)}>Work Hours & Holidays</Button>
          )}
          {(hasPermission('period:configure') || hasPermission('period:finalize') || hasPermission('attendance:reprocess')) && (
            <Button icon={<SettingsIcon size={14} />} onClick={() => setPeriodsOpen(true)}>Manage Periods</Button>
          )}
        </Space>
      </div>

      <Tabs items={tabItems} />

      <ManagePeriodsDrawer open={periodsOpen} onClose={() => setPeriodsOpen(false)} hasPermission={hasPermission} />
      <WorkHoursDrawer open={workHoursOpen} onClose={() => setWorkHoursOpen(false)} />
    </div>
  );
}
