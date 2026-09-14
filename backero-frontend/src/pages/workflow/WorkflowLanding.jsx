import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Zap, Search, Filter, ChevronDown, Trash2, AlertTriangle, Sparkles,
  UserCircle, X, Loader2, UploadCloud, FileDown, CheckCircle2, Archive,
  ClipboardList, RefreshCw, CircleCheck, XCircle, Pencil, Clock,
} from 'lucide-react';
import api from '../../api/axios';
import { useAuthStore } from '../../store/useAuthStore';
import { useSocketStore } from '../../store/useSocketStore';
import { format, isPast } from 'date-fns';
import { clsx } from 'clsx';
import CreateTaskModal from '../../components/workflow/CreateTaskModal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import { Button, Drawer, Input, Modal, Select, Space, Steps, Typography, Upload } from 'antd';

const { Title: AntTitle, Text: AntText } = Typography;
const { TextArea } = Input;

// ── Constants ─────────────────────────────────────────────────────────────────

const ROLE_LEVEL = { super_admin: 7, chairman: 6, founder: 5, admin: 4, manager: 3, team_lead: 2, member: 1 };

const DEPT_COLORS = {
  Marketing:           { bg: 'bg-purple-600',  light: 'bg-purple-50',  border: 'border-purple-200', text: 'text-purple-700',  ring: 'ring-purple-200',  dot: 'bg-purple-500'  },
  Marketplace:         { bg: 'bg-orange-500',  light: 'bg-orange-50',  border: 'border-orange-200', text: 'text-orange-700',  ring: 'ring-orange-200',  dot: 'bg-orange-500'  },
  Sales:               { bg: 'bg-green-600',   light: 'bg-green-50',   border: 'border-green-200',  text: 'text-green-700',   ring: 'ring-green-200',   dot: 'bg-green-500'   },
  Production:          { bg: 'bg-blue-600',    light: 'bg-blue-50',    border: 'border-blue-200',   text: 'text-blue-700',    ring: 'ring-blue-200',    dot: 'bg-blue-500'    },
  'R&D':               { bg: 'bg-cyan-600',    light: 'bg-cyan-50',    border: 'border-cyan-200',   text: 'text-cyan-700',    ring: 'ring-cyan-200',    dot: 'bg-cyan-500'    },
  Operations:          { bg: 'bg-indigo-600',  light: 'bg-indigo-50',  border: 'border-indigo-200', text: 'text-indigo-700',  ring: 'ring-indigo-200',  dot: 'bg-indigo-500'  },
  'Accounts & Finance':{ bg: 'bg-emerald-600', light: 'bg-emerald-50', border: 'border-emerald-200',text: 'text-emerald-700', ring: 'ring-emerald-200', dot: 'bg-emerald-500' },
  HR:                  { bg: 'bg-amber-500',   light: 'bg-amber-50',   border: 'border-amber-200',  text: 'text-amber-700',   ring: 'ring-amber-200',   dot: 'bg-amber-500'   },
  Management:          { bg: 'bg-slate-700',   light: 'bg-slate-50',   border: 'border-slate-200',  text: 'text-slate-700',   ring: 'ring-slate-200',   dot: 'bg-slate-500'   },
};

const STATUS_STYLE = {
  'Pending':          'bg-slate-100 text-slate-600',
  'Assigned':         'bg-blue-100 text-blue-700',
  'In Progress':      'bg-yellow-100 text-yellow-700',
  'Approval Pending': 'bg-indigo-100 text-indigo-700',
  'Changes Requested':'bg-orange-100 text-orange-700',
  'Completed':        'bg-green-100 text-green-700',
  'Achieved':         'bg-amber-100 text-amber-700',
  'Reopened':         'bg-red-100 text-red-700',
  'Cancelled':        'bg-gray-100 text-gray-500',
};

const STATUS_DOT = {
  'Pending':          'bg-slate-400',
  'Assigned':         'bg-blue-500',
  'In Progress':      'bg-yellow-400',
  'Approval Pending': 'bg-indigo-500',
  'Changes Requested':'bg-orange-500',
  'Completed':        'bg-green-500',
  'Achieved':         'bg-amber-500',
  'Reopened':         'bg-red-500',
  'Cancelled':        'bg-gray-400',
};

const PRIORITY_BORDER = {
  critical: 'border-l-red-500', urgent: 'border-l-red-400',
  high: 'border-l-orange-400',  medium: 'border-l-blue-400', low: 'border-l-slate-300',
};

const PRIORITY_TEXT = {
  critical: 'text-red-600 font-bold', urgent: 'text-red-500 font-bold',
  high: 'text-orange-600', medium: 'text-blue-600', low: 'text-slate-400',
};

const ALL_DEPTS = ['Marketing','Marketplace','Sales','Production','R&D','Operations','Accounts & Finance','HR','Management'];

// ── Task Card ─────────────────────────────────────────────────────────────────

