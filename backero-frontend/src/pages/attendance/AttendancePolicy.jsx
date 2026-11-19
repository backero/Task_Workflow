import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, Col, Empty, InputNumber, Row, Skeleton, Space, Switch, Tag, Typography } from 'antd';
import { CalendarRange, CircleAlert, HandCoins, RotateCcw, Save, ShieldCheck, TimerReset } from 'lucide-react';
import api from '../../api/axios';
import toast from 'react-hot-toast';

const { Paragraph, Text, Title } = Typography;

const POLICY_KEYS = [
  'payrollStartDay', 'payrollEndDay', 'casualLeavePerCycle', 'sickLeavePerCycle',
  'sandwichLeaveEnabled', 'correctionRequestsPerCycle', 'lateGraceMinutes',
  'halfDayAfterLateMinutes', 'defaultAdvanceInstallment',
];

function samePolicy(left, right) {
  return POLICY_KEYS.every((key) => left?.[key] === right?.[key]);
}

function NumberSetting({ label, hint, value, onChange, min = 0, max, suffix, disabled }) {
  return (
    <div style={{ minHeight: 94, padding: '12px 0', borderBottom: '1px solid #eef1eb' }}>
      <Row gutter={[16, 10]} align="middle">
        <Col xs={24} sm={15}>
          <Text strong>{label}</Text>
          <Text type="secondary" style={{ display: 'block', fontSize: 12, marginTop: 3 }}>{hint}</Text>
        </Col>
        <Col xs={24} sm={9}>
          <InputNumber
            value={value} onChange={(next) => { if (next !== null) onChange(next); }} min={min} max={max} addonAfter={suffix}
            disabled={disabled} style={{ width: '100%' }} aria-label={label}
          />
        </Col>
      </Row>
    </div>
  );
}

function SectionCard({ icon, eyebrow, title, tone = '#4b7320', children }) {
  return (
    <Card style={{ height: '100%', borderColor: '#e1e8d9', borderTop: `3px solid ${tone}` }} styles={{ body: { padding: '18px 20px' } }}>
      <Space size={10} align="start" style={{ marginBottom: 10 }}>
        <span style={{ color: '#fff', background: tone, display: 'inline-flex', padding: 7, borderRadius: 4 }}>{icon}</span>
        <div>
          <Text type="secondary" style={{ fontSize: 10, letterSpacing: 1, fontWeight: 700 }}>{eyebrow}</Text>
          <Title level={5} style={{ margin: '1px 0 0' }}>{title}</Title>
        </div>
      </Space>
      {children}
    </Card>
  );
}

