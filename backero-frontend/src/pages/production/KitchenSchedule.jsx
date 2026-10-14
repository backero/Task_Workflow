import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import { usePermissions } from '../../store/usePermissions';
import { STAGE_NAMES } from '../crm/production/StageSteps';
import {
  ChevronLeft, ChevronRight, Lock, LockOpen, TriangleAlert, Truck, Users, LayoutGrid, Factory, CheckCircle2, XCircle,
} from 'lucide-react';
import { Button, Card, Col, Drawer, Row, Select, Spin, Tag, Typography } from 'antd';

const { Title, Text } = Typography;

// ── Week helpers ──────────────────────────────────────────────────────────
// weekKey format: 'YYYY-Www' (ISO 8601 week, Monday-start), computed with the
// classic "Thursday of this week" trick so it matches what the backend expects.

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SLOTS = ['AM', 'PM'];
const BLOCK_TYPES = ['RD', 'Client', 'Docs', 'Leave'];
const BLOCK_COLOR = { RD: '#f5f0ff', Client: '#eff6ff', Docs: '#f5f5f5', Leave: '#fff1f0' };
const BLOCK_TEXT = { RD: '#7c3aed', Client: '#2563eb', Docs: '#6b7280', Leave: '#ef4444' };
const STATUS_COLOR = { Planned: 'default', Confirmed: 'blue', 'In Progress': 'gold', Done: 'green', Removed: 'red' };

function pad2(n) { return String(n).padStart(2, '0'); }
function toDateStr(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }

function mondayOf(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return d;
}

function weekKeyOf(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const weekNo = 1 + Math.round((d - firstThursday) / (7 * 24 * 3600 * 1000));
  return `${d.getUTCFullYear()}-W${pad2(weekNo)}`;
}

function fmtShort(d) { return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }); }
function fmtDateStr(s) { return s ? new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'; }
function personName(p) { return p ? (p.firstName ? `${p.firstName} ${p.lastName || ''}`.trim() : String(p)) : null; }
function personId(p) { return p?._id || p || null; }

// ── Client-side derivations (readiness comes from the server; these don't) ──

function readinessEntries(readiness) {
  if (!readiness) return [];
  return Object.entries(readiness)
    .filter(([k]) => k !== 'ready')
    .map(([key, val]) => {
      const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()).trim();
      if (val && typeof val === 'object') {
        return { key, label, ok: !!(val.ok ?? val.ready), detail: val.detail || val.reason || val.message || '' };
      }
      return { key, label, ok: !!val, detail: '' };
    });
}

function computeCredits(slots) {
  const counts = {};
  slots.filter((s) => s.status !== 'Removed').forEach((s) => {
    (s.support || []).forEach((u) => {
      const id = personId(u);
      if (!id) return;
      if (!counts[id]) counts[id] = { id, name: personName(u) || 'Unknown', count: 0 };
      counts[id].count += 1;
    });
  });
  return Object.values(counts).sort((a, b) => b.count - a.count);
}

// Ids already leader/support on some OTHER non-Removed slot that day (AM or PM — only one
// order can occupy a given date+slot at all, so "double-booked" means "already got a batch
// that day"). Mirrors the backend's double-booking guard; used to hide dropdown options.
function busyUserIdsAt(slots, date, excludeSlotId) {
  const busy = new Set();
  slots.forEach((s) => {
    if (s.status === 'Removed') return;
    if (excludeSlotId && s._id === excludeSlotId) return;
    if (s.date !== date) return;
    const leaderId = personId(s.leader);
    if (leaderId) busy.add(leaderId);
    (s.support || []).forEach((u) => { const id = personId(u); if (id) busy.add(id); });
  });
  return busy;
}

// A person is genuinely "Busy" on a date if they're leader/support on a real (non-Removed)
// batch slot that day — this is the actual Kitchen Schedule assignment, separate from the
// manually-cycled RD/Client/Docs/Leave blocks below, and takes priority for display since it's
// real work rather than a manager's plan.
function assignedSlotFor(slots, userId, dateStr) {
  return slots.find((s) => {
    if (s.status === 'Removed' || s.date !== dateStr) return false;
    if (personId(s.leader) === userId) return true;
    return (s.support || []).some((u) => personId(u) === userId);
  }) || null;
}

