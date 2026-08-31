import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import api from '../../api/axios';
import { usePermissions } from '../../store/usePermissions';
import { STAGE_NAMES } from '../crm/production/StageSteps';
import {
  ChevronLeftIcon, ChevronRightIcon, LockClosedIcon, LockOpenIcon, XMarkIcon,
  ExclamationTriangleIcon, TruckIcon, UserGroupIcon, Squares2X2Icon, ArrowPathIcon,
} from '@heroicons/react/24/outline';

// ── Week helpers ──────────────────────────────────────────────────────────
// weekKey format: 'YYYY-Www' (ISO 8601 week, Monday-start), computed with the
// classic "Thursday of this week" trick so it matches what the backend expects.

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SLOTS = ['AM', 'PM'];
const BLOCK_TYPES = ['RD', 'Client', 'Docs', 'Leave'];
const BLOCK_BADGE = { RD: 'badge-purple', Client: 'badge-blue', Docs: 'badge-gray', Leave: 'badge-red' };
const STATUS_BADGE = { Planned: 'badge-gray', Confirmed: 'badge-blue', 'In Progress': 'badge-yellow', Done: 'badge-green', Removed: 'badge-red' };

function pad2(n) { return String(n).padStart(2, '0'); }
function toDateStr(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }

function mondayOf(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = (d.getDay() + 6) % 7; // Mon=0..Sun=6
  d.setDate(d.getDate() - day);
  return d;
}