function TaskCard({ task, colors, canDelete, onDelete }) {
  const navigate  = useNavigate();
  const qc        = useQueryClient();
  const [open,          setOpen]          = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [renaming,      setRenaming]      = useState(false);
  const [renameVal,     setRenameVal]     = useState('');
  const renameRef = React.useRef(null);

  const startRename = (e) => {
    e.stopPropagation();
    setRenameVal(task.title);
    setRenaming(true);
    setTimeout(() => renameRef.current?.select(), 30);
  };

  const commitRename = async () => {
    const val = renameVal.trim();
    if (!val || val === task.title) { setRenaming(false); return; }
    try {
      await api.put(`/tasks/${task._id}`, { title: val });
      qc.invalidateQueries({ queryKey: ['tasks', 'workflow-board'] });
    } catch (e) { console.error(e); }
    setRenaming(false);
  };

  const due       = task.dueDate ? new Date(task.dueDate) : null;
  const isDone    = task.status === 'Completed' || task.status === 'Achieved';
  const isOverdue = due && isPast(due) && !isDone;
  const subtasks  = task.subTasks || [];
  const hasSubs   = subtasks.length > 0;
  const progress  = isDone ? 100 : (task.progress || 0);

  const initials = task.assignedTo
    ? ((task.assignedTo.firstName?.[0] || '') + (task.assignedTo.lastName?.[0] || '')).toUpperCase()
    : null;

  return (
    <>
    <div className={clsx('group bg-white dark:bg-[#0f172a] rounded-xl border border-gray-200 dark:border-[#1b2e4a] border-l-4 shadow-sm transition-shadow hover:shadow-md', PRIORITY_BORDER[task.priority] || 'border-l-slate-300')}>

      {/* ── Main task row ── */}
      <div className="flex items-start gap-2 px-3 pt-3 pb-2">
        {/* Chevron toggle */}
        <div className="mt-0.5 w-4 flex-shrink-0" onClick={() => hasSubs && setOpen(p => !p)}>
          {hasSubs
            ? <ChevronDown className={clsx('w-4 h-4 text-gray-400 transition-transform duration-200', !open && '-rotate-90')} />
            : <span className="w-4 block" />}
        </div>

        {/* Status dot */}
        <span className={clsx('w-2 h-2 rounded-full flex-shrink-0 mt-1', STATUS_DOT[task.status] || 'bg-gray-400')} />

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Title + status badge + actions */}
          <div className="flex items-start justify-between gap-2">
            {renaming ? (
              <input
                ref={renameRef}
                value={renameVal}
                onChange={e => setRenameVal(e.target.value)}
                onBlur={commitRename}
                onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenaming(false); }}
                onClick={e => e.stopPropagation()}
                className="flex-1 text-xs font-semibold text-gray-900 border border-indigo-400 rounded px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
              />
            ) : (
              <button
                onClick={() => {
                  const parentId = task.parentTask;
                  navigate(parentId ? `/workflow/${parentId}?view=dept` : `/workflow/${task._id}`);
                }}
                className="text-xs font-semibold text-gray-900 dark:text-white leading-snug flex-1 text-left hover:text-brand-600 transition-colors cursor-pointer">
                {task.title}
              </button>
            )}
            <div className="flex items-center gap-1 flex-shrink-0">
              <span className={clsx('text-[9px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap', STATUS_STYLE[task.status] || 'bg-gray-100 text-gray-600')}>
                {task.status}
              </span>
              {canDelete && !renaming && (
                <>
                  <button
                    onClick={startRename}
                    title="Rename task"
                    className="p-1 rounded-md bg-indigo-50 text-indigo-400 hover:bg-indigo-100 hover:text-indigo-600 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); setConfirmDelete(true); }}
                    title="Delete task"
                    className="p-1 rounded-md bg-red-50 text-red-400 hover:bg-red-100 hover:text-red-600 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Assignee + due + progress */}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {initials ? (
              <div className={clsx('w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0', colors.bg)} title={`${task.assignedTo.firstName} ${task.assignedTo.lastName}`}>
                {initials}
              </div>
            ) : (
              <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-[9px] text-gray-400">—</div>
            )}
            {due && (
              <span className={clsx('text-[10px] font-medium flex items-center gap-0.5', isOverdue ? 'text-red-500' : 'text-gray-400')}>
                {isOverdue && <AlertTriangle className="w-2.5 h-2.5" />}{format(due, 'dd MMM')}
              </span>
            )}
            <span className={clsx('text-[10px] font-bold ml-auto', isDone ? 'text-green-600' : 'text-gray-600')}>{progress}%</span>
          </div>

          {/* Progress bar */}
          <div className="mt-1.5 w-full bg-gray-100 rounded-full h-1 overflow-hidden">
            <div className={clsx('h-full rounded-full transition-all', isDone ? 'bg-green-500' : 'bg-brand-500')} style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>

      {/* ── Subtask rows (expand/collapse) ── */}
      {hasSubs && open && (
        <div className="border-t border-gray-100">
          {subtasks.map((s, i) => {
            const sDue      = s.dueDate ? new Date(s.dueDate) : null;
            const sDone     = s.status === 'Completed' || s.status === 'Achieved';
            const sOverdue  = sDue && isPast(sDue) && !sDone;
            const sPct      = sDone ? 100 : (s.progress ?? 0);
            const sInitials = s.assignedTo
              ? ((s.assignedTo.firstName?.[0] || '') + (s.assignedTo.lastName?.[0] || '')).toUpperCase()
              : null;
            return (
              <div key={i} className="flex items-start gap-2 pl-9 pr-3 py-2 border-b border-gray-50 dark:border-[#1b2e4a] last:border-b-0 hover:bg-gray-50/60 dark:hover:bg-[#17263d]/40">
                <span className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5', STATUS_DOT[s.status] || 'bg-gray-300')} />
                <div className="flex-1 min-w-0">
                  {/* Sub title + status */}
                  <div className="flex items-start justify-between gap-1">
                    <p className={clsx('text-[10px] font-medium leading-snug flex-1', sDone ? 'line-through text-gray-400' : 'text-gray-700 dark:text-gray-300')}>
                      {s.title}
                    </p>
                    <span className={clsx('text-[9px] px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0 whitespace-nowrap', STATUS_STYLE[s.status] || 'bg-gray-100 text-gray-500')}>
                      {s.status}
                    </span>
                  </div>
                  {/* Assignee + due + progress */}
                  <div className="flex items-center gap-2 mt-1">
                    {sInitials ? (
                      <div className={clsx('w-5 h-5 rounded-full flex items-center justify-center text-white text-[8px] font-bold flex-shrink-0', colors.bg)} title={s.assignedTo ? `${s.assignedTo.firstName} ${s.assignedTo.lastName}` : ''}>
                        {sInitials}
                      </div>
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center text-[8px] text-gray-400">—</div>
                    )}
                    {sDue && (
                      <span className={clsx('text-[9px] flex items-center gap-0.5', sOverdue ? 'text-red-500' : 'text-gray-400')}>
                        {sOverdue && <AlertTriangle className="w-2 h-2" />}{format(sDue, 'dd MMM')}
                      </span>
                    )}
                    <div className="flex-1 flex items-center gap-1.5 ml-auto">
                      <div className="flex-1 bg-gray-100 rounded-full h-1 overflow-hidden">
                        <div className={clsx('h-full rounded-full', sDone ? 'bg-green-400' : 'bg-brand-400')} style={{ width: `${sPct}%` }} />
                      </div>
                      <span className="text-[9px] text-gray-400 font-semibold w-6 text-right">{sPct}%</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          {/* Open workflow link at bottom when expanded */}
          <button
            onClick={() => {
              const parentId = task.parentTask;
              navigate(parentId ? `/workflow/${parentId}?view=dept` : `/workflow/${task._id}`);
            }}
            className={clsx('w-full text-[10px] font-semibold py-1.5 transition-colors rounded-b-xl', colors.light, colors.text, 'hover:opacity-80')}
          >
            Open Project →
          </button>
        </div>
      )}
    </div>

    <ConfirmDialog
      open={confirmDelete}
      title="Delete this task?"
      message={`"${task.title}" and all its subtasks will be permanently deleted. This cannot be undone.`}
      confirmLabel="Yes, Delete"
      confirmColor="red"
      onConfirm={() => { setConfirmDelete(false); onDelete?.(task._id, task.title); }}
      onCancel={() => setConfirmDelete(false)}
    />
    </>
  );
}

// ── Department Column ─────────────────────────────────────────────────────────

function DeptColumn({ dept, tasks, colors, canDelete, onDelete }) {
  const completed = tasks.filter(t => t.status === 'Completed' || t.status === 'Achieved').length;
  const inProgress = tasks.filter(t => t.status === 'In Progress').length;
  const overdue = tasks.filter(t => t.dueDate && isPast(new Date(t.dueDate)) && t.status !== 'Completed' && t.status !== 'Achieved').length;

  return (
    <div className="flex-shrink-0 w-72 flex flex-col rounded-2xl overflow-hidden border border-gray-200 dark:border-[#1b2e4a] shadow-sm bg-white dark:bg-[#0f172a]">
      {/* Column header — minimal white surface, colored accent dot only */}
      <div className="px-4 pt-3.5 pb-3 border-b border-gray-100 dark:border-[#1b2e4a]">
        <div className="flex items-center justify-between mb-1.5">
          <h3 className="text-sm font-bold text-gray-800 dark:text-white truncate flex items-center gap-2">
            <span className={clsx('w-2 h-2 rounded-full flex-shrink-0', colors.dot)} />
            {dept}
          </h3>
          <span className="text-xs font-bold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-[#1b2e4a] px-2 py-0.5 rounded-full">
            {tasks.length}
          </span>
        </div>
        <div className="flex items-center gap-3 text-[10px]">
          <span className="text-gray-400 flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-green-500" /> {completed} done</span>
          {inProgress > 0 && <span className="text-amber-600 font-semibold flex items-center gap-1"><RefreshCw className="w-3 h-3" /> {inProgress} active</span>}
          {overdue > 0 && <span className="text-red-500 font-semibold flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {overdue} overdue</span>}
        </div>
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5 bg-gray-50/60 dark:bg-[#0f172a]" style={{ maxHeight: 'calc(100vh - 260px)' }}>
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10">
            <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center mb-2', colors.light)}>
              <Zap className={clsx('w-5 h-5', colors.text)} />
            </div>
            <p className="text-xs text-gray-400 font-medium">No tasks yet</p>
          </div>
        ) : (
          tasks.map(task => <TaskCard key={task._id} task={task} colors={colors} canDelete={canDelete} onDelete={onDelete} />)
        )}
      </div>
    </div>
  );
}

// ── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, color, icon }) {
  return (
    <div className="bg-white dark:bg-[#0f172a] rounded-xl border border-gray-200 dark:border-[#1b2e4a] shadow-sm px-4 py-3 flex items-center gap-3">
      <div className={clsx('w-9 h-9 rounded-lg flex items-center justify-center text-white text-sm font-bold flex-shrink-0', color)}>
        {icon}
      </div>
      <div>
        <p className="text-xl font-bold text-gray-900 dark:text-white leading-none">{value}</p>
        <p className="text-[11px] text-gray-500 dark:text-gray-400 font-medium mt-0.5">{label}</p>
      </div>
    </div>
  );
}

const DEPT_NAMES = ['Marketing','Marketplace','Sales','Production','R&D','Operations','Accounts & Finance','HR','Management'];
const PRIORITY_OPTS = ['critical','urgent','high','medium','low'];
const uid = () => Math.random().toString(36).slice(2);

// ── Dept Hub Modal — 2-step wizard ────────────────────────────────────────────
function DeptHubModal({ onClose, onCreated, prefill }) {
  const { user } = useAuthStore();
  const isManagerRole = (ROLE_LEVEL[user?.role] || 1) === 3;

  const [step, setStep] = useState(1);
  const [submitted, setSubmitted] = useState(false);
  const [main, setMain] = useState({
    title: prefill?.title || '',
    description: prefill?.description || '',
    dueDate: prefill?.dueDate || '',
    priority: prefill?.priority || 'high',
  });
  const emptyRow = () => ({ id: uid(), dept: '', taskTitle: '', managerId: '', dueDate: '' });
  const [rows, setRows]     = useState([{ id: uid(), dept: 'Production', taskTitle: '', managerId: '', dueDate: '' }]);
  const [allUsers, setAll]  = useState([]);
  const [busy, setBusy]     = useState(false);
  const [err,  setErr]      = useState('');
  const setM = (k, v) => setMain(p => ({ ...p, [k]: v }));

  useEffect(() => {
    api.get('/users', { params: { limit: 300 } })
      .then(r => setAll(r.data?.data?.data || r.data?.data || []))
      .catch(() => {});
  }, []);

  const addRow    = () => setRows(p => [...p, emptyRow()]);
  const removeRow = id => setRows(p => p.filter(r => r.id !== id));
  const updateRow = (id, k, v) => setRows(p => p.map(r => r.id === id ? { ...r, [k]: v } : r));

  const managersFor = dept => {
    const mgrs = allUsers.filter(u => ['manager','team_lead','admin','founder','chairman','super_admin'].includes(u.role));
    const match = dept ? mgrs.filter(u => u.department === dept) : [];
    return match.length > 0 ? match : mgrs;
  };

  const goNext = () => {
    if (!main.title.trim()) return setErr('Project name is required');
    setErr(''); setStep(2);
  };

  const submit = async () => {
    const valid = rows.filter(r => r.dept && r.taskTitle.trim());
    if (!valid.length) return setErr('Add at least one department task');
    setBusy(true); setErr('');
    try {
      const res = await api.post('/tasks', {
        title: main.title.trim(), description: main.description || undefined,
        priority: main.priority, dueDate: main.dueDate || undefined,
        department: 'Management', status: 'Pending',
        isDeptHub: true,
      });
      const rootId = res.data?.data?.task?._id || res.data?.data?._id || res.data?.task?._id;
      for (const row of valid) {
        await api.post('/tasks', {
          title: row.taskTitle.trim(), department: row.dept,
          assignedTo: row.managerId || undefined, dueDate: row.dueDate || undefined,
          priority: main.priority, parentTask: rootId,
          status: row.managerId ? 'Assigned' : 'Pending',
        });
      }
      // If opened from a lead, link the lead to this project
      if (prefill?.leadId) {
        await api.post(`/crm/leads/${prefill.leadId}/convert-to-task`, {
          taskId: rootId,
          dueDate: main.dueDate || undefined,
        }).catch(() => {});
      }
      if (isManagerRole) {
        setSubmitted(true);
        setBusy(false);
      } else {
        onCreated(rootId);
      }
    } catch (e) {
      setErr(e?.response?.data?.message || 'Failed to create');
      setBusy(false);
    }
  };

  return (
    <Drawer
      open onClose={onClose} width={480} closeIcon={<X size={18} />}
      title={
        submitted ? 'Dept Hub Submitted' : (
          <Space direction="vertical" size={0}>
            <Space size={8}>
              <span>{step === 1 ? 'New Cross-Dept Project' : 'Assign to Departments'}</span>
              <span className="text-[10px] font-bold bg-brand-100 text-brand-600 px-2 py-0.5 rounded-full">Step {step}/2</span>
            </Space>
            {step === 2 && <AntText type="secondary" style={{ fontSize: 11 }}>"{main.title}"</AntText>}
          </Space>
        )
      }
      footer={submitted ? null : (
        step === 1 ? (
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button onClick={onClose}>Cancel</Button>
            <Button type="primary" onClick={goNext} disabled={!main.title.trim()}>Next: Assign Departments</Button>
          </Space>
        ) : (
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button onClick={() => { setStep(1); setErr(''); }}>Back</Button>
            <Button
              type="primary" loading={busy} onClick={submit}
              disabled={busy || !rows.some(r => r.dept && r.taskTitle.trim())}
              icon={<Sparkles size={14} />}
            >
              {isManagerRole ? 'Submit for Admin Approval' : 'Create Project'}
            </Button>
          </Space>
        )
      )}
    >
      {submitted ? (
        <div className="flex flex-col items-center text-center gap-4" style={{ padding: '32px 0' }}>
          <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center">
            <Sparkles className="w-8 h-8 text-amber-500" />
          </div>
          <div>
            <AntTitle level={5} style={{ marginBottom: 4 }}>Sent for Admin Approval</AntTitle>
            <AntText type="secondary" style={{ fontSize: 12 }}>
              Your Dept Hub <AntText strong>"{main.title}"</AntText> has been submitted.<br/>
              It will go live once an admin approves it.
            </AntText>
          </div>
          <Button type="primary" block onClick={() => onCreated(null)}>Done</Button>
        </div>
      ) : (
        <>
          <Steps
            size="small" current={step - 1} style={{ marginBottom: 20 }}
            items={[{ title: 'Project Details' }, { title: 'Dept Assignments' }]}
          />
          {step === 1 ? (
            <Space direction="vertical" style={{ width: '100%' }} size={14}>
              {err && <AntText type="danger" style={{ fontSize: 12 }}>{err}</AntText>}
              <div>
                <AntText strong style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>Project Name <AntText type="danger">*</AntText></AntText>
                <Input autoFocus value={main.title} onChange={e => setM('title', e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && goNext()}
                  placeholder="e.g. Launch New Soap — 2026" />
                <AntText type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>This project will be split across all departments you assign.</AntText>
              </div>
              <div>
                <AntText strong style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>Description</AntText>
                <TextArea value={main.description} onChange={e => setM('description', e.target.value)}
                  placeholder="Goal of this project…" rows={3} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <AntText strong style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>Priority</AntText>
                  <Select style={{ width: '100%' }} value={main.priority} onChange={v => setM('priority', v)}
                    options={PRIORITY_OPTS.map(p => ({ label: p, value: p }))} />
                </div>
                <div>
                  <AntText strong style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>Deadline</AntText>
                  <Input type="date" value={main.dueDate} onChange={e => setM('dueDate', e.target.value)} />
                </div>
              </div>
            </Space>
          ) : (
            <Space direction="vertical" style={{ width: '100%' }} size={12}>
              {err && <AntText type="danger" style={{ fontSize: 12 }}>{err}</AntText>}
              <AntText type="secondary" style={{ fontSize: 12 }}>For each department, set the task and assign the manager who will lead it.</AntText>
              {rows.map((row, idx) => (
                <div key={row.id} className={clsx('rounded-2xl border-2 p-4 space-y-3',
                  row.dept ? 'border-brand-200 bg-brand-50/30' : 'border-dashed border-gray-200 bg-white')}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-600">{row.dept || `Department ${idx + 1}`}</span>
                    {rows.length > 1 && (
                      <button onClick={() => removeRow(row.id)} className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-400">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 mb-1">Department *</label>
                      <Select
                        style={{ width: '100%' }} size="small" value={row.dept || undefined} placeholder="— Select —"
                        onChange={v => updateRow(row.id, 'dept', v)} options={DEPT_NAMES.map(d => ({ label: d, value: d }))}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 mb-1">Due Date</label>
                      <Input type="date" size="small" value={row.dueDate} onChange={e => updateRow(row.id, 'dueDate', e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 mb-1">Task for this Dept *</label>
                    <Input size="small" value={row.taskTitle} onChange={e => updateRow(row.id, 'taskTitle', e.target.value)}
                      placeholder={row.dept ? `What does ${row.dept} need to do?` : 'Task title…'} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 mb-1">Assign to Manager</label>
                    <Select
                      style={{ width: '100%' }} size="small" value={row.managerId || undefined} placeholder="— Select manager —"
                      onChange={v => updateRow(row.id, 'managerId', v)}
                      options={managersFor(row.dept).map(m => ({ label: `${m.firstName} ${m.lastName}${m.designation ? ` · ${m.designation}` : ''}`, value: m._id }))}
                    />
                  </div>
                </div>
              ))}
              <button onClick={addRow}
                className="w-full py-3 rounded-2xl border-2 border-dashed border-gray-200 text-xs font-semibold text-gray-400 hover:border-brand-400 hover:text-brand-500 flex items-center justify-center gap-2 transition-colors">
                <Plus className="w-4 h-4" /> Add Another Department
              </button>
            </Space>
          )}
        </>
      )}
    </Drawer>
  );
}

// ── Individual Task Modal ─────────────────────────────────────────────────────
function IndividualModal({ onClose, onCreated }) {
  const [form, setForm]       = useState({ title: '', description: '', department: '', assignedTo: '', priority: 'medium', dueDate: '' });
  const [members, setMembers] = useState([]);
  const [busy, setBusy]       = useState(false);
  const [err,  setErr]        = useState('');
  const [pendingApproval, setPendingApproval] = useState(false); // cross-manager assignment sent for approval
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  useEffect(() => {
    if (!form.department) return setMembers([]);
    api.get('/users', { params: { department: form.department, limit: 100 } })
      .then(r => setMembers(r.data?.data?.data || r.data?.data || []))
      .catch(() => setMembers([]));
  }, [form.department]);

  const submit = async () => {
    if (!form.title.trim()) return setErr('Task title is required');
    if (!form.department)   return setErr('Select a department');
    setBusy(true); setErr('');
    try {
      const res = await api.post('/tasks', {
        title: form.title.trim(),
        description: form.description || undefined,
        department: form.department,
        assignedTo: form.assignedTo || undefined,
        priority: form.priority,
        dueDate: form.dueDate || undefined,
        status: form.assignedTo ? 'Assigned' : 'Pending',
      });
      const data = res.data?.data || {};
      if (data.pendingManagerAssignment) {
        // Cross-manager assignment → waiting for admin approval
        setPendingApproval(true);
        onCreated(); // refresh board (task won't appear until approved)
      } else {
        onCreated();
      }
    } catch (e) {
      setErr(e?.response?.data?.message || 'Failed to create');
      setBusy(false);
    }
  };

  return (
    <Drawer
      open onClose={onClose} width={420} closeIcon={<X size={18} />}
      title={pendingApproval ? 'Sent for Admin Approval' : 'New Individual Task'}
      footer={pendingApproval ? null : (
        <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="primary" loading={busy} disabled={!form.title.trim() || !form.department} onClick={submit} icon={<UserCircle size={14} />}>
            Create
          </Button>
        </Space>
      )}
    >
      {pendingApproval ? (
        <div className="flex flex-col items-center text-center gap-4" style={{ padding: '32px 0' }}>
          <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center">
            <UserCircle className="w-8 h-8 text-blue-500" />
          </div>
          <AntText type="secondary" style={{ fontSize: 12, lineHeight: 1.6 }}>
            You assigned <AntText strong>"{form.title}"</AntText> to a manager in another department.<br/>
            An admin will review and approve the assignment.<br/>
            <AntText style={{ color: '#2563eb', fontWeight: 500 }}>The task will appear on the board only after approval.</AntText>
          </AntText>
          <Button type="primary" block onClick={onClose}>Done</Button>
        </div>
      ) : (
        <Space direction="vertical" style={{ width: '100%' }} size={14}>
          {err && <AntText type="danger" style={{ fontSize: 12 }}>{err}</AntText>}
          <div>
            <AntText strong style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>Task Title <AntText type="danger">*</AntText></AntText>
            <Input autoFocus value={form.title} onChange={e => set('title', e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit()}
              placeholder="e.g. Design packaging label" />
          </div>
          <div>
            <AntText strong style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>Description</AntText>
            <TextArea value={form.description} onChange={e => set('description', e.target.value)}
              placeholder="Task details and instructions…" rows={2} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <AntText strong style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>Department <AntText type="danger">*</AntText></AntText>
              <Select
                style={{ width: '100%' }} value={form.department || undefined} placeholder="— Select —"
                onChange={v => { set('department', v); set('assignedTo', ''); }} options={DEPT_NAMES.map(d => ({ label: d, value: d }))}
              />
            </div>
            <div>
              <AntText strong style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>Member</AntText>
              <Select
                style={{ width: '100%' }} value={form.assignedTo || undefined} placeholder="— Unassigned —" disabled={!form.department}
                onChange={v => set('assignedTo', v)}
                options={members.map(m => ({ label: `${m.firstName} ${m.lastName}${m.role === 'manager' ? ' (Manager)' : m.role === 'team_lead' ? ' (Lead)' : ''}`, value: m._id }))}
              />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <AntText strong style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>Priority</AntText>
              <Select style={{ width: '100%' }} value={form.priority} onChange={v => set('priority', v)}
                options={PRIORITY_OPTS.map(p => ({ label: p, value: p }))} />
            </div>
            <div>
              <AntText strong style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>Due Date</AntText>
              <Input type="date" value={form.dueDate} onChange={e => set('dueDate', e.target.value)} />
            </div>
          </div>
        </Space>
      )}
    </Drawer>
  );
}

// ── Import Modal ──────────────────────────────────────────────────────────────

function ImportModal({ onClose, onImported }) {
  const { user } = useAuthStore();
  const [file,        setFile]        = useState(null);
  const [dragging,    setDragging]    = useState(false);
  const [importing,   setImporting]   = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [result,      setResult]      = useState(null); // { summary, results }
  const [err,         setErr]         = useState('');

  const handleFile = (f) => {
    if (!f) return;
    const ext = f.name.split('.').pop().toLowerCase();
    if (!['xlsx', 'csv'].includes(ext)) { setErr('Only .xlsx and .csv files are accepted.'); return; }
    setFile(f); setErr(''); setResult(null);
  };

  const onDrop = (e) => {
    e.preventDefault(); setDragging(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const downloadTemplate = async () => {
    setDownloading(true);
    try {
      const token = useAuthStore.getState().token;
      const res = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}/tasks/import/template`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = 'backero-task-import-template.xlsx';
      a.click(); URL.revokeObjectURL(url);
    } catch (e) {
      setErr('Failed to download template. Try again.');
    } finally { setDownloading(false); }
  };

  const submit = async () => {
    if (!file) return;
    setImporting(true); setErr('');
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await api.post('/tasks/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setResult(res.data?.data || res.data);
      onImported?.();
    } catch (e) {
      setErr(e?.response?.data?.message || 'Import failed. Check the file and try again.');
    } finally { setImporting(false); }
  };

  const statusLabel = { created: 'Created', pending_hub_approval: 'Pending Hub Approval', pending_assignment: 'Pending Assignment', failed: 'Failed' };
  const statusColor = { created: 'text-green-600 bg-green-50', pending_hub_approval: 'text-amber-600 bg-amber-50', pending_assignment: 'text-blue-600 bg-blue-50', failed: 'text-red-600 bg-red-50' };

  return (
    <Drawer
      open onClose={onClose} width={520} closeIcon={<X size={18} />}
      title={
        <Space direction="vertical" size={0}>
          <span>Bulk Task Import</span>
          <AntText type="secondary" style={{ fontSize: 11, fontWeight: 400 }}>Upload .xlsx or .csv — max 200 rows</AntText>
        </Space>
      }
      footer={
        result ? (
          <Button type="primary" block onClick={onClose}>Done</Button>
        ) : (
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button onClick={onClose}>Cancel</Button>
            <Button type="primary" loading={importing} disabled={!file || importing} onClick={submit} icon={<UploadCloud size={14} />}>
              Import Tasks
            </Button>
          </Space>
        )
      }
    >
        <div className="space-y-4">

          {/* Download template */}
          <div className="flex items-center justify-between bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3">
            <div>
              <p className="text-xs font-bold text-indigo-800">Step 1 — Download Template</p>
              <p className="text-[10px] text-indigo-500 mt-0.5">Fill in the template then upload it below</p>
            </div>
            <button
              onClick={downloadTemplate}
              disabled={downloading}
              className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-50 flex-shrink-0">
              {downloading
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <FileDown className="w-3.5 h-3.5" />}
              {downloading ? 'Downloading…' : 'Download Template'}
            </button>
          </div>

          {/* File drop zone */}
          {!result && (
            <div>
              <p className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-2">Step 2 — Upload Filled File</p>
              <div
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                onClick={() => document.getElementById('import-file-input').click()}
                className={clsx(
                  'border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer transition-colors',
                  dragging ? 'border-indigo-400 bg-indigo-50' : file ? 'border-green-300 bg-green-50' : 'border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/40'
                )}>
                <input
                  id="import-file-input"
                  type="file"
                  accept=".xlsx,.csv"
                  className="hidden"
                  onChange={e => handleFile(e.target.files[0])}
                />
                {file ? (
                  <>
                    <CheckCircle2 className="w-8 h-8 text-green-500 mb-2" />
                    <p className="text-sm font-bold text-green-700">{file.name}</p>
                    <p className="text-[10px] text-green-500 mt-1">{(file.size / 1024).toFixed(1)} KB — click to change</p>
                  </>
                ) : (
                  <>
                    <UploadCloud className="w-8 h-8 text-gray-300 mb-2" />
                    <p className="text-sm font-semibold text-gray-500">Drag & drop or click to browse</p>
                    <p className="text-[10px] text-gray-400 mt-1">.xlsx or .csv accepted</p>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Rules reminder */}
          {!result && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 space-y-1.5">
              <p className="text-[10px] font-bold text-gray-600 uppercase tracking-wide">How approvals work</p>
              <div className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 flex-shrink-0" />
                <p className="text-[10px] text-gray-500"><span className="font-semibold text-amber-700">isDeptHub = true</span> by a Manager → Admin approval required</p>
              </div>
              <div className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 flex-shrink-0" />
                <p className="text-[10px] text-gray-500"><span className="font-semibold text-blue-700">Manager → another Manager</span> assignment → Admin approval required</p>
              </div>
              <div className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 mt-1.5 flex-shrink-0" />
                <p className="text-[10px] text-gray-500">All other tasks → Created immediately</p>
              </div>
            </div>
          )}

          {/* Error */}
          {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-xl">{err}</p>}

          {/* Results */}
          {result && (
            <div className="space-y-4">
              {/* Summary cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-green-50 border border-green-200 rounded-xl px-3 py-3 text-center">
                  <p className="text-xl font-black text-green-700">{result.summary?.imported ?? 0}</p>
                  <p className="text-[10px] font-semibold text-green-600 mt-0.5">Created</p>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-3 text-center">
                  <p className="text-xl font-black text-amber-700">{result.summary?.pendingApproval ?? 0}</p>
                  <p className="text-[10px] font-semibold text-amber-600 mt-0.5">Pending Approval</p>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-3 text-center">
                  <p className="text-xl font-black text-red-700">{result.summary?.failed ?? 0}</p>
                  <p className="text-[10px] font-semibold text-red-600 mt-0.5">Failed</p>
                </div>
              </div>

              {/* Row-by-row results */}
              <div className="border border-gray-200 dark:border-[#1b2e4a] rounded-xl overflow-hidden">
                <div className="bg-gray-50 dark:bg-[#0f1a2e] px-4 py-2 border-b border-gray-200 dark:border-[#1b2e4a]">
                  <p className="text-xs font-bold text-gray-600 dark:text-gray-300">Row Details ({result.results?.length} rows)</p>
                </div>
                <div className="max-h-52 overflow-y-auto divide-y divide-gray-100 dark:divide-[#1b2e4a]">
                  {(result.results || []).map((r, i) => (
                    <div key={i} className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[10px] text-gray-400 font-mono flex-shrink-0">#{r.row}</span>
                        <p className="text-xs text-gray-700 dark:text-gray-300 truncate font-medium">{r.title}</p>
                        {r.pendingAssignee && (
                          <span className="text-[10px] text-blue-500 flex-shrink-0">→ {r.pendingAssignee}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={clsx('text-[10px] font-bold px-2 py-0.5 rounded-full', statusColor[r.status] || 'bg-gray-100 text-gray-500')}>
                          {statusLabel[r.status] || r.status}
                        </span>
                        {r.reason && <span className="text-[10px] text-red-400 max-w-[120px] truncate" title={r.reason}>{r.reason}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
    </Drawer>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function WorkflowLanding() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const { socket } = useSocketStore();

  const userLevel = ROLE_LEVEL[user?.role] || 1;
  const isAdmin = userLevel >= 4;
  const isManagerOrAbove = userLevel >= 3;

  // Pre-fill from lead conversion (navigate from LeadDetails with state.fromLead)
  const fromLead = location.state?.fromLead || null;

  const [showCreate,    setShowCreate]    = useState(false); // legacy, keep for safety
  const [showDeptHub,   setShowDeptHub]   = useState(!!fromLead); // auto-open if from lead
  const [leadPrefill,   setLeadPrefill]   = useState(fromLead ? { ...fromLead, leadId: fromLead.id } : null);
  const [showIndividual,setShowIndividual]= useState(false);
  const [showImport,    setShowImport]    = useState(false);
  const [newTaskOpen,   setNewTaskOpen]   = useState(false);
  const [statusFilter,  setStatusFilter]  = useState('');
  const [search,        setSearch]        = useState('');
  const [confirmDelAll, setConfirmDelAll] = useState(false);
  const [deletingAll,   setDeletingAll]   = useState(false);
  const [showArchived,  setShowArchived]  = useState(false);

  const handleDeleteAll = async () => {
    setDeletingAll(true);
    try {
      const res = await api.get('/tasks', { params: { limit: 200, rootOnly: 'true' } });
      const roots = res.data?.data?.data || res.data?.data || [];
      await Promise.all(roots.map(t => api.delete(`/tasks/${t._id}`).catch(() => {})));
      qc.invalidateQueries({ queryKey: ['tasks', 'workflow-board'] });
      setConfirmDelAll(false);
    } catch (e) {
      console.error(e);
    } finally { setDeletingAll(false); }
  };

  // Clear router state so refresh doesn't re-open the modal
  useEffect(() => {
    if (fromLead) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Real-time: refresh board when any task changes
  const refreshBoard = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['tasks', 'workflow-board'] });
  }, [qc]);

  useEffect(() => {
    if (!socket) return;
    socket.on('task_created', refreshBoard);
    socket.on('task_updated', refreshBoard);
    socket.on('task_reopened', refreshBoard);
    return () => {
      socket.off('task_created', refreshBoard);
      socket.off('task_updated', refreshBoard);
      socket.off('task_reopened', refreshBoard);
    };
  }, [socket, refreshBoard]);

  const [rejectModal, setRejectModal] = useState(null); // { taskId, title }
  const [rejectNote,  setRejectNote]  = useState('');
  const [hubBusy,     setHubBusy]     = useState(null); // taskId being processed

  const { data: pendingHubsData, refetch: refetchPendingHubs } = useQuery({
    queryKey: ['pending-hubs'],
    queryFn: () => api.get('/tasks', { params: { pendingHubApproval: 'true', limit: 50 } }).then(r => r.data),
    enabled: isAdmin,
    refetchInterval: 60 * 1000,
  });
  const pendingHubs = pendingHubsData?.data?.data || pendingHubsData?.data || [];

  const { data: pendingAssignData, refetch: refetchPendingAssign } = useQuery({
    queryKey: ['pending-manager-assignments'],
    queryFn: () => api.get('/tasks', { params: { pendingManagerAssignment: 'true', limit: 50 } }).then(r => r.data),
    enabled: isAdmin,
    refetchInterval: 60 * 1000,
  });
  const pendingAssignments = pendingAssignData?.data?.data || pendingAssignData?.data || [];

  const [assignRejectModal, setAssignRejectModal] = useState(null);
  const [assignRejectNote, setAssignRejectNote]   = useState('');
  const [assignBusy, setAssignBusy] = useState(null);

  const handleAssignApprove = async (taskId) => {
    setAssignBusy(taskId);
    try {
      await api.post(`/tasks/${taskId}/manager-assign-approve`);
      refetchPendingAssign();
      qc.invalidateQueries({ queryKey: ['tasks', 'workflow-board'] });
    } catch (e) { console.error(e); }
    finally { setAssignBusy(null); }
  };

  const handleAssignReject = async () => {
    if (!assignRejectModal) return;
    setAssignBusy(assignRejectModal.taskId);
    try {
      await api.post(`/tasks/${assignRejectModal.taskId}/manager-assign-reject`, { notes: assignRejectNote });
      setAssignRejectModal(null); setAssignRejectNote('');
      refetchPendingAssign();
    } catch (e) { console.error(e); }
    finally { setAssignBusy(null); }
  };

  const handleHubApprove = async (taskId) => {
    setHubBusy(taskId);
    try {
      await api.post(`/tasks/${taskId}/hub-approve`);
      refetchPendingHubs();
      qc.invalidateQueries({ queryKey: ['tasks', 'workflow-board'] });
    } catch (e) { console.error(e); }
    finally { setHubBusy(null); }
  };

  const handleHubReject = async () => {
    if (!rejectModal) return;
    setHubBusy(rejectModal.taskId);
    try {
      await api.post(`/tasks/${rejectModal.taskId}/hub-reject`, { notes: rejectNote });
      setRejectModal(null); setRejectNote('');
      refetchPendingHubs();
    } catch (e) { console.error(e); }
    finally { setHubBusy(null); }
  };

  const handleDeleteTask = async (taskId, title) => {
    try {
      await api.delete(`/tasks/${taskId}`);
      qc.invalidateQueries({ queryKey: ['tasks', 'workflow-board'] });
    } catch (e) { console.error('Delete failed', e); }
  };

  const params = { limit: 200 };
  if (statusFilter) params.status = statusFilter;
  if (showArchived) params.archived = 'true';

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['tasks', 'workflow-board', params],
    queryFn: () => api.get('/tasks', { params }).then(r => r.data),
    refetchInterval: 5 * 60 * 1000,
  });

  // All fetched tasks — build id→task map for dedup
  const rawTasks = data?.data || [];
  const taskIdSet = new Set(rawTasks.map(t => t._id));
  const taskMap   = new Map(rawTasks.map(t => [t._id, t]));

  // Show a task in the board if:
  // 1. It has no parent (root task), OR
  // 2. Its parent is NOT in the fetched result set (parent hidden by role filter), OR
  // 3. Its parent is in a DIFFERENT department column (cross-dept task — e.g. Production
  //    task whose root parent lives in the Management column should still show in Production).
  // Hide only when the parent is in the SAME department (avoids double-rendering subtasks).
  const allTasks = rawTasks.filter(t => {
    const parentId = t.parentTask?._id || t.parentTask;
    const passesSearch = !search || t.title.toLowerCase().includes(search.toLowerCase());
    if (!passesSearch) return false;
    if (!parentId) return true;                        // root task — always show
    if (!taskIdSet.has(parentId)) return true;         // parent not fetched — show
    const parent = taskMap.get(parentId);
    if (parent && parent.department !== t.department) return true; // cross-dept — show
    return false;                                      // same-dept child — hide (shown inside card)
  });

  const visibleDepts = ALL_DEPTS; // managers and above see all dept columns

  const tasksByDept = {};
  visibleDepts.forEach(d => { tasksByDept[d] = []; });
  allTasks.forEach(t => {
    if (tasksByDept[t.department] !== undefined) tasksByDept[t.department].push(t);
  });

  const totalTasks      = allTasks.length;
  const completedCount  = allTasks.filter(t => t.status === 'Completed' || t.status === 'Achieved').length;
  const inProgressCount = allTasks.filter(t => t.status === 'In Progress').length;
  const pendingApproval = allTasks.filter(t => t.status === 'Approval Pending').length;
  const overdueCount    = allTasks.filter(t => t.dueDate && isPast(new Date(t.dueDate)) && t.status !== 'Completed' && t.status !== 'Achieved').length;

  return (
    <div className="space-y-5">

      {/* ── Archived mode banner ── */}
      {showArchived && (
        <div className="flex items-center gap-3 px-4 py-3 bg-indigo-50 border border-indigo-200 rounded-2xl">
          <Archive className="w-4 h-4 text-indigo-500 flex-shrink-0" />
          <p className="text-xs font-semibold text-indigo-700 flex-1">Showing archived (completed) tasks. Active tasks are hidden.</p>
          <button onClick={() => setShowArchived(false)} className="text-xs text-indigo-500 hover:text-indigo-700 font-semibold">
            Back to Active
          </button>
        </div>
      )}

      {/* ── Page header ── */}
      <div className="bg-white dark:bg-[#070c17] rounded-2xl border border-gray-200 dark:border-[#1b2e4a] shadow-sm px-6 py-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">

          {/* Title */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center shadow-sm flex-shrink-0">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900 dark:text-white leading-tight">Workflow Board</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                All departments · {totalTasks} main task{totalTasks !== 1 ? 's' : ''}
              </p>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-gray-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search tasks…"
                className="pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 w-40 bg-gray-50 dark:bg-[#0f1a2e] dark:border-[#1b2e4a]"
              />
            </div>

            {/* Status filter */}
            <div className="relative">
              <Filter className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="pl-8 pr-8 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 bg-gray-50 dark:bg-[#0f1a2e] dark:border-[#1b2e4a] text-gray-700 dark:text-gray-300"
              >
                <option value="">All Status</option>
                {['Pending','Assigned','In Progress','Approval Pending','Changes Requested','Completed','Reopened'].map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            {/* Archived toggle — manager/admin only */}
            {isManagerOrAbove && (
              <button
                onClick={() => setShowArchived(p => !p)}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-2 border text-sm font-semibold rounded-xl transition-colors',
                  showArchived
                    ? 'bg-indigo-600 border-indigo-600 text-white'
                    : 'border-gray-200 text-gray-500 hover:bg-gray-50',
                )}
              >
                <Archive className="w-4 h-4" />
                {showArchived ? 'Archived' : 'Archived'}
              </button>
            )}

            {/* Delete All — admin only */}
            {isAdmin && (
              confirmDelAll ? (
                <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-xl px-3 py-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                  <span className="text-xs text-red-600 font-semibold whitespace-nowrap">Delete all tasks?</span>
                  <button onClick={handleDeleteAll} disabled={deletingAll}
                    className="text-xs px-2.5 py-1 rounded-lg bg-red-500 hover:bg-red-600 text-white font-bold disabled:opacity-50">
                    {deletingAll ? '…' : 'Yes, Delete All'}
                  </button>
                  <button onClick={() => setConfirmDelAll(false)}
                    className="text-xs px-2 py-1 rounded-lg bg-white border border-gray-200 text-gray-500 hover:bg-gray-50">
                    Cancel
                  </button>
                </div>
              ) : (
                <button onClick={() => setConfirmDelAll(true)}
                  className="flex items-center gap-1.5 px-3 py-2 border border-red-200 hover:bg-red-50 text-red-400 hover:text-red-600 text-sm font-semibold rounded-xl transition-colors">
                  <Trash2 className="w-4 h-4" /> Delete All
                </button>
              )
            )}

            {/* New Task — split dropdown */}
            {isManagerOrAbove && (
              <div className="relative">
                <button onClick={() => setNewTaskOpen(p => !p)}
                  onBlur={() => setTimeout(() => setNewTaskOpen(false), 150)}
                  className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm">
                  <Plus className="w-4 h-4" /> New Task <ChevronDown className={clsx('w-3.5 h-3.5 transition-transform', newTaskOpen && 'rotate-180')} />
                </button>
                {newTaskOpen && (
                  <div className="absolute right-0 top-full mt-2 z-50 bg-white dark:bg-[#0f1a2e] rounded-2xl shadow-2xl border border-gray-200 dark:border-[#1b2e4a] overflow-hidden w-56">
                    <button onMouseDown={() => { setShowDeptHub(true); setNewTaskOpen(false); }}
                      className="w-full flex items-start gap-3 px-4 py-3.5 hover:bg-gray-50 dark:hover:bg-[#132035] transition-colors border-b border-gray-100 dark:border-[#1b2e4a]">
                      <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Sparkles className="w-4 h-4 text-white" />
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-bold text-gray-900 dark:text-white">Dept Hub</p>
                        <p className="text-[10px] text-gray-400 leading-snug">Cross-department project</p>
                      </div>
                    </button>
                    <button onMouseDown={() => { setShowIndividual(true); setNewTaskOpen(false); }}
                      className="w-full flex items-start gap-3 px-4 py-3.5 hover:bg-gray-50 dark:hover:bg-[#132035] transition-colors border-b border-gray-100 dark:border-[#1b2e4a]">
                      <div className="w-8 h-8 rounded-xl bg-green-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <UserCircle className="w-4 h-4 text-white" />
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-bold text-gray-900 dark:text-white">Individual</p>
                        <p className="text-[10px] text-gray-400 leading-snug">Assign to a member</p>
                      </div>
                    </button>
                    <button onMouseDown={() => { setShowImport(true); setNewTaskOpen(false); }}
                      className="w-full flex items-start gap-3 px-4 py-3.5 hover:bg-gray-50 dark:hover:bg-[#132035] transition-colors">
                      <div className="w-8 h-8 rounded-xl bg-indigo-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <UploadCloud className="w-4 h-4 text-white" />
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-bold text-gray-900 dark:text-white">Import</p>
                        <p className="text-[10px] text-gray-400 leading-snug">Bulk import from Excel / CSV</p>
                      </div>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Stats row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total Tasks"      value={totalTasks}      color="bg-brand-600"   icon={<ClipboardList className="w-4 h-4" />} />
        <StatCard label="In Progress"      value={inProgressCount} color="bg-yellow-500"  icon={<RefreshCw className="w-4 h-4" />} />
        <StatCard label="Completed"        value={completedCount}  color="bg-green-500"   icon={<CheckCircle2 className="w-4 h-4" />} />
        <StatCard label="Pending Approval" value={pendingApproval} color="bg-indigo-500"  icon={<Clock className="w-4 h-4" />} />
        {overdueCount > 0 && (
          <StatCard label="Overdue"        value={overdueCount}    color="bg-red-500"     icon={<AlertTriangle className="w-4 h-4" />} />
        )}
      </div>

      {/* ── Pending Dept Hub Approvals (admin only) ── */}
      {isAdmin && pendingHubs.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-amber-400 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-amber-800">Pending Dept Hub Approvals</h3>
              <p className="text-[10px] text-amber-600">{pendingHubs.length} request{pendingHubs.length !== 1 ? 's' : ''} waiting for your review</p>
            </div>
          </div>
          <div className="space-y-2">
            {pendingHubs.map(hub => (
              <div key={hub._id} className="bg-white rounded-xl border border-amber-200 px-4 py-3 flex items-center justify-between gap-3 flex-wrap shadow-sm">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">{hub.title}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    By {hub.assignedBy?.firstName} {hub.assignedBy?.lastName}
                    {hub.dueDate ? ` · Due ${format(new Date(hub.dueDate), 'dd MMM yyyy')}` : ''}
                    {' · '}<span className={clsx('font-semibold capitalize', hub.priority === 'critical' || hub.priority === 'urgent' ? 'text-red-500' : hub.priority === 'high' ? 'text-orange-500' : 'text-gray-500')}>{hub.priority}</span>
                  </p>
                  {hub.description && <p className="text-[10px] text-gray-500 mt-0.5 line-clamp-1">{hub.description}</p>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleHubApprove(hub._id)}
                    disabled={!!hubBusy}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors">
                    {hubBusy === hub._id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CircleCheck className="w-3.5 h-3.5" />} Approve
                  </button>
                  <button
                    onClick={() => { setRejectModal({ taskId: hub._id, title: hub.title }); setRejectNote(''); }}
                    disabled={!!hubBusy}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-red-50 border border-red-200 text-red-500 hover:text-red-600 text-xs font-bold rounded-lg transition-colors disabled:opacity-50">
                    <XCircle className="w-3.5 h-3.5" /> Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Pending Manager Assignments (admin only) ── */}
      {isAdmin && pendingAssignments.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-500 flex items-center justify-center flex-shrink-0">
              <UserCircle className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-blue-800">Pending Manager Assignments</h3>
              <p className="text-[10px] text-blue-600">{pendingAssignments.length} cross-manager assignment{pendingAssignments.length !== 1 ? 's' : ''} need your approval</p>
            </div>
          </div>
          <div className="space-y-2">
            {pendingAssignments.map(task => {
              const pm = task.pendingManagerAssignment || {};
              return (
                <div key={task._id} className="bg-white rounded-xl border border-blue-200 px-4 py-3 flex items-center justify-between gap-3 flex-wrap shadow-sm">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900 truncate">{task.title}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      <span className="font-semibold text-gray-600">{task.assignedBy?.firstName} {task.assignedBy?.lastName}</span>
                      {' → '}
                      <span className="font-semibold text-blue-600">{pm.pendingAssignee?.firstName || '—'} {pm.pendingAssignee?.lastName || ''}</span>
                      {pm.pendingAssignee?.department && <span className="ml-1 text-gray-400">({pm.pendingAssignee.department})</span>}
                      {task.dueDate ? ` · Due ${format(new Date(task.dueDate), 'dd MMM')}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleAssignApprove(task._id)}
                      disabled={!!assignBusy}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors">
                      {assignBusy === task._id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CircleCheck className="w-3.5 h-3.5" />} Approve
                    </button>
                    <button
                      onClick={() => { setAssignRejectModal({ taskId: task._id, title: task.title }); setAssignRejectNote(''); }}
                      disabled={!!assignBusy}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-red-50 border border-red-200 text-red-500 hover:text-red-600 text-xs font-bold rounded-lg transition-colors disabled:opacity-50">
                      <XCircle className="w-3.5 h-3.5" /> Reject
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Reject assignment modal ── */}
      <Modal
        title="Reject Assignment"
        open={!!assignRejectModal}
        onCancel={() => setAssignRejectModal(null)}
        footer={
          <Space>
            <Button onClick={() => setAssignRejectModal(null)}>Cancel</Button>
            <Button danger type="primary" loading={!!assignBusy} onClick={handleAssignReject}>Reject</Button>
          </Space>
        }
      >
        {assignRejectModal && (
          <>
            <AntText type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 12 }}>
              Rejecting assignment for <AntText strong>"{assignRejectModal.title}"</AntText>. The requesting manager will be notified.
            </AntText>
            <AntText strong style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>Reason (optional)</AntText>
            <TextArea
              value={assignRejectNote}
              onChange={e => setAssignRejectNote(e.target.value)}
              placeholder="Why is this assignment not approved?"
              rows={3}
            />
          </>
        )}
      </Modal>

      {/* ── Reject hub modal ── */}
      <Modal
        title="Reject Dept Hub"
        open={!!rejectModal}
        onCancel={() => setRejectModal(null)}
        footer={
          <Space>
            <Button onClick={() => setRejectModal(null)}>Cancel</Button>
            <Button danger type="primary" loading={!!hubBusy} onClick={handleHubReject}>Reject Hub</Button>
          </Space>
        }
      >
        {rejectModal && (
          <>
            <AntText type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 12 }}>
              Rejecting <AntText strong>"{rejectModal.title}"</AntText>. The manager will be notified.
            </AntText>
            <AntText strong style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>Reason (optional)</AntText>
            <TextArea
              value={rejectNote}
              onChange={e => setRejectNote(e.target.value)}
              placeholder="Tell the manager why this hub was rejected…"
              rows={3}
            />
          </>
        )}
      </Modal>

      {/* ── Board ── */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="w-10 h-10 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-500">Loading board…</p>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-4" style={{ minWidth: `${visibleDepts.length * 300}px` }}>
            {visibleDepts.map(dept => (
              <DeptColumn
                key={dept}
                dept={dept}
                tasks={tasksByDept[dept] || []}
                colors={DEPT_COLORS[dept] || DEPT_COLORS.Management}
                canDelete={isManagerOrAbove}
                onDelete={handleDeleteTask}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Dept Hub modal ── */}
      {showDeptHub && (
        <DeptHubModal
          prefill={leadPrefill}
          onClose={() => { setShowDeptHub(false); setLeadPrefill(null); }}
          onCreated={(id) => {
            setShowDeptHub(false);
            setLeadPrefill(null);
            refetch();
            qc.invalidateQueries({ queryKey: ['tasks'] });
            qc.invalidateQueries({ queryKey: ['crm'] });
            if (id) {
              navigate(`/workflow/${id}`);
            }
          }}
        />
      )}

      {/* ── Individual task modal ── */}
      {showIndividual && (
        <IndividualModal
          onClose={() => setShowIndividual(false)}
          onCreated={() => {
            setShowIndividual(false);
            refetch();
            qc.invalidateQueries({ queryKey: ['tasks'] });
          }}
        />
      )}

      {/* ── Create task modal (legacy) ── */}
      {showCreate && (
        <CreateTaskModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { refetch(); qc.invalidateQueries({ queryKey: ['tasks'] }); }}
        />
      )}

      {/* ── Import modal ── */}
      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onImported={() => {
            qc.invalidateQueries({ queryKey: ['tasks'] });
            qc.invalidateQueries({ queryKey: ['pending-hubs'] });
            qc.invalidateQueries({ queryKey: ['pending-manager-assignments'] });
            refetch();
          }}
        />
      )}
    </div>
  );
}