export default function AttendancePolicy() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(null);

  const policyQuery = useQuery({
    queryKey: ['attendance-policy'],
    queryFn: () => api.get('/attendance/policy').then((response) => response.data.policy),
  });
  const policy = policyQuery.data;

  useEffect(() => {
    if (policy) setDraft(policy);
  }, [policy]);

  const hasChanges = useMemo(() => !!draft && !!policy && !samePolicy(draft, policy), [draft, policy]);
  const setValue = (key, value) => setDraft((current) => ({ ...current, [key]: value }));

  const saveMutation = useMutation({
    mutationFn: (body) => api.put('/attendance/policy', body),
    onSuccess: (response) => {
      const saved = response.data.policy;
      queryClient.setQueryData(['attendance-policy'], saved);
      setDraft(saved);
      toast.success('Attendance policy saved');
    },
    onError: (error) => toast.error(error.response?.data?.message || 'Could not save the attendance policy'),
  });

  if (policyQuery.isError) {
    return (
      <div className="lg:ms-[168px] lg:me-0" style={{ maxWidth: 720, marginTop: 48, marginBottom: 48 }}>
        <Empty description="Attendance policy could not be loaded">
          <Button type="primary" onClick={() => policyQuery.refetch()}>Try again</Button>
        </Empty>
      </div>
    );
  }

  if (policyQuery.isLoading || !draft) {
    return (
      <div className="lg:ms-[168px] lg:me-0" style={{ maxWidth: 1120 }}>
        <Skeleton active paragraph={{ rows: 2 }} style={{ marginBottom: 24 }} />
        <Row gutter={[16, 16]}><Col xs={24} md={12}><Card><Skeleton active /></Card></Col><Col xs={24} md={12}><Card><Skeleton active /></Card></Col></Row>
      </div>
    );
  }

  return (
    <main className="lg:ms-[168px] lg:me-0" style={{ maxWidth: 1120, paddingBottom: 28 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <Text type="secondary" style={{ fontSize: 11, letterSpacing: 1 }}>PEOPLE OPERATIONS / CONFIGURATION</Text>
          <Title level={3} style={{ margin: '3px 0 3px' }}>Attendance Policy</Title>
          <Text type="secondary">Set the recurring rules used for new leave requests, attendance exceptions, and payroll cycles.</Text>
        </div>
        <Tag color="green" icon={<ShieldCheck size={13} />} style={{ marginTop: 5, padding: '4px 9px' }}>Effective policy</Tag>
      </header>

      <Card size="small" style={{ background: '#f4f8ef', borderColor: '#cbdcc0', borderTop: '3px solid #4b7320', marginBottom: 16 }} styles={{ body: { padding: '14px 18px' } }}>
        <Row gutter={[18, 12]} align="middle">
          <Col xs={24} sm={8}><Text type="secondary" style={{ fontSize: 11 }}>PAYROLL CYCLE</Text><div><Text strong>Day {draft.payrollStartDay} to Day {draft.payrollEndDay}</Text></div></Col>
          <Col xs={12} sm={8}><Text type="secondary" style={{ fontSize: 11 }}>LEAVE ALLOWANCE</Text><div><Text strong>{draft.casualLeavePerCycle} CL · {draft.sickLeavePerCycle} SL</Text> <Text type="secondary">per cycle</Text></div></Col>
          <Col xs={12} sm={8}><Text type="secondary" style={{ fontSize: 11 }}>SANDWICH LEAVE</Text><div><Tag color={draft.sandwichLeaveEnabled ? 'green' : 'default'}>{draft.sandwichLeaveEnabled ? 'Enabled' : 'Disabled'}</Tag></div></Col>
        </Row>
      </Card>

      <Alert
        type="warning" showIcon icon={<CircleAlert size={16} />} style={{ marginBottom: 18 }}
        message="Safe effective-date handling"
        description="Changes apply to new requests and new payroll periods. Existing finalized attendance and payroll records are never silently rewritten."
      />

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={10}>
          <SectionCard eyebrow="PAYROLL" title="Payroll cycle" icon={<CalendarRange size={18} />}>
            <NumberSetting label="Cycle start day" hint="The day each monthly attendance and salary cycle opens." value={draft.payrollStartDay} onChange={(value) => setValue('payrollStartDay', value)} min={1} max={28} suffix="day" />
            <NumberSetting label="Cycle end day" hint="The day the cycle closes in the following month." value={draft.payrollEndDay} onChange={(value) => setValue('payrollEndDay', value)} min={1} max={31} suffix="day" />
          </SectionCard>
        </Col>
        <Col xs={24} lg={14}>
          <SectionCard eyebrow="LEAVE" title="Leave policy" icon={<ShieldCheck size={18} />} tone="#356b61">
            <NumberSetting label="Casual leave allowance" hint="Approved CL available to each employee in one payroll cycle." value={draft.casualLeavePerCycle} onChange={(value) => setValue('casualLeavePerCycle', value)} max={31} suffix="CL" />
            <NumberSetting label="Sick leave allowance" hint="Approved SL available to each employee in one payroll cycle." value={draft.sickLeavePerCycle} onChange={(value) => setValue('sickLeavePerCycle', value)} max={31} suffix="SL" />
            <div style={{ paddingTop: 14 }}>
              <Row gutter={[16, 8]} align="middle"><Col flex="auto"><Text strong>Sandwich leave rule</Text><Text type="secondary" style={{ display: 'block', fontSize: 12, marginTop: 3 }}>Count an intervening weekly off or holiday when leave surrounds it.</Text></Col><Col><Switch checked={draft.sandwichLeaveEnabled} onChange={(value) => setValue('sandwichLeaveEnabled', value)} checkedChildren="On" unCheckedChildren="Off" /></Col></Row>
            </div>
          </SectionCard>
        </Col>
        <Col xs={24} lg={15}>
          <SectionCard eyebrow="ATTENDANCE" title="Attendance exceptions" icon={<TimerReset size={18} />} tone="#9a6215">
            <NumberSetting label="Correction requests" hint="Maximum missed-punch requests an employee may submit each cycle." value={draft.correctionRequestsPerCycle} onChange={(value) => setValue('correctionRequestsPerCycle', value)} max={31} suffix="requests" />
            <NumberSetting label="Late arrival grace" hint="Minutes after the scheduled start before the day is marked late." value={draft.lateGraceMinutes} onChange={(value) => setValue('lateGraceMinutes', value)} max={240} suffix="min" />
            <NumberSetting label="Half-day threshold" hint="Late minutes at which the day should be treated as a half day." value={draft.halfDayAfterLateMinutes} onChange={(value) => setValue('halfDayAfterLateMinutes', value)} max={720} suffix="min" />
          </SectionCard>
        </Col>
        <Col xs={24} lg={9}>
          <SectionCard eyebrow="RECOVERY" title="Loan & advance policy" icon={<HandCoins size={18} />} tone="#56616d">
            <NumberSetting label="Default monthly recovery" hint="Suggested monthly deduction when an approved employee advance is scheduled." value={draft.defaultAdvanceInstallment} onChange={(value) => setValue('defaultAdvanceInstallment', value)} max={10000000} suffix="₹" />
            <Paragraph type="secondary" style={{ fontSize: 12, margin: '14px 0 0', lineHeight: 1.6 }}>A manager can still set a different instalment for a specific approved advance. This is the organisation default, not a deduction by itself.</Paragraph>
          </SectionCard>
        </Col>
      </Row>

      <Card size="small" className="lg:sticky lg:bottom-3" style={{ marginTop: 18, borderColor: hasChanges ? '#cfe0bc' : '#e7ebe3', boxShadow: hasChanges ? '0 8px 24px rgba(52, 78, 31, .12)' : 'none' }}>
        <Row justify="space-between" align="middle" gutter={[16, 12]}>
          <Col><Space direction="vertical" size={1}><Text strong>{hasChanges ? 'Unsaved policy changes' : 'All policy settings are saved'}</Text><Text type="secondary" style={{ fontSize: 12 }}>{hasChanges ? 'Review the operational impact, then save when ready.' : 'You can update these controls whenever the organisation policy changes.'}</Text></Space></Col>
          <Col><Space wrap><Button icon={<RotateCcw size={14} />} disabled={!hasChanges || saveMutation.isPending} onClick={() => setDraft(policy)}>Reset</Button><Button type="primary" icon={<Save size={14} />} loading={saveMutation.isPending} disabled={!hasChanges} onClick={() => saveMutation.mutate(Object.fromEntries(POLICY_KEYS.map((key) => [key, draft[key]])))}>Save policy</Button></Space></Col>
        </Row>
      </Card>
    </main>
  );
}