function weekKeyOf(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  d.setUTCDate(d.getUTCDate() - dayNum + 3); // Thursday of this ISO week
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

  // Defensive unwrap — the routes are new, follow this app's `{ success, message, ...data }`
  // convention, but tolerate a couple of reasonable shapes for the payload key.
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

  // Frozen-week edits get rejected with a 400 asking for a reason — prompt once and retry.
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
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Squares2X2Icon className="w-5 h-5 text-blue-500" />
            Kitchen Schedule
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Weekly production timetable — place batches, assign teams, track readiness</p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg p-1">
            <button onClick={() => setWeekOffset((o) => o - 1)} className="p-1.5 rounded-md hover:bg-white dark:hover:bg-white/10 text-gray-500 dark:text-gray-300 transition-colors">
              <ChevronLeftIcon className="w-4 h-4" />
            </button>
            <button onClick={() => setWeekOffset(0)} className={clsx('px-3 py-1 text-xs font-semibold rounded-md transition-colors', weekOffset === 0 ? 'bg-blue-600 text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-white/10')}>
              This Week
            </button>
            <button onClick={() => setWeekOffset((o) => o + 1)} className="p-1.5 rounded-md hover:bg-white dark:hover:bg-white/10 text-gray-500 dark:text-gray-300 transition-colors">
              <ChevronRightIcon className="w-4 h-4" />
            </button>
          </div>
          {isManager ? (
            weekDoc.frozen ? (
              <button onClick={() => unfreezeMutation.mutate()} disabled={unfreezeMutation.isPending} className="btn-secondary">
                <LockOpenIcon className="w-4 h-4" />{unfreezeMutation.isPending ? 'Unfreezing…' : 'Unfreeze Week'}
              </button>
            ) : (
              <button
                onClick={() => {
                  if (!window.confirm('Freeze this week? Editing after freezing will require a reason.')) return;
                  freezeMutation.mutate(undefined, { onError: (err) => toast.error(err?.response?.data?.message || 'Cannot freeze — some slots are not ready') });
                }}
                disabled={freezeMutation.isPending}
                className="btn-primary"
              >
                <LockClosedIcon className="w-4 h-4" />{freezeMutation.isPending ? 'Freezing…' : 'Freeze Week'}
              </button>
            )
          ) : null}
        </div>
      </div>

      <p className="text-sm text-gray-600 dark:text-gray-300 -mt-3">
        Week of <strong>{fmtShort(weekDates[0])} – {fmtShort(weekDates[5])}, {weekDates[0].getFullYear()}</strong>
        <span className="text-gray-400 ml-2 font-mono text-xs">{weekKey}</span>
        {weekDoc.frozen && <span className="badge badge-blue ml-3"><LockClosedIcon className="w-3 h-3" />Frozen</span>}
      </p>

      {!isManager && (
        <div className="rounded-xl px-4 py-2.5 text-sm bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 text-blue-700 dark:text-blue-300">
          View-only — placing batches, assigning teams, and freezing the week require a manager.
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-48"><ArrowPathIcon className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label: 'Slots Filled', value: `${filledCount}/${totalCells}` },
              { label: 'Tray (Unscheduled)', value: tray.length },
              { label: 'Conflicts', value: conflicts.length, danger: conflicts.length > 0 },
              { label: 'Credit Spread', value: creditSpread },
              { label: 'Delivery Risks', value: deliveryRisks.length, danger: deliveryRisks.length > 0 },
            ].map((kpi) => (
              <div key={kpi.label} className="stat-card">
                <div>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{kpi.label}</p>
                  <p className={clsx('text-2xl font-bold mt-1', kpi.danger ? 'text-red-500' : 'text-gray-900 dark:text-white')}>{kpi.value}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-4">
            {/* Timetable grid */}
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-[#1b2e4a]">
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Timetable</h2>
                {selectedTray && isManager && (
                  <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">Selected: {selectedTray.catalogProduct?.name || selectedTray.orderNumber} — click an empty cell to place</span>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-[#1b2e4a]">
                      <th className="text-left text-[11px] font-semibold text-gray-400 uppercase px-4 py-2.5 w-14"></th>
                      {weekDates.map((d, i) => (
                        <th key={i} className="text-left text-[11px] font-semibold text-gray-400 uppercase px-3 py-2.5 whitespace-nowrap">
                          {DAY_LABELS[i]} <span className="text-gray-500 dark:text-gray-400 normal-case font-medium">{fmtShort(d)}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {SLOTS.map((slotName) => (
                      <tr key={slotName} className="border-b border-gray-50 dark:border-[#1b2e4a]/60">
                        <td className="px-4 py-2 text-xs font-bold text-gray-400 align-top">{slotName}</td>
                        {weekDates.map((d) => {
                          const dateStr = toDateStr(d);
                          const slot = slotAt(dateStr, slotName);
                          return (
                            <td key={dateStr + slotName} className="px-1.5 py-1.5 align-top">
                              {slot ? (
                                <button
                                  onClick={() => setActiveSlot(slot)}
                                  className="w-full text-left p-2 rounded-lg border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 hover:bg-white dark:hover:bg-white/10 transition-colors min-h-[76px]"
                                >
                                  <div className="flex items-center gap-1.5">
                                    <span className={clsx('w-2 h-2 rounded-full flex-shrink-0', slot.readiness?.ready ? 'bg-emerald-500' : 'bg-red-500')} title={slot.readiness?.ready ? 'Ready' : 'Not ready'} />
                                    <span className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">{slot.productionOrderId?.catalogProduct?.name || slot.productionOrderId?.orderNumber || 'Batch'}</span>
                                  </div>
                                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 truncate">{personName(slot.leader) || 'No leader'}{slot.support?.length ? ` +${slot.support.length}` : ''}</p>
                                  <span className={clsx('badge mt-1.5', STATUS_BADGE[slot.status] || 'badge-gray')}>{slot.status}</span>
                                </button>
                              ) : (
                                <button
                                  onClick={() => placeOnCell(dateStr, slotName)}
                                  disabled={!isManager || !selectedTray}
                                  className={clsx('w-full min-h-[76px] rounded-lg border border-dashed flex items-center justify-center text-xs transition-colors',
                                    isManager && selectedTray
                                      ? 'border-blue-300 dark:border-blue-500/40 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 cursor-pointer'
                                      : 'border-gray-200 dark:border-white/10 text-gray-300 dark:text-gray-600 cursor-default')}
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
            </div>

            {/* Tray sidebar */}
            <div className="card overflow-hidden flex flex-col">
              <div className="px-4 py-3.5 border-b border-gray-100 dark:border-[#1b2e4a]">
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Tray — Unscheduled Batches</h2>
                <p className="text-xs text-gray-400 mt-0.5">{tray.length} waiting</p>
              </div>
              <div className="p-2 space-y-1.5 overflow-y-auto max-h-[520px]">
                {tray.length === 0 ? (
                  <p className="text-center text-gray-400 text-xs py-8">Tray is empty</p>
                ) : tray.map((order) => (
                  <button
                    key={order._id}
                    onClick={() => isManager && setSelectedTray((cur) => (cur?._id === order._id ? null : order))}
                    disabled={!isManager}
                    className={clsx('w-full text-left p-2.5 rounded-lg border transition-colors',
                      selectedTray?._id === order._id
                        ? 'border-blue-400 bg-blue-50 dark:bg-blue-500/10 ring-1 ring-blue-400'
                        : 'border-gray-200 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/5')}
                  >
                    <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">{order.catalogProduct?.name || order.orderNumber}</p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 truncate">{order.customer || '—'} · {order.batchSizeKg ? `${order.batchSizeKg}kg` : ''}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">Delivery: {fmtDateStr(order.deliveryDate)}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Conflicts + Delivery risks + Credits */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5 mb-2">
                <ExclamationTriangleIcon className="w-4 h-4 text-amber-500" />Conflicts ({conflicts.length})
              </h3>
              {conflicts.length === 0 ? <p className="text-xs text-gray-400">None</p> : (
                <ul className="space-y-1.5">
                  {conflicts.map((c, i) => <li key={i} className="text-xs text-gray-600 dark:text-gray-300">{c.date} {c.slot} — {c.message}</li>)}
                </ul>
              )}
            </div>
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5 mb-2">
                <TruckIcon className="w-4 h-4 text-red-500" />Delivery Risks ({deliveryRisks.length})
              </h3>
              {deliveryRisks.length === 0 ? <p className="text-xs text-gray-400">None</p> : (
                <ul className="space-y-1.5">
                  {deliveryRisks.map((c, i) => <li key={i} className="text-xs text-gray-600 dark:text-gray-300">{c.date} {c.slot} — {c.message}</li>)}
                </ul>
              )}
            </div>
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5 mb-2">
                <UserGroupIcon className="w-4 h-4 text-blue-500" />Support Credits (this week)
              </h3>
              {credits.length === 0 ? <p className="text-xs text-gray-400">None yet</p> : (
                <ul className="space-y-1">
                  {credits.map((c) => (
                    <li key={c.id} className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-300">
                      <span>{c.name}</span><span className="font-semibold">{c.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Availability strip */}
          <div className="card overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100 dark:border-[#1b2e4a]">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Availability — Production Team</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Blue "Busy" cells are real batch assignments from this schedule — click to open that order.{' '}
                {isManager ? 'Other cells cycle: RD → Client → Docs → Leave → clear' : 'Read-only'}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-[#1b2e4a]">
                    <th className="text-left text-[11px] font-semibold text-gray-400 uppercase px-4 py-2.5 whitespace-nowrap">Person</th>
                    {weekDates.map((d, i) => (
                      <th key={i} className="text-left text-[11px] font-semibold text-gray-400 uppercase px-3 py-2.5 whitespace-nowrap">{DAY_LABELS[i]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {prodUsers.length === 0 ? (
                    <tr><td colSpan={7} className="text-center text-gray-400 py-8 text-sm">No active Production-dept users found</td></tr>
                  ) : prodUsers.map((u) => (
                    <tr key={u._id} className="border-b border-gray-50 dark:border-[#1b2e4a]/60">
                      <td className="px-4 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">{u.firstName} {u.lastName}</td>
                      {weekDates.map((d) => {
                        const dateStr = toDateStr(d);
                        const assignedSlot = assignedSlotFor(slots, u._id, dateStr);
                        if (assignedSlot) {
                          const order = assignedSlot.productionOrderId || {};
                          const label = order.customer || order.orderNumber || 'Batch';
                          return (
                            <td key={dateStr} className="px-1.5 py-1.5">
                              <button
                                onClick={() => {
                                  if (order.leadId) navigate(`/samples?open=${order.leadId?._id || order.leadId}&leadTab=Production`);
                                  else setActiveSlot(assignedSlot);
                                }}
                                title={`${label} — currently at ${STAGE_NAMES[order.stage] ?? 'stage ' + order.stage}`}
                                className="w-full py-1.5 rounded-md text-[11px] font-semibold bg-blue-100 text-blue-700 hover:brightness-95 truncate px-1"
                              >
                                🏭 {label}
                              </button>
                            </td>
                          );
                        }
                        const block = blocks.find((b) => personId(b.userId) === u._id && b.date === dateStr);
                        return (
                          <td key={dateStr} className="px-1.5 py-1.5">
                            <button
                              onClick={() => cycleBlock(dateStr, u._id)}
                              disabled={!isManager}
                              className={clsx('w-full py-1.5 rounded-md text-[11px] font-semibold transition-colors',
                                block ? BLOCK_BADGE[block.type] : 'bg-gray-50 dark:bg-white/5 text-gray-300 dark:text-gray-600',
                                isManager && 'cursor-pointer hover:brightness-95')}
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
          </div>
        </>
      )}

      {activeSlot && (
        <SlotModal
          slot={activeSlot}
          slots={slots}
          prodUsers={prodUsers}
          isManager={isManager}
          onClose={() => setActiveSlot(null)}
          onPatch={(body) => runWithReason(patchSlotMutation, { slotId: activeSlot._id, ...body })}
          onRemove={() => {
            if (!window.confirm('Remove this batch from the schedule?')) return;
            runWithReason(removeSlotMutation, { slotId: activeSlot._id });
          }}
          busy={patchSlotMutation.isPending || removeSlotMutation.isPending}
        />
      )}
    </div>
  );
}

// ── Slot detail modal ────────────────────────────────────────────────────

function SlotModal({ slot, slots, prodUsers, isManager, onClose, onPatch, onRemove, busy }) {
  const [leaderId, setLeaderId] = useState(personId(slot.leader) || '');
  const [support1, setSupport1] = useState(personId(slot.support?.[0]) || '');
  const readiness = readinessEntries(slot.readiness);
  const order = slot.productionOrderId || {};

  // Double-booking guard — people already leader/support on another batch in this exact
  // date+slot don't show up here, so a manager can't accidentally assign them twice.
  const busyIds = useMemo(() => busyUserIdsAt(slots, slot.date, slot._id), [slots, slot.date, slot._id]);
  const availableUsers = (excludeId) => prodUsers.filter((u) => u._id === excludeId || !busyIds.has(u._id));

  const saveAssignment = () => {
    onPatch({ leader: leaderId || null, support: support1 ? [support1] : [] });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative card w-full max-w-lg shadow-modal max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-[#1b2e4a]">
          <div>
            <h3 className="font-bold text-gray-900 dark:text-white">{order.catalogProduct?.name || order.orderNumber || 'Batch'}</h3>
            <p className="text-xs text-gray-400 mt-0.5">{slot.date} · {slot.slot} · <span className={clsx('badge', STATUS_BADGE[slot.status] || 'badge-gray')}>{slot.status}</span></p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div><p className="text-gray-400 uppercase text-[10px]">Customer</p><p className="text-gray-700 dark:text-gray-300 font-medium">{order.customer || '—'}</p></div>
            <div><p className="text-gray-400 uppercase text-[10px]">Delivery</p><p className="text-gray-700 dark:text-gray-300 font-medium">{fmtDateStr(order.deliveryDate)}</p></div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Batch Leader</label>
              {isManager ? (
                <select value={leaderId} onChange={(e) => setLeaderId(e.target.value)} className="input">
                  <option value="">Select leader</option>
                  {availableUsers(leaderId).map((u) => <option key={u._id} value={u._id}>{u.firstName} {u.lastName}</option>)}
                </select>
              ) : (
                <p className="text-sm text-gray-700 dark:text-gray-300">{personName(slot.leader) || '—'}</p>
              )}
            </div>
            <div>
              <label className="label">Support</label>
              {isManager ? (
                <select value={support1} onChange={(e) => setSupport1(e.target.value)} className="input">
                  <option value="">None</option>
                  {availableUsers(support1).map((u) => <option key={u._id} value={u._id}>{u.firstName} {u.lastName}</option>)}
                </select>
              ) : (
                <p className="text-sm text-gray-700 dark:text-gray-300">{personName(slot.support?.[0]) || '—'}</p>
              )}
            </div>
            {isManager && (
              <div className="flex items-end col-span-1 sm:col-span-2">
                <button onClick={saveAssignment} disabled={busy} className="btn-secondary w-full justify-center">Save Assignment</button>
              </div>
            )}
          </div>
          {isManager && busyIds.size > 0 && (
            <p className="text-[11px] text-gray-400">
              {busyIds.size} {busyIds.size === 1 ? 'person is' : 'people are'} already on another batch that day — hidden from these lists.
            </p>
          )}

          <div>
            <p className="label mb-2">Readiness</p>
            <div className="space-y-1.5">
              {readiness.length === 0 ? <p className="text-xs text-gray-400">No readiness data</p> : readiness.map((r) => (
                <div key={r.key} className="flex items-start gap-2 text-xs">
                  <span className={clsx('mt-0.5 w-3.5 h-3.5 rounded-full flex-shrink-0 flex items-center justify-center text-[9px] font-bold text-white', r.ok ? 'bg-emerald-500' : 'bg-red-500')}>
                    {r.ok ? '✓' : '✕'}
                  </span>
                  <span className="text-gray-700 dark:text-gray-300">
                    {r.label}{r.detail ? <span className="text-gray-400"> — {r.detail}</span> : null}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {isManager && (
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-100 dark:border-[#1b2e4a]">
              {slot.status === 'Planned' && (
                <button
                  onClick={() => onPatch({ status: 'Confirmed' })}
                  disabled={busy || !slot.readiness?.ready}
                  title={!slot.readiness?.ready ? 'Not all readiness checks pass yet' : undefined}
                  className="btn-primary"
                >
                  Confirm
                </button>
              )}
              {slot.status === 'Confirmed' && (
                <button onClick={() => onPatch({ status: 'In Progress' })} disabled={busy} className="btn-primary">Start</button>
              )}
              {slot.status === 'In Progress' && (
                <button onClick={() => onPatch({ status: 'Done' })} disabled={busy} className="btn-primary">Done</button>
              )}
              <button onClick={onRemove} disabled={busy} className="btn-danger ml-auto">Remove</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