function computeConflicts(slots, blocks) {
  const conflicts = [];
  const deliveryRisks = [];
  slots.filter((s) => s.status !== 'Removed').forEach((s) => {
    const people = [s.leader, ...(s.support || [])].filter(Boolean);
    people.forEach((p) => {
      const id = personId(p);
      const blocked = blocks.find((b) => personId(b.userId) === id && b.date === s.date);
      if (blocked) {
        conflicts.push({ slotId: s._id, date: s.date, slot: s.slot, message: `${personName(p)} is blocked (${blocked.type}) on ${s.date} but assigned to this slot` });
      }
    });
    const delivery = s.productionOrderId?.deliveryDate;
    if (delivery && s.productionOrderId) {
      const days = Math.round((new Date(delivery) - new Date(s.date)) / 86400000);
      if (days < 2) {
        deliveryRisks.push({ slotId: s._id, date: s.date, slot: s.slot, message: `${s.productionOrderId?.orderNumber || 'Order'} delivers ${fmtDateStr(delivery)} — only ${days}d after this slot` });
      }
    }
  });
  return { conflicts, deliveryRisks };
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function KitchenSchedule() {
  const navigate = useNavigate();
  const { isManager } = usePermissions();
  const queryClient = useQueryClient();
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedTray, setSelectedTray] = useState(null);
  const [activeSlot, setActiveSlot] = useState(null);

  const weekDates = useMemo(() => {
    const anchor = new Date();
    anchor.setDate(anchor.getDate() + weekOffset * 7);
    const monday = mondayOf(anchor);
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [weekOffset]);

  const weekKey = useMemo(() => weekKeyOf(weekDates[0]), [weekDates]);

  const scheduleQuery = useQuery({
    queryKey: ['production-schedule', weekKey],
    queryFn: () => api.get(`/production-schedule/${weekKey}`).then((r) => r.data),
  });
  const trayQuery = useQuery({
    queryKey: ['production-schedule', weekKey, 'tray'],
    queryFn: () => api.get(`/production-schedule/${weekKey}/tray`).then((r) => r.data),
  });
  const usersQuery = useQuery({
    queryKey: ['users', 'production-dept'],
    queryFn: () => api.get('/users', { params: { department: 'Production', isActive: true, limit: 200 } }).then((r) => r.data),
  });

  const weekDoc = scheduleQuery.data?.week || scheduleQuery.data || {};
  const slots = weekDoc.slots || [];
  const blocks = weekDoc.blocks || [];
  const tray = trayQuery.data?.tray || trayQuery.data?.orders || trayQuery.data?.data
    || (Array.isArray(trayQuery.data) ? trayQuery.data : []) || [];
  const prodUsers = usersQuery.data?.data || usersQuery.data?.users
    || (Array.isArray(usersQuery.data) ? usersQuery.data : []) || [];

  const invalidateWeek = () => queryClient.invalidateQueries({ queryKey: ['production-schedule', weekKey] });

  const placeMutation = useMutation({
    mutationFn: (payload) => api.post(`/production-schedule/${weekKey}/slots`, payload).then((r) => r.data),
    onSuccess: () => { invalidateWeek(); setSelectedTray(null); toast.success('Batch placed on schedule'); },
  });
  const patchSlotMutation = useMutation({
    mutationFn: ({ slotId, ...body }) => api.patch(`/production-schedule/${weekKey}/slots/${slotId}`, body).then((r) => r.data),
    onSuccess: () => invalidateWeek(),
  });
  const removeSlotMutation = useMutation({
    mutationFn: ({ slotId, ...body }) => api.delete(`/production-schedule/${weekKey}/slots/${slotId}`, { data: body }).then((r) => r.data),
    onSuccess: () => { invalidateWeek(); setActiveSlot(null); toast.success('Slot removed'); },
  });
  const blockMutation = useMutation({
    mutationFn: (payload) => api.post(`/production-schedule/${weekKey}/blocks`, payload).then((r) => r.data),
    onSuccess: () => invalidateWeek(),
  });
  const unblockMutation = useMutation({
    mutationFn: (payload) => api.delete(`/production-schedule/${weekKey}/blocks`, { data: payload }).then((r) => r.data),
    onSuccess: () => invalidateWeek(),
  });
  const freezeMutation = useMutation({
    mutationFn: (body) => api.post(`/production-schedule/${weekKey}/freeze`, body || {}).then((r) => r.data),
    onSuccess: () => { invalidateWeek(); toast.success('Week frozen'); },
  });
  const unfreezeMutation = useMutation({
    mutationFn: (body) => api.post(`/production-schedule/${weekKey}/unfreeze`, body || {}).then((r) => r.data),
    onSuccess: () => { invalidateWeek(); toast.success('Week unfrozen'); },
  });

  const runWithReason = async (mutation, payload) => {
    try {
      await mutation.mutateAsync(payload);
    } catch (err) {
      const status = err?.response?.status;
      const message = err?.response?.data?.message || 'Action failed';
      if (status === 400 && weekDoc?.frozen && !payload?.reason) {
        const reason = window.prompt(`${message}\n\nThis week is frozen. Enter a reason to proceed:`);
        if (reason && reason.trim()) {
          try { await mutation.mutateAsync({ ...payload, reason: reason.trim() }); }
          catch (err2) { toast.error(err2?.response?.data?.message || 'Action failed'); }
        }
        return;
      }
      toast.error(message);
    }
  };

  const { conflicts, deliveryRisks } = useMemo(() => computeConflicts(slots, blocks), [slots, blocks]);
  const credits = useMemo(() => computeCredits(slots), [slots]);
  const filledCount = slots.filter((s) => s.status !== 'Removed' && s.productionOrderId).length;
  const totalCells = weekDates.length * SLOTS.length;
  const creditSpread = credits.length ? Math.max(...credits.map((c) => c.count)) - Math.min(...credits.map((c) => c.count)) : 0;

  const slotAt = (dateStr, slotName) => slots.find((s) => s.date === dateStr && s.slot === slotName && s.status !== 'Removed');

  const placeOnCell = (dateStr, slotName) => {
    if (!isManager || !selectedTray) return;
    runWithReason(placeMutation, { productionOrderId: selectedTray._id, date: dateStr, slot: slotName });
  };

  const nextBlockType = (current) => {
    if (!current) return BLOCK_TYPES[0];
    const idx = BLOCK_TYPES.indexOf(current);
    return idx === -1 || idx === BLOCK_TYPES.length - 1 ? null : BLOCK_TYPES[idx + 1];
  };

  const cycleBlock = (dateStr, userId) => {
    if (!isManager) return;
    const existing = blocks.find((b) => personId(b.userId) === userId && b.date === dateStr);
    const next = nextBlockType(existing?.type);
    if (next === null) runWithReason(unblockMutation, { date: dateStr, userId });
    else runWithReason(blockMutation, { date: dateStr, userId, type: next });
  };

  const loading = scheduleQuery.isLoading || trayQuery.isLoading;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 4 }}>
        <div>
          <Title level={4} style={{ marginBottom: 0 }}><LayoutGrid size={18} color="#3b82f6" style={{ marginRight: 8, verticalAlign: -3 }} />Kitchen Schedule</Title>
          <Text type="secondary">Weekly production timetable — place batches, assign teams, track readiness</Text>
        </div>
        <Space_>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 8, padding: 4 }}>
            <Button type="text" size="small" icon={<ChevronLeft size={14} />} onClick={() => setWeekOffset((o) => o - 1)} />
            <Button type={weekOffset === 0 ? 'primary' : 'text'} size="small" onClick={() => setWeekOffset(0)}>This Week</Button>
            <Button type="text" size="small" icon={<ChevronRight size={14} />} onClick={() => setWeekOffset((o) => o + 1)} />
          </div>
          {isManager ? (
            weekDoc.frozen ? (
              <Button icon={<LockOpen size={14} />} loading={unfreezeMutation.isPending} onClick={() => unfreezeMutation.mutate()}>Unfreeze Week</Button>
            ) : (
              <Button
                type="primary" icon={<Lock size={14} />} loading={freezeMutation.isPending}
                onClick={() => {
                  if (!window.confirm('Freeze this week? Editing after freezing will require a reason.')) return;
                  freezeMutation.mutate(undefined, { onError: (err) => toast.error(err?.response?.data?.message || 'Cannot freeze — some slots are not ready') });
                }}
              >
                Freeze Week
              </Button>
            )
          ) : null}
        </Space_>
      </div>

      <Text style={{ fontSize: 13, display: 'block', marginBottom: 16 }}>
        Week of <Text strong>{fmtShort(weekDates[0])} – {fmtShort(weekDates[5])}, {weekDates[0].getFullYear()}</Text>
        <Text type="secondary" style={{ marginLeft: 8, fontFamily: 'monospace', fontSize: 11 }}>{weekKey}</Text>
        {weekDoc.frozen && <Tag color="blue" icon={<Lock size={10} style={{ marginRight: 2 }} />} style={{ marginLeft: 8 }}>Frozen</Tag>}
      </Text>

      {!isManager && (
        <Card size="small" style={{ background: '#eff6ff', borderColor: '#bfdbfe', marginBottom: 16 }}>
          <Text style={{ fontSize: 13, color: '#1d4ed8' }}>View-only — placing batches, assigning teams, and freezing the week require a manager.</Text>
        </Card>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
      ) : (
        <>
          <Row gutter={12} style={{ marginBottom: 16 }}>
            {[
              { label: 'Slots Filled', value: `${filledCount}/${totalCells}` },
              { label: 'Tray (Unscheduled)', value: tray.length },
              { label: 'Conflicts', value: conflicts.length, danger: conflicts.length > 0 },
              { label: 'Credit Spread', value: creditSpread },
              { label: 'Delivery Risks', value: deliveryRisks.length, danger: deliveryRisks.length > 0 },
            ].map((kpi) => (
              <Col span={24 / 5} key={kpi.label}>
                <Card size="small">
                  <Text type="secondary" style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>{kpi.label}</Text>
                  <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, color: kpi.danger ? '#ef4444' : undefined }}>{kpi.value}</div>
                </Card>
              </Col>
            ))}
          </Row>

          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={17}>
              <Card
                styles={{ body: { padding: 0 } }}
                title="Timetable"
                extra={selectedTray && isManager && <Text style={{ fontSize: 12, color: '#2563eb' }}>Selected: {selectedTray.catalogProduct?.name || selectedTray.orderNumber} — click an empty cell to place</Text>}
              >
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                        <th style={{ textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', padding: '10px 16px', width: 56 }}></th>
                        {weekDates.map((d, i) => (
                          <th key={i} style={{ textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', padding: '10px 12px', whiteSpace: 'nowrap' }}>
                            {DAY_LABELS[i]} <span style={{ color: '#6b7280', textTransform: 'none', fontWeight: 500 }}>{fmtShort(d)}</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {SLOTS.map((slotName) => (
                        <tr key={slotName} style={{ borderBottom: '1px solid #fafafa' }}>
                          <td style={{ padding: '8px 16px', fontSize: 12, fontWeight: 700, color: '#9ca3af', verticalAlign: 'top' }}>{slotName}</td>
                          {weekDates.map((d) => {
                            const dateStr = toDateStr(d);
                            const slot = slotAt(dateStr, slotName);
                            return (
                              <td key={dateStr + slotName} style={{ padding: '6px', verticalAlign: 'top' }}>
                                {slot ? (
                                  <button
                                    onClick={() => setActiveSlot(slot)}
                                    style={{ width: '100%', textAlign: 'left', padding: 8, borderRadius: 8, border: '1px solid #e5e7eb', background: '#fafafa', minHeight: 76, cursor: 'pointer' }}
                                  >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                      <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: slot.readiness?.ready ? '#10b981' : '#ef4444' }} title={slot.readiness?.ready ? 'Ready' : 'Not ready'} />
                                      <Text strong style={{ fontSize: 12 }} ellipsis>{slot.productionOrderId?.catalogProduct?.name || slot.productionOrderId?.orderNumber || 'Batch'}</Text>
                                    </div>
                                    <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }} ellipsis>{personName(slot.leader) || 'No leader'}{slot.support?.length ? ` +${slot.support.length}` : ''}</Text>
                                    <Tag color={STATUS_COLOR[slot.status] || 'default'} style={{ marginTop: 6, fontSize: 10 }}>{slot.status}</Tag>
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => placeOnCell(dateStr, slotName)}
                                    disabled={!isManager || !selectedTray}
                                    style={{
                                      width: '100%', minHeight: 76, borderRadius: 8, border: '1px dashed', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12,
                                      borderColor: isManager && selectedTray ? '#93c5fd' : '#e5e7eb', color: isManager && selectedTray ? '#3b82f6' : '#d1d5db',
                                      cursor: isManager && selectedTray ? 'pointer' : 'default', background: 'transparent',
                                    }}
                                  >
                                    {isManager ? '+ Place' : '—'}
                                  </button>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </Col>

            <Col span={7}>
              <Card styles={{ body: { padding: 8 } }} title="Tray — Unscheduled Batches" extra={<Text type="secondary" style={{ fontSize: 12 }}>{tray.length} waiting</Text>}>
                <div style={{ maxHeight: 480, overflowY: 'auto' }}>
                  {tray.length === 0 ? (
                    <Text type="secondary" style={{ fontSize: 12, textAlign: 'center', display: 'block', padding: '32px 0' }}>Tray is empty</Text>
                  ) : tray.map((order) => (
                    <button
                      key={order._id}
                      onClick={() => isManager && setSelectedTray((cur) => (cur?._id === order._id ? null : order))}
                      disabled={!isManager}
                      style={{
                        width: '100%', textAlign: 'left', padding: 10, borderRadius: 8, border: '1px solid', marginBottom: 6, cursor: isManager ? 'pointer' : 'default',
                        borderColor: selectedTray?._id === order._id ? '#60a5fa' : '#e5e7eb',
                        background: selectedTray?._id === order._id ? '#eff6ff' : '#fff',
                      }}
                    >
                      <Text strong style={{ fontSize: 12 }} ellipsis>{order.catalogProduct?.name || order.orderNumber}</Text>
                      <div><Text type="secondary" style={{ fontSize: 11 }} ellipsis>{order.customer || '—'} · {order.batchSizeKg ? `${order.batchSizeKg}kg` : ''}</Text></div>
                      <Text type="secondary" style={{ fontSize: 11 }}>Delivery: {fmtDateStr(order.deliveryDate)}</Text>
                    </button>
                  ))}
                </div>
              </Card>
            </Col>
          </Row>

          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={8}>
              <Card size="small" title={<Space_><TriangleAlert size={14} color="#f59e0b" />Conflicts ({conflicts.length})</Space_>}>
                {conflicts.length === 0 ? <Text type="secondary" style={{ fontSize: 12 }}>None</Text> : (
                  <ul style={{ margin: 0, paddingLeft: 16 }}>
                    {conflicts.map((c, i) => <li key={i}><Text style={{ fontSize: 12 }}>{c.date} {c.slot} — {c.message}</Text></li>)}
                  </ul>
                )}
              </Card>
            </Col>
            <Col span={8}>
              <Card size="small" title={<Space_><Truck size={14} color="#ef4444" />Delivery Risks ({deliveryRisks.length})</Space_>}>
                {deliveryRisks.length === 0 ? <Text type="secondary" style={{ fontSize: 12 }}>None</Text> : (
                  <ul style={{ margin: 0, paddingLeft: 16 }}>
                    {deliveryRisks.map((c, i) => <li key={i}><Text style={{ fontSize: 12 }}>{c.date} {c.slot} — {c.message}</Text></li>)}
                  </ul>
                )}
              </Card>
            </Col>
            <Col span={8}>
              <Card size="small" title={<Space_><Users size={14} color="#3b82f6" />Support Credits (this week)</Space_>}>
                {credits.length === 0 ? <Text type="secondary" style={{ fontSize: 12 }}>None yet</Text> : (
                  <div>
                    {credits.map((c) => (
                      <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '2px 0' }}>
                        <Text style={{ fontSize: 12 }}>{c.name}</Text><Text strong style={{ fontSize: 12 }}>{c.count}</Text>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </Col>
          </Row>

          <Card
            styles={{ body: { padding: 0 } }}
            title="Availability — Production Team"
          >
            <div style={{ padding: '0 16px 12px' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Blue "Busy" cells are real batch assignments from this schedule — click to open that order. {isManager ? 'Other cells cycle: RD → Client → Docs → Leave → clear' : 'Read-only'}
              </Text>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <th style={{ textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', padding: '10px 16px', whiteSpace: 'nowrap' }}>Person</th>
                    {weekDates.map((d, i) => (
                      <th key={i} style={{ textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', padding: '10px 12px', whiteSpace: 'nowrap' }}>{DAY_LABELS[i]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {prodUsers.length === 0 ? (
                    <tr><td colSpan={7} style={{ textAlign: 'center', padding: '32px 0' }}><Text type="secondary">No active Production-dept users found</Text></td></tr>
                  ) : prodUsers.map((u) => (
                    <tr key={u._id} style={{ borderBottom: '1px solid #fafafa' }}>
                      <td style={{ padding: '8px 16px', fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap' }}>{u.firstName} {u.lastName}</td>
                      {weekDates.map((d) => {
                        const dateStr = toDateStr(d);
                        const assignedSlot = assignedSlotFor(slots, u._id, dateStr);
                        if (assignedSlot) {
                          const order = assignedSlot.productionOrderId || {};
                          const label = order.customer || order.orderNumber || 'Batch';
                          return (
                            <td key={dateStr} style={{ padding: 6 }}>
                              <button
                                onClick={() => {
                                  if (order.leadId) navigate(`/samples?open=${order.leadId?._id || order.leadId}&leadTab=Production`);
                                  else setActiveSlot(assignedSlot);
                                }}
                                title={`${label} — currently at ${STAGE_NAMES[order.stage] ?? 'stage ' + order.stage}`}
                                style={{ width: '100%', padding: '6px 4px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: '#dbeafe', color: '#1d4ed8', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}
                              >
                                <Factory size={11} />{label}
                              </button>
                            </td>
                          );
                        }
                        const block = blocks.find((b) => personId(b.userId) === u._id && b.date === dateStr);
                        return (
                          <td key={dateStr} style={{ padding: 6 }}>
                            <button
                              onClick={() => cycleBlock(dateStr, u._id)}
                              disabled={!isManager}
                              style={{
                                width: '100%', padding: '6px 4px', borderRadius: 6, fontSize: 11, fontWeight: 600, border: 'none',
                                background: block ? BLOCK_COLOR[block.type] : '#fafafa', color: block ? BLOCK_TEXT[block.type] : '#d1d5db',
                                cursor: isManager ? 'pointer' : 'default',
                              }}
                            >
                              {block ? block.type : '—'}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      <SlotDrawer
        slot={activeSlot}
        slots={slots}
        prodUsers={prodUsers}
        isManager={isManager}
        onClose={() => setActiveSlot(null)}
        onPatch={(body) => activeSlot && runWithReason(patchSlotMutation, { slotId: activeSlot._id, ...body })}
        onRemove={() => {
          if (!window.confirm('Remove this batch from the schedule?')) return;
          runWithReason(removeSlotMutation, { slotId: activeSlot._id });
        }}
        busy={patchSlotMutation.isPending || removeSlotMutation.isPending}
      />
    </div>
  );
}

function Space_({ children }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{children}</div>;
}

// ── Slot detail drawer ────────────────────────────────────────────────────

function SlotDrawer({ slot, slots, prodUsers, isManager, onClose, onPatch, onRemove, busy }) {
  const [leaderId, setLeaderId] = useState('');
  const [support1, setSupport1] = useState('');

  React.useEffect(() => {
    if (slot) {
      setLeaderId(personId(slot.leader) || '');
      setSupport1(personId(slot.support?.[0]) || '');
    }
  }, [slot]);

  if (!slot) {
    return <Drawer open={false} onClose={onClose} width={480} />;
  }

  const readiness = readinessEntries(slot.readiness);
  const order = slot.productionOrderId || {};

  const busyIds = busyUserIdsAt(slots, slot.date, slot._id);
  const availableUsers = (excludeId) => prodUsers.filter((u) => u._id === excludeId || !busyIds.has(u._id));

  const saveAssignment = () => onPatch({ leader: leaderId || null, support: support1 ? [support1] : [] });

  return (
    <Drawer
      open={!!slot} onClose={onClose} width={480}
      title={
        <div>
          <div>{order.catalogProduct?.name || order.orderNumber || 'Batch'}</div>
          <Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>{slot.date} · {slot.slot} · <Tag color={STATUS_COLOR[slot.status] || 'default'}>{slot.status}</Tag></Text>
        </div>
      }
      footer={
        isManager && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            {slot.status === 'Planned' && (
              <Button type="primary" disabled={busy || !slot.readiness?.ready} title={!slot.readiness?.ready ? 'Not all readiness checks pass yet' : undefined} onClick={() => onPatch({ status: 'Confirmed' })}>Confirm</Button>
            )}
            {slot.status === 'Confirmed' && <Button type="primary" disabled={busy} onClick={() => onPatch({ status: 'In Progress' })}>Start</Button>}
            {slot.status === 'In Progress' && <Button type="primary" disabled={busy} onClick={() => onPatch({ status: 'Done' })}>Done</Button>}
            <Button danger disabled={busy} style={{ marginLeft: 'auto' }} onClick={onRemove}>Remove</Button>
          </div>
        )
      }
    >
      <Row gutter={[12, 16]}>
        <Col span={12}><Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase', display: 'block' }}>Customer</Text><Text strong style={{ fontSize: 13 }}>{order.customer || '—'}</Text></Col>
        <Col span={12}><Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase', display: 'block' }}>Delivery</Text><Text strong style={{ fontSize: 13 }}>{fmtDateStr(order.deliveryDate)}</Text></Col>

        <Col span={12}>
          <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Batch Leader</Text>
          {isManager ? (
            <Select
              style={{ width: '100%' }} value={leaderId || undefined} onChange={setLeaderId} allowClear placeholder="Select leader"
              options={availableUsers(leaderId).map((u) => ({ label: `${u.firstName} ${u.lastName}`, value: u._id }))}
            />
          ) : <Text style={{ fontSize: 13 }}>{personName(slot.leader) || '—'}</Text>}
        </Col>
        <Col span={12}>
          <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Support</Text>
          {isManager ? (
            <Select
              style={{ width: '100%' }} value={support1 || undefined} onChange={setSupport1} allowClear placeholder="None"
              options={availableUsers(support1).map((u) => ({ label: `${u.firstName} ${u.lastName}`, value: u._id }))}
            />
          ) : <Text style={{ fontSize: 13 }}>{personName(slot.support?.[0]) || '—'}</Text>}
        </Col>
        {isManager && (
          <Col span={24}>
            <Button block onClick={saveAssignment} loading={busy}>Save Assignment</Button>
          </Col>
        )}
      </Row>

      {isManager && busyIds.size > 0 && (
        <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 8 }}>
          {busyIds.size} {busyIds.size === 1 ? 'person is' : 'people are'} already on another batch that day — hidden from these lists.
        </Text>
      )}

      <div style={{ marginTop: 20 }}>
        <Text strong style={{ display: 'block', marginBottom: 8, fontSize: 12 }}>Readiness</Text>
        {readiness.length === 0 ? <Text type="secondary" style={{ fontSize: 12 }}>No readiness data</Text> : (
          <div>
            {readiness.map((r) => (
              <div key={r.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, marginBottom: 6 }}>
                {r.ok ? <CheckCircle2 size={14} color="#10b981" style={{ marginTop: 1, flexShrink: 0 }} /> : <XCircle size={14} color="#ef4444" style={{ marginTop: 1, flexShrink: 0 }} />}
                <Text style={{ fontSize: 12 }}>{r.label}{r.detail ? <Text type="secondary" style={{ fontSize: 12 }}> — {r.detail}</Text> : null}</Text>
              </div>
            ))}
          </div>
        )}
      </div>
    </Drawer>
  );
}
