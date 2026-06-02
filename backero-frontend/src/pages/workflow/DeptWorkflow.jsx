import React, { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useSearchParams } from 'react-router-dom';
import api from '../../api/axios';
import { usePermissions } from '../../store/usePermissions';
import { format, isPast } from 'date-fns';
import { clsx } from 'clsx';
import {
  ChevronDownIcon, ChevronRightIcon, PlusIcon, XMarkIcon,
  ArrowPathIcon, TrashIcon, CheckIcon, UserCircleIcon, ExclamationTriangleIcon,
  PaperAirplaneIcon, MegaphoneIcon, BuildingStorefrontIcon,
  ShoppingBagIcon, BeakerIcon, WrenchScrewdriverIcon,
  UserGroupIcon, BanknotesIcon, BoltIcon, CogIcon,
  ChartBarIcon, SparklesIcon,
} from '@heroicons/react/24/outline';
import { CheckCircleIcon } from '@heroicons/react/24/solid';

// ─── Dept config ──────────────────────────────────────────────────────────────
const DEPT_CONFIG = {
  'Marketing':          { icon: MegaphoneIcon,          color: 'bg-purple-500', border: 'border-purple-200', light: 'bg-purple-50',  text: 'text-purple-700',  bar: 'bg-purple-400',  tag: 'bg-purple-100 text-purple-700'  },
  'Marketplace':        { icon: BuildingStorefrontIcon, color: 'bg-orange-500', border: 'border-orange-200', light: 'bg-orange-50',  text: 'text-orange-700',  bar: 'bg-orange-400',  tag: 'bg-orange-100 text-orange-700'  },
  'Sales':              { icon: ShoppingBagIcon,        color: 'bg-green-500',  border: 'border-green-200',  light: 'bg-green-50',   text: 'text-green-700',   bar: 'bg-green-400',   tag: 'bg-green-100 text-green-700'    },
  'Production':         { icon: BoltIcon,               color: 'bg-blue-500',   border: 'border-blue-200',   light: 'bg-blue-50',    text: 'text-blue-700',    bar: 'bg-blue-400',    tag: 'bg-blue-100 text-blue-700'      },
  'R&D':                { icon: BeakerIcon,             color: 'bg-cyan-500',   border: 'border-cyan-200',   light: 'bg-cyan-50',    text: 'text-cyan-700',    bar: 'bg-cyan-400',    tag: 'bg-cyan-100 text-cyan-700'      },
  'Operations':         { icon: WrenchScrewdriverIcon,  color: 'bg-indigo-500', border: 'border-indigo-200', light: 'bg-indigo-50',  text: 'text-indigo-700',  bar: 'bg-indigo-400',  tag: 'bg-indigo-100 text-indigo-700'  },
  'Accounts & Finance': { icon: BanknotesIcon,          color: 'bg-yellow-500', border: 'border-yellow-200', light: 'bg-yellow-50',  text: 'text-yellow-700',  bar: 'bg-yellow-400',  tag: 'bg-yellow-100 text-yellow-700'  },
  'HR':                 { icon: UserGroupIcon,          color: 'bg-pink-500',   border: 'border-pink-200',   light: 'bg-pink-50',    text: 'text-pink-700',    bar: 'bg-pink-400',    tag: 'bg-pink-100 text-pink-700'      },
  'Management':         { icon: CogIcon,                color: 'bg-slate-500',  border: 'border-slate-200',  light: 'bg-slate-50',   text: 'text-slate-700',   bar: 'bg-slate-400',   tag: 'bg-slate-100 text-slate-700'    },
};
const DEPT_NAMES = Object.keys(DEPT_CONFIG);
const deptCfg = (d) => DEPT_CONFIG[d] || { icon: CogIcon, color: 'bg-gray-400', border: 'border-gray-200', light: 'bg-gray-50', text: 'text-gray-600', bar: 'bg-gray-400', tag: 'bg-gray-100 text-gray-600' };

const STATUS_DOT = {
  'Completed':        'bg-green-500',
  'In Progress':      'bg-blue-500',
  'Assigned':         'bg-indigo-400',
  'Pending':          'bg-gray-300',
  'Overdue':          'bg-red-500',
  'Approval Pending': 'bg-purple-400',
  'Under Review':     'bg-cyan-400',
};
const STATUS_BADGE = {
  'Completed':        'bg-green-100 text-green-700',
  'In Progress':      'bg-blue-100 text-blue-700',
  'Assigned':         'bg-indigo-100 text-indigo-700',
  'Pending':          'bg-gray-100 text-gray-500',
  'Overdue':          'bg-red-100 text-red-700',
  'Approval Pending': 'bg-purple-100 text-purple-700',
  'Under Review':     'bg-cyan-100 text-cyan-700',
};
const STATUSES = ['Pending', 'Assigned', 'In Progress', 'Under Review', 'Completed'];
const PRIORITY_CLS = {
  critical: 'bg-red-100 text-red-700',
  urgent:   'bg-orange-100 text-orange-700',
  high:     'bg-yellow-100 text-yellow-700',
  medium:   'bg-green-100 text-green-700',
  low:      'bg-gray-100 text-gray-500',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const calcProgress = (task) => {
  const subs = task.subTasks || [];
  if (!subs.length) return { done: task.status === 'Completed' ? 1 : 0, total: 1 };
  const c = subs.map(calcProgress);
  return { done: c.reduce((s, x) => s + x.done, 0), total: c.reduce((s, x) => s + x.total, 0) };
};
const pct = (p) => (p.total === 0 ? 0 : Math.round((p.done / p.total) * 100));
const uid = () => Math.random().toString(36).slice(2);

// ─── Ring ─────────────────────────────────────────────────────────────────────
function Ring({ value, size = 44, stroke = 4, color }) {
  const r = (size - stroke * 2) / 2;
  const circ = 2 * Math.PI * r;
  return (
    <div className="relative flex items-center justify-center flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90 absolute inset-0">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color || '#6366f1'} strokeWidth={stroke}
          strokeDasharray={circ} strokeDashoffset={circ - (value / 100) * circ}
          strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
      </svg>
      <span className="text-[10px] font-bold text-gray-700 dark:text-gray-200 z-10">{value}%</span>
    </div>
  );
}

// ─── Bar ──────────────────────────────────────────────────────────────────────
function Bar({ value, cls, h = 'h-1.5' }) {
  return (
    <div className={clsx('w-full bg-gray-100 rounded-full overflow-hidden', h)}>
      <div className={clsx('h-full rounded-full transition-all duration-500', cls || 'bg-brand-500')} style={{ width: `${Math.min(value, 100)}%` }} />
    </div>
  );
}

// ─── Avatar initials ──────────────────────────────────────────────────────────
function Av({ user, sm }) {
  if (!user) return null;
  const s = sm ? 'w-5 h-5 text-[9px]' : 'w-6 h-6 text-[10px]';
  return (
    <span className={clsx('rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-bold flex-shrink-0 ring-1 ring-white', s)}>
      {user.firstName?.[0]}{user.lastName?.[0]}
    </span>
  );
}

// ─── Status picker ────────────────────────────────────────────────────────────
function StatusPill({ task, editable, onChange }) {
  const [open, setOpen] = useState(false);
  const key = task.isOverdue ? 'Overdue' : task.status;
  return (
    <div className="relative">
      <button onClick={e => { e.stopPropagation(); if (editable) setOpen(p => !p); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className={clsx('text-[10px] px-2 py-0.5 rounded-full font-semibold', STATUS_BADGE[key] || STATUS_BADGE['Pending'], editable && 'cursor-pointer hover:opacity-80')}>
        {key}{editable && ' ▾'}
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-white dark:bg-[#0f1a2e] rounded-xl border border-gray-100 shadow-xl py-1 min-w-[148px]">
          {STATUSES.map(s => (
            <button key={s} onMouseDown={e => { e.preventDefault(); onChange(task._id, s); setOpen(false); }}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 flex items-center gap-2">
              <span className={clsx('w-2 h-2 rounded-full flex-shrink-0', STATUS_DOT[s])} />
              <span className={task.status === s ? 'font-bold text-brand-600' : 'text-gray-700'}>{s}</span>
              {task.status === s && <CheckIcon className="w-3 h-3 ml-auto text-brand-500" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Inline add ───────────────────────────────────────────────────────────────
function QuickAdd({ placeholder, onSave, onCancel }) {
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!title.trim()) return;
    setBusy(true);
    try { await onSave(title.trim(), due || undefined); } finally { setBusy(false); }
  };
  return (
    <div className="rounded-xl border border-dashed border-brand-300 bg-brand-50 dark:bg-brand-900/10 p-2.5 space-y-2" onClick={e => e.stopPropagation()}>
      <input autoFocus value={title} onChange={e => setTitle(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') onCancel(); }}
        placeholder={placeholder || 'Title…'}
        className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-400" />
      <input type="date" value={due} onChange={e => setDue(e.target.value)}
        className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-400" />
      <div className="flex gap-2">
        <button onMouseDown={save} disabled={busy || !title.trim()}
          className="flex-1 text-xs py-1.5 rounded-lg bg-brand-600 text-white font-semibold disabled:opacity-40 hover:bg-brand-700">{busy ? '…' : 'Add'}</button>
        <button onMouseDown={onCancel} className="px-3 text-xs rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200">Cancel</button>
      </div>
    </div>
  );
}

// ─── Confirm delete mini-inline ───────────────────────────────────────────────
function DelConfirm({ onConfirm, onCancel }) {
  return (
    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
      <button onMouseDown={onConfirm} className="text-[9px] px-1.5 py-0.5 rounded bg-red-500 text-white font-bold">Del</button>
      <button onMouseDown={onCancel}  className="text-[9px] px-1.5 py-0.5 rounded bg-gray-200 text-gray-600">No</button>
    </div>
  );
}

// ─── Sub-subtask row (depth ≥ 2) ──────────────────────────────────────────────
function SubRow({ task, depth, dept, editable, onStatus, onAddSub, onDelete }) {
  const [open,  setOpen]  = useState(false);
  const [add,   setAdd]   = useState(false);
  const [del,   setDel]   = useState(false);
  const kids = task.subTasks || [];
  const done = task.status === 'Completed';
  const prog = calcProgress(task);

  return (
    <div className={clsx('rounded-lg border', depth % 2 === 0 ? 'bg-white border-gray-100' : 'bg-gray-50 border-gray-100')}>
      <div className="flex items-center gap-2 px-2.5 py-1.5 group">
        {/* toggle / dot */}
        <button onClick={() => kids.length && setOpen(p => !p)} className="w-4 flex items-center justify-center flex-shrink-0">
          {kids.length
            ? (open ? <ChevronDownIcon className="w-3 h-3 text-gray-400" /> : <ChevronRightIcon className="w-3 h-3 text-gray-400" />)
            : <span className={clsx('w-2.5 h-2.5 rounded-full border-2', done ? 'bg-green-500 border-green-500' : 'border-gray-300')} />}
        </button>
        {/* title */}
        <div className="flex-1 min-w-0">
          <p className={clsx('text-[11px] font-medium truncate', done ? 'line-through text-gray-400' : 'text-gray-700')}>{task.title}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {task.assignedTo && <span className="flex items-center gap-1 text-[10px] text-gray-400"><Av user={task.assignedTo} sm />{task.assignedTo.firstName}</span>}
            {task.dueDate && <span className={clsx('text-[10px]', isPast(new Date(task.dueDate)) && !done ? 'text-red-500 font-medium' : 'text-gray-400')}>{format(new Date(task.dueDate), 'd MMM')}</span>}
            {kids.length > 0 && <span className="text-[10px] font-bold text-gray-400">{pct(prog)}%</span>}
          </div>
        </div>
        {/* actions */}
        <StatusPill task={task} editable={editable} onChange={onStatus} />
        {editable && (
          del
            ? <DelConfirm onConfirm={() => { onDelete(task._id); setDel(false); }} onCancel={() => setDel(false)} />
            : <>
                <button onClick={e => { e.stopPropagation(); setAdd(p => !p); setOpen(true); }} className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-brand-50 text-brand-400"><PlusIcon className="w-3 h-3" /></button>
                <button onClick={e => { e.stopPropagation(); setDel(true); }} className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-400"><TrashIcon className="w-3 h-3" /></button>
              </>
        )}
      </div>
      {kids.length > 0 && open && (
        <div className="px-2 pb-2 pt-1 ml-4 border-l-2 border-gray-100 space-y-1">
          {kids.map(c => <SubRow key={c._id} task={c} depth={depth + 1} dept={dept} editable={editable} onStatus={onStatus} onAddSub={onAddSub} onDelete={onDelete} />)}
        </div>
      )}
      {add && (
        <div className="px-2.5 pb-2">
          <QuickAdd placeholder="New sub-task…" onSave={async (t, d) => { await onAddSub(task._id, { title: t, dueDate: d, department: dept }); setAdd(false); }} onCancel={() => setAdd(false)} />
        </div>
      )}
    </div>
  );
}

// ─── Member task (depth 1) ────────────────────────────────────────────────────
function MemberCard({ task, dept, editable, onStatus, onAddSub, onDelete }) {
  const [open, setOpen] = useState(false);
  const [add,  setAdd]  = useState(false);
  const [del,  setDel]  = useState(false);
  const kids = task.subTasks || [];
  const done = task.status === 'Completed';
  const prog = calcProgress(task);
  const progress = pct(prog);

  return (
    <div className={clsx('rounded-xl border overflow-hidden', done ? 'border-green-100 bg-green-50/20' : 'border-gray-200 bg-white dark:bg-[#070c17] dark:border-[#1b2e4a]')}>
      <div className="flex items-start gap-2 px-3 py-2.5 group cursor-pointer" onClick={() => kids.length && setOpen(p => !p)}>
        <span className={clsx('w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1', STATUS_DOT[task.isOverdue ? 'Overdue' : task.status] || 'bg-gray-300')} />
        <div className="flex-1 min-w-0">
          <p className={clsx('text-xs font-semibold', done ? 'line-through text-gray-400' : 'text-gray-800 dark:text-gray-100')}>{task.title}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {task.assignedTo && <span className="flex items-center gap-1 text-[10px] text-gray-500"><Av user={task.assignedTo} sm />{task.assignedTo.firstName} {task.assignedTo.lastName}</span>}
            {task.dueDate && <span className={clsx('text-[10px]', isPast(new Date(task.dueDate)) && !done ? 'text-red-500 font-medium' : 'text-gray-400')}>Due {format(new Date(task.dueDate), 'd MMM')}</span>}
          </div>
          {kids.length > 0 && (
            <div className="flex items-center gap-2 mt-1.5">
              <Bar value={progress} cls={done ? 'bg-green-400' : 'bg-brand-400'} h="h-1" />
              <span className="text-[10px] font-bold text-gray-400 whitespace-nowrap">{progress}%</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <StatusPill task={task} editable={editable} onChange={onStatus} />
          {editable && (
            del
              ? <DelConfirm onConfirm={() => { onDelete(task._id); setDel(false); }} onCancel={() => setDel(false)} />
              : <>
                  <button onClick={e => { e.stopPropagation(); setAdd(p => !p); setOpen(true); }} className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-brand-50 text-brand-400"><PlusIcon className="w-3 h-3" /></button>
                  <button onClick={e => { e.stopPropagation(); setDel(true); }} className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-400"><TrashIcon className="w-3.5 h-3.5" /></button>
                </>
          )}
          {kids.length > 0 && <button onClick={e => { e.stopPropagation(); setOpen(p => !p); }} className="p-1 text-gray-400">{open ? <ChevronDownIcon className="w-3.5 h-3.5" /> : <ChevronRightIcon className="w-3.5 h-3.5" />}</button>}
        </div>
      </div>
      {kids.length > 0 && open && (
        <div className="px-3 pb-2.5 pt-2 border-t border-gray-100 dark:border-[#1b2e4a] bg-gray-50/50 space-y-1.5">
          {kids.map(c => <SubRow key={c._id} task={c} depth={2} dept={dept} editable={editable} onStatus={onStatus} onAddSub={onAddSub} onDelete={onDelete} />)}
        </div>
      )}
      {add && (
        <div className="px-3 pb-2.5 border-t border-gray-100 pt-2">
          <QuickAdd placeholder="New sub-task…" onSave={async (t, d) => { await onAddSub(task._id, { title: t, dueDate: d, department: dept }); setAdd(false); }} onCancel={() => setAdd(false)} />
        </div>
      )}
    </div>
  );
}

// ─── Manager task (depth 0) ───────────────────────────────────────────────────
function ManagerCard({ task, dept, cfg, editable, onStatus, onAddSub, onDelete }) {
  const [open, setOpen] = useState(true);
  const [add,  setAdd]  = useState(false);
  const [del,  setDel]  = useState(false);
  const kids = task.subTasks || [];
  const done = task.status === 'Completed';
  const prog = calcProgress(task);
  const progress = pct(prog);
  const doneKids = kids.filter(s => s.status === 'Completed').length;
  const ringColor = done ? '#22c55e' : progress > 0 ? '#6366f1' : '#d1d5db';

  return (
    <div className={clsx('rounded-2xl border-2 overflow-hidden shadow-sm', done ? 'border-green-200' : cfg.border)}>
      {/* header */}
      <div className={clsx('px-4 pt-3 pb-2', cfg.light)}>
        <div className="flex items-start gap-3">
          <Ring value={progress} size={44} stroke={4} color={ringColor} />
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-1">
              <p className={clsx('text-sm font-bold leading-snug', done ? 'line-through text-gray-400' : 'text-gray-900 dark:text-white')}>{task.title}</p>
              <div className="flex items-center gap-1 flex-shrink-0">
                {done && <CheckCircleIcon className="w-4 h-4 text-green-500" />}
                {editable && (
                  del
                    ? <DelConfirm onConfirm={() => { onDelete(task._id); setDel(false); }} onCancel={() => setDel(false)} />
                    : <button onClick={() => setDel(true)} className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-400"><TrashIcon className="w-3.5 h-3.5" /></button>
                )}
              </div>
            </div>
            {task.assignedTo && (
              <div className="flex items-center gap-1.5 mt-0.5">
                <Av user={task.assignedTo} />
                <span className="text-xs text-gray-600">{task.assignedTo.firstName} {task.assignedTo.lastName}</span>
                <span className={clsx('text-[9px] font-bold px-1.5 py-0.5 rounded-full', cfg.tag)}>Manager</span>
              </div>
            )}
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              {task.dueDate && <span className={clsx('text-[10px] font-medium', isPast(new Date(task.dueDate)) && !done ? 'text-red-500' : 'text-gray-400')}>Due {format(new Date(task.dueDate), 'd MMM yyyy')}</span>}
              {kids.length > 0 && <span className="text-[10px] text-gray-400">{doneKids}/{kids.length} done</span>}
              <StatusPill task={task} editable={editable} onChange={onStatus} />
            </div>
          </div>
        </div>
        {kids.length > 0 && (
          <button onClick={() => setOpen(p => !p)}
            className="mt-2 w-full flex items-center justify-center gap-1 text-[10px] font-medium text-gray-500 hover:text-gray-700 py-1 rounded-lg hover:bg-white/60 transition-colors">
            {open ? <><ChevronDownIcon className="w-3 h-3" /> Hide</> : <><ChevronRightIcon className="w-3 h-3" /> Show {kids.length} subtasks</>}
          </button>
        )}
      </div>

      {/* member subtasks */}
      {kids.length > 0 && open && (
        <div className="px-3 py-3 space-y-2 bg-white dark:bg-[#070c17]">
          {kids.map(c => (
            <MemberCard key={c._id} task={c} dept={dept} editable={editable} onStatus={onStatus} onAddSub={onAddSub} onDelete={onDelete} />
          ))}
        </div>
      )}

      {add && (
        <div className="px-3 pb-3 bg-white dark:bg-[#070c17]">
          <QuickAdd placeholder="Assign subtask to member…"
            onSave={async (t, d) => { await onAddSub(task._id, { title: t, dueDate: d, department: dept }); setAdd(false); }}
            onCancel={() => setAdd(false)} />
        </div>
      )}

      {editable && (
        <div className={clsx('px-3 py-2 flex gap-1.5 border-t', cfg.border, cfg.light)}>
          <button onClick={() => { setAdd(p => !p); setOpen(true); }}
            className={clsx('flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-1.5 rounded-xl', cfg.tag, 'hover:opacity-80 transition-opacity')}>
            <PlusIcon className="w-3.5 h-3.5" /> Add Subtask
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Dept column ──────────────────────────────────────────────────────────────
function DeptColumn({ dept, tasks, editable, filter, rootId, onStatus, onAddTask, onAddSub, onDelete, onAssign, onUpdate }) {
  const cfg = deptCfg(dept);
  const DI = cfg.icon;
  const [addingTask, setAddingTask] = useState(false);

  const filtered = filter === 'all' ? tasks : tasks.filter(t => {
    const ov = t.isOverdue || (t.dueDate && isPast(new Date(t.dueDate)) && t.status !== 'Completed');
    if (filter === 'overdue')     return ov;
    if (filter === 'in-progress') return t.status === 'In Progress';
    if (filter === 'pending')     return ['Pending', 'Assigned'].includes(t.status);
    return true;
  });

  const allProg = tasks.reduce((a, t) => { const p = calcProgress(t); return { done: a.done + p.done, total: a.total + p.total }; }, { done: 0, total: 0 });
  const progress = pct(allProg);
  const allDone = progress === 100;

  return (
    <div className="flex-shrink-0 w-80 flex flex-col rounded-2xl border border-gray-200 dark:border-[#1b2e4a] bg-gray-50 dark:bg-[#0f1a2e]/30 overflow-hidden shadow-sm">
      {/* dept header */}
      <div className={clsx('px-4 py-3', cfg.light)}>
        <div className="flex items-center gap-2.5">
          <div className={clsx('w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0', cfg.color)}>
            <DI className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className={clsx('font-bold text-sm', cfg.text)}>{dept}</p>
            <p className="text-[10px] text-gray-400">{tasks.length} task{tasks.length !== 1 ? 's' : ''}</p>
          </div>
          {allDone && <CheckCircleIcon className="w-5 h-5 text-green-500 flex-shrink-0" />}
        </div>
        <div className="flex items-center gap-2 mt-2">
          <Bar value={progress} cls={allDone ? 'bg-green-500' : cfg.bar} h="h-2" />
          <span className={clsx('text-xs font-bold flex-shrink-0', cfg.text)}>{progress}%</span>
        </div>
      </div>

      {/* task list */}
      <div className="flex-1 p-3 space-y-3 overflow-y-auto" style={{ maxHeight: 520 }}>
        {filtered.map(t => (
          <ManagerCard key={t._id} task={t} dept={dept} cfg={cfg} editable={editable} onStatus={onStatus} onAddSub={onAddSub} onDelete={onDelete} />
        ))}
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 text-gray-300 gap-2">
            <DI className="w-8 h-8" />
            <p className="text-xs text-center">{filter === 'all' ? 'No tasks yet' : `No ${filter} tasks`}</p>
          </div>
        )}
        {addingTask && editable && (
          <QuickAdd placeholder="New task title…"
            onSave={async (title, due) => { await onAddTask(dept, { title, dueDate: due }); setAddingTask(false); }}
            onCancel={() => setAddingTask(false)} />
        )}
      </div>

      {/* footer */}
      {editable && (
        <div className={clsx('px-3 py-2.5 border-t space-y-1.5', cfg.border, cfg.light)}>
          <button onClick={() => setAddingTask(p => !p)}
            className={clsx('w-full flex items-center justify-center gap-1.5 text-xs font-semibold py-2 rounded-xl border-2 transition-opacity hover:opacity-80', cfg.border, cfg.tag)}>
            <PlusIcon className="w-3.5 h-3.5" /> Add Task
          </button>
          <button onClick={() => onAssign({ dept, tasks, parentId: rootId })}
            className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white transition-colors">
            <UserCircleIcon className="w-3.5 h-3.5" /> Assign Member Subtask
          </button>
          <button onClick={() => onUpdate(dept, progress)}
            className="w-full flex items-center justify-center gap-1.5 text-xs font-medium py-1.5 rounded-xl bg-white border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors">
            <PaperAirplaneIcon className="w-3.5 h-3.5" /> Send Update
          </button>
        </div>
      )}
    </div>
  );
}

// ─── New Project Wizard (2 steps) ─────────────────────────────────────────────
function NewProjectModal({ onClose, onCreated }) {
  const [step, setStep] = useState(1);
  const [main, setMain] = useState({ title: '', description: '', priority: 'high', dueDate: '' });
  const emptyRow = () => ({ id: uid(), dept: '', taskTitle: '', managerId: '', dueDate: '' });
  const [rows, setRows] = useState([emptyRow()]);
  const [allUsers, setAllUsers] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.get('/users', { params: { limit: 300 } })
      .then(r => setAllUsers(r.data?.data?.data || r.data?.data || []))
      .catch(() => {});
  }, []);

  const addRow = () => setRows(p => [...p, emptyRow()]);
  const removeRow = id => setRows(p => p.filter(r => r.id !== id));
  const updateRow = (id, k, v) => setRows(p => p.map(r => r.id === id ? { ...r, [k]: v } : r));
  const managersFor = dept => {
    const managers = allUsers.filter(u => ['manager','team_lead','admin','founder','chairman','super_admin'].includes(u.role));
    const match = dept ? managers.filter(u => u.department === dept) : [];
    return match.length > 0 ? match : managers;
  };

  const goNext = () => { if (!main.title.trim()) return setErr('Project name is required'); setErr(''); setStep(2); };

  const submit = async () => {
    const valid = rows.filter(r => r.dept && r.taskTitle.trim());
    if (!valid.length) return setErr('Add at least one department task');
    setBusy(true); setErr('');
    try {
      const res = await api.post('/tasks', {
        title: main.title.trim(), description: main.description || undefined,
        priority: main.priority, dueDate: main.dueDate || undefined,
        department: valid[0].dept, status: 'Pending',
      });
      const rootId = res.data?.data?.task?._id || res.data?.data?._id || res.data?.task?._id;
      for (const row of valid) {
        await api.post('/tasks', {
          title: row.taskTitle.trim(), department: row.dept, priority: main.priority,
          assignedTo: row.managerId || undefined, dueDate: row.dueDate || undefined,
          parentTask: rootId, status: row.managerId ? 'Assigned' : 'Pending',
        });
      }
      onCreated(rootId);
    } catch (e) {
      setErr(e?.response?.data?.message || 'Failed to create');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-[#070c17] rounded-2xl shadow-2xl w-full max-w-xl flex flex-col" style={{ maxHeight: '92vh' }}>
        {/* modal header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-[#1b2e4a]">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-gray-900 dark:text-white">{step === 1 ? 'New Project' : 'Assign Departments'}</h2>
              <span className="text-[10px] font-bold bg-brand-100 text-brand-600 px-2 py-0.5 rounded-full">Step {step}/2</span>
            </div>
            {step === 2 && <p className="text-xs text-gray-400 mt-0.5 truncate max-w-sm">"{main.title}"</p>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><XMarkIcon className="w-5 h-5" /></button>
        </div>

        {step === 1 ? (
          <>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-xl">{err}</p>}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">Project Name *</label>
                <input autoFocus value={main.title} onChange={e => setMain(p => ({ ...p, title: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && goNext()}
                  placeholder="e.g. New Soap — Product Launch"
                  className="input w-full text-sm font-semibold" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">Description</label>
                <textarea value={main.description} onChange={e => setMain(p => ({ ...p, description: e.target.value }))}
                  placeholder="Goal of this project…" rows={3} className="input w-full resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5">Priority</label>
                  <select value={main.priority} onChange={e => setMain(p => ({ ...p, priority: e.target.value }))} className="input w-full">
                    <option value="critical">Critical</option>
                    <option value="urgent">Urgent</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5">Deadline</label>
                  <input type="date" value={main.dueDate} onChange={e => setMain(p => ({ ...p, dueDate: e.target.value }))} className="input w-full" />
                </div>
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-gray-200 dark:border-[#1b2e4a]">
              <button onClick={onClose} className="btn-secondary">Cancel</button>
              <button onClick={goNext} disabled={!main.title.trim()} className="btn-primary flex-1 flex items-center justify-center gap-2">
                Next: Dept Assignments <ChevronRightIcon className="w-4 h-4" />
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-3">
              {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-xl">{err}</p>}
              <p className="text-xs text-gray-500">Assign a task to each department and pick that department's manager.</p>
              {rows.map((row, idx) => {
                const c = row.dept ? deptCfg(row.dept) : null;
                const DI = c?.icon || CogIcon;
                return (
                  <div key={row.id} className={clsx('rounded-2xl border-2 p-4 space-y-3', c ? c.border : 'border-dashed border-gray-300', c ? c.light : 'bg-white')}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={clsx('w-7 h-7 rounded-xl flex items-center justify-center', c?.color || 'bg-gray-300')}><DI className="w-4 h-4 text-white" /></div>
                        <span className={clsx('text-xs font-bold', c?.text || 'text-gray-400')}>{row.dept || `Dept ${idx + 1}`}</span>
                      </div>
                      {rows.length > 1 && <button onClick={() => removeRow(row.id)} className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-400"><TrashIcon className="w-3.5 h-3.5" /></button>}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 mb-1">Department *</label>
                        <select value={row.dept} onChange={e => updateRow(row.id, 'dept', e.target.value)} className="input w-full text-xs py-1.5">
                          <option value="">— Select —</option>
                          {DEPT_NAMES.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 mb-1">Due Date</label>
                        <input type="date" value={row.dueDate} onChange={e => updateRow(row.id, 'dueDate', e.target.value)} className="input w-full text-xs py-1.5" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 mb-1">Task Name *</label>
                      <input value={row.taskTitle} onChange={e => updateRow(row.id, 'taskTitle', e.target.value)}
                        placeholder={row.dept ? `${row.dept} work…` : 'Task name…'} className="input w-full text-xs py-1.5" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 mb-1">Assign to Manager</label>
                      <select value={row.managerId} onChange={e => updateRow(row.id, 'managerId', e.target.value)} className="input w-full text-xs py-1.5">
                        <option value="">— Select manager —</option>
                        {managersFor(row.dept).map(m => <option key={m._id} value={m._id}>{m.firstName} {m.lastName}{m.designation ? ` · ${m.designation}` : ''}</option>)}
                      </select>
                    </div>
                  </div>
                );
              })}
              <button onClick={addRow}
                className="w-full py-3 rounded-2xl border-2 border-dashed border-gray-200 text-xs font-semibold text-gray-400 hover:border-brand-400 hover:text-brand-500 flex items-center justify-center gap-2 transition-colors">
                <PlusIcon className="w-4 h-4" /> Add Another Department
              </button>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-gray-200 dark:border-[#1b2e4a]">
              <button onClick={() => { setStep(1); setErr(''); }} className="btn-secondary flex items-center gap-1">
                <ChevronRightIcon className="w-4 h-4 rotate-180" /> Back
              </button>
              <button onClick={submit} disabled={busy || !rows.some(r => r.dept && r.taskTitle.trim())}
                className="btn-primary flex-1 flex items-center justify-center gap-2">
                {busy ? <><ArrowPathIcon className="w-4 h-4 animate-spin" /> Creating…</> : <><CheckIcon className="w-4 h-4" /> Create Project</>}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Assign Member Modal ──────────────────────────────────────────────────────
function AssignMemberModal({ dept, deptTasks, onClose, onCreated }) {
  const [form, setForm] = useState({
    title: '', description: '', priority: 'medium', dueDate: '', assignedTo: '',
    parentTaskId: deptTasks?.length === 1 ? deptTasks[0]._id : '',
  });
  const [members, setMembers] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const cfg = deptCfg(dept);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  useEffect(() => {
    api.get('/users', { params: { department: dept, limit: 100 } })
      .then(r => setMembers(r.data?.data?.data || r.data?.data || []))
      .catch(() => {});
  }, [dept]);

  const submit = async () => {
    if (!form.title.trim()) return setErr('Title is required');
    if (!form.parentTaskId) return setErr('Select which task to assign under');
    setBusy(true); setErr('');
    try {
      await api.post('/tasks', {
        title: form.title.trim(), description: form.description || undefined,
        priority: form.priority, dueDate: form.dueDate || undefined,
        assignedTo: form.assignedTo || undefined, parentTask: form.parentTaskId,
        department: dept, status: form.assignedTo ? 'Assigned' : 'Pending',
      });
      onCreated();
    } catch (e) {
      setErr(e?.response?.data?.message || 'Failed');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-[#070c17] rounded-2xl shadow-2xl w-full max-w-md flex flex-col" style={{ maxHeight: '90vh' }}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-[#1b2e4a]">
          <div className="flex items-center gap-3">
            <div className={clsx('w-8 h-8 rounded-xl flex items-center justify-center', cfg.color)}><cfg.icon className="w-4 h-4 text-white" /></div>
            <div>
              <h2 className="font-bold text-gray-900 dark:text-white text-sm">Assign Subtask</h2>
              <p className={clsx('text-xs font-semibold', cfg.text)}>{dept}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><XMarkIcon className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-xl">{err}</p>}
          {deptTasks && deptTasks.length > 1 && (
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">Under which task? *</label>
              <select value={form.parentTaskId} onChange={e => set('parentTaskId', e.target.value)} className="input w-full">
                <option value="">— Select —</option>
                {deptTasks.map(t => <option key={t._id} value={t._id}>{t.title}</option>)}
              </select>
            </div>
          )}
          {deptTasks?.length === 1 && (
            <div className={clsx('flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium', cfg.light, cfg.text)}>
              <ChevronRightIcon className="w-3.5 h-3.5" /> Under: {deptTasks[0].title}
            </div>
          )}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1.5">Subtask Title *</label>
            <input autoFocus value={form.title} onChange={e => set('title', e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit()}
              placeholder="e.g. Design packaging label" className="input w-full" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1.5">Instructions</label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)}
              placeholder="Detailed instructions…" rows={2} className="input w-full resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">Priority</label>
              <select value={form.priority} onChange={e => set('priority', e.target.value)} className="input w-full">
                <option value="urgent">Urgent</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">Due Date</label>
              <input type="date" value={form.dueDate} onChange={e => set('dueDate', e.target.value)} className="input w-full" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1.5">Assign to Member</label>
            <select value={form.assignedTo} onChange={e => set('assignedTo', e.target.value)} className="input w-full">
              <option value="">— Select member —</option>
              {members.map(m => <option key={m._id} value={m._id}>{m.firstName} {m.lastName} ({m.role})</option>)}
            </select>
            {!members.length && <p className="text-[10px] text-amber-600 mt-1">No members found in {dept}. Task will be unassigned.</p>}
          </div>
        </div>
        <div className="flex gap-3 px-6 py-4 border-t border-gray-200 dark:border-[#1b2e4a]">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={submit} disabled={busy || !form.title.trim() || !form.parentTaskId}
            className="btn-primary flex-1 flex items-center justify-center gap-2">
            {busy ? <><ArrowPathIcon className="w-4 h-4 animate-spin" /> Assigning…</> : <><UserCircleIcon className="w-4 h-4" /> Assign</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── WhatsApp Client Update Modal ─────────────────────────────────────────────
const WA_MILESTONES = [
  'Raw materials have been purchased ✅',
  'Production has started ✅',
  'Your product is being manufactured ✅',
  'Quality check is in progress ✅',
  'Quality check passed — product approved ✅',
  'Packaging is complete ✅',
  'Your order is ready for dispatch ✅',
  'Your order has been dispatched 🚚',
  'Custom message…',
];

function WhatsAppUpdateModal({ lead, onClose }) {
  const [selected, setSelected] = useState(WA_MILESTONES[0]);
  const [custom, setCustom] = useState('');

  const mutation = useMutation({
    mutationFn: (message) => api.post(`/crm/leads/${lead._id}/send-update`, { message }),
    onSuccess: () => { toast.success('Update sent to client via WhatsApp'); onClose(); },
    onError: () => toast.error('Failed to send update'),
  });

  const send = () => {
    const msg = selected === 'Custom message…' ? custom : selected;
    if (!msg.trim()) { toast.error('Enter a message'); return; }
    mutation.mutate(msg);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-[#070c17] rounded-2xl shadow-2xl w-full max-w-md">
        <div className="p-5 border-b border-gray-200 dark:border-[#1b2e4a] flex items-center justify-between">
          <div>
            <h2 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <PaperAirplaneIcon className="w-4 h-4 text-green-600" />
              Send WhatsApp Update
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              To: {lead.name}{lead.phone ? ` · ${lead.phone}` : ''}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-[#17263d] text-gray-400">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">Select Update</label>
            <select value={selected} onChange={e => { setSelected(e.target.value); setCustom(''); }} className="input w-full">
              {WA_MILESTONES.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          {selected === 'Custom message…' && (
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">Your Message *</label>
              <textarea value={custom} onChange={e => setCustom(e.target.value)} rows={3} className="input w-full resize-none" placeholder="Type your custom update here…" />
            </div>
          )}
          <div className="rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-3">
            <p className="text-xs font-semibold text-green-700 dark:text-green-400 mb-1">WhatsApp Preview</p>
            <p className="text-xs text-green-800 dark:text-green-300 whitespace-pre-line">
              {`📦 Order Update — Backero\n\n${selected === 'Custom message…' ? (custom || '…') : selected}`}
            </p>
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button onClick={send} disabled={mutation.isPending} className="btn-primary flex-1 justify-center gap-2 disabled:opacity-50">
              <PaperAirplaneIcon className="w-4 h-4" />
              {mutation.isPending ? 'Sending…' : 'Send via WhatsApp'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Update Modal ─────────────────────────────────────────────────────────────
function UpdateModal({ dept, progress, projectId, onClose }) {
  const [msg, setMsg] = useState(`${dept} update: ${progress}% complete. `);
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (!msg.trim()) return;
    setBusy(true);
    try { await api.post(`/tasks/${projectId}/comment`, { content: msg, type: 'update' }); onClose(true); }
    catch { onClose(false); }
  };
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-[#070c17] rounded-2xl shadow-2xl w-full max-w-md">
        <div className="p-5 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-gray-900">Send Update</h2>
            <p className="text-xs text-gray-400 mt-0.5">{dept} — {progress}% complete</p>
          </div>
          <button onClick={() => onClose(false)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><XMarkIcon className="w-5 h-5" /></button>
        </div>
        <div className="p-5">
          <textarea value={msg} onChange={e => setMsg(e.target.value)} rows={4} className="input w-full resize-none text-sm" placeholder="Describe progress, blockers, next steps…" />
        </div>
        <div className="flex gap-3 px-5 pb-5">
          <button onClick={() => onClose(false)} className="btn-secondary flex-1">Cancel</button>
          <button onClick={send} disabled={busy || !msg.trim()} className="btn-primary flex-1 flex items-center justify-center gap-2">
            {busy ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <><PaperAirplaneIcon className="w-4 h-4" /> Send</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'in-progress', label: 'In Progress' },
  { key: 'pending', label: 'Pending' },
  { key: 'overdue', label: 'Overdue' },
];

export default function DeptWorkflow() {
  const { isAdmin, isManager, dept: userDept } = usePermissions();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();

  const [projectId,    setProjectId]    = useState(() => searchParams.get('project') || null);
  const [filter,       setFilter]       = useState('all');
  const [activeTab,    setActiveTab]    = useState('all');
  const [toast,        setToast]        = useState(null);
  const [showNew,      setShowNew]      = useState(false);
  const [updateModal,  setUpdateModal]  = useState(null);
  const [memberModal,  setMemberModal]  = useState(null);
  const [confirmDel,   setConfirmDel]   = useState(false);
  const [deleting,     setDeleting]     = useState(false);
  const [waModal,      setWaModal]      = useState(false);

  const showToast = (msg, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3000); };

  // Projects list
  const { data: projData, isLoading: projLoading } = useQuery({
    queryKey: ['workflow-projects'],
    queryFn: () => api.get('/tasks', { params: { limit: 50, rootOnly: 'true' } }).then(r => r.data),
  });
  const projects = projData?.data?.data || projData?.data?.tasks || projData?.tasks || [];

  // Task tree
  const { data: treeData, isLoading: treeLoading, refetch } = useQuery({
    queryKey: ['task-tree', projectId],
    queryFn: () => api.get(`/tasks/${projectId}/tree`).then(r => r.data),
    enabled: !!projectId,
  });
  const tree = treeData?.data?.task || treeData?.task || null;

  // Linked CRM lead (if project was converted from a lead)
  const { data: linkedLeadData } = useQuery({
    queryKey: ['linked-lead', projectId],
    queryFn: () => api.get(`/crm/leads/by-task/${projectId}`).then(r => r.data.lead).catch(() => null),
    enabled: !!projectId,
    retry: false,
  });
  const linkedLead = linkedLeadData || null;

  // Build dept map
  const deptMap = {};
  (tree?.subTasks || []).forEach(sub => {
    const d = sub.department || 'Unassigned';
    if (!deptMap[d]) deptMap[d] = [];
    deptMap[d].push(sub);
  });
  const depts = Object.keys(deptMap);
  const overallProg = tree ? calcProgress(tree) : { done: 0, total: 0 };
  const overallPct = pct(overallProg);

  const visibleDepts = activeTab === 'mine'
    ? depts.filter(d => d === userDept)
    : (isAdmin || isManager ? depts : depts.filter(d => d === userDept));

  // Handlers
  const handleStatus = async (taskId, status) => {
    try { await api.put(`/tasks/${taskId}`, { status }); queryClient.invalidateQueries({ queryKey: ['task-tree', projectId] }); showToast(`Status → "${status}"`); }
    catch { showToast('Failed to update', false); }
  };
  const handleAddTask = async (dept, { title, dueDate }) => {
    try { await api.post('/tasks', { title, dueDate: dueDate || undefined, parentTask: projectId, department: dept, status: 'Pending' }); queryClient.invalidateQueries({ queryKey: ['task-tree', projectId] }); showToast('Task added'); }
    catch { showToast('Failed to add task', false); throw new Error(); }
  };
  const handleAddSub = async (parentId, { title, dueDate, department }) => {
    try { await api.post('/tasks', { title, dueDate: dueDate || undefined, parentTask: parentId, department, status: 'Pending' }); queryClient.invalidateQueries({ queryKey: ['task-tree', projectId] }); showToast('Subtask added'); }
    catch { showToast('Failed to add subtask', false); throw new Error(); }
  };
  const handleDelete = async (taskId) => {
    try { await api.delete(`/tasks/${taskId}`); queryClient.invalidateQueries({ queryKey: ['task-tree', projectId] }); showToast('Deleted'); }
    catch { showToast('Failed to delete', false); }
  };
  const handleDeleteProject = async () => {
    if (!projectId) return;
    setDeleting(true);
    try {
      await api.delete(`/tasks/${projectId}`);
      queryClient.invalidateQueries({ queryKey: ['workflow-projects'] });
      queryClient.removeQueries({ queryKey: ['task-tree', projectId] });
      setProjectId(null);
      setConfirmDel(false);
      showToast('Project deleted');
    } catch {
      showToast('Failed to delete project', false);
    } finally { setDeleting(false); }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-gray-50 dark:bg-[#070c17]">

      {/* Toast */}
      {toast && (
        <div className={clsx('fixed top-4 right-4 z-[60] px-4 py-2.5 rounded-xl shadow-xl text-sm font-semibold text-white transition-all', toast.ok ? 'bg-green-600' : 'bg-red-600')}>
          {toast.msg}
        </div>
      )}

      {/* ── Slim project header ── */}
      <div className="flex-shrink-0 px-5 py-3 bg-white dark:bg-[#070c17] border-b border-gray-200 dark:border-[#1b2e4a]">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Project selector */}
          <select value={projectId || ''} onChange={e => { setProjectId(e.target.value || null); setConfirmDel(false); }}
            className="input text-sm py-1.5 max-w-[260px]" disabled={projLoading}>
            <option value="">— Select project —</option>
            {projects.map(p => <option key={p._id} value={p._id}>{p.title}</option>)}
          </select>

          {projectId && (
            <button onClick={() => refetch()} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-[#17263d] flex-shrink-0">
              <ArrowPathIcon className={clsx('w-4 h-4 text-gray-400', treeLoading && 'animate-spin')} />
            </button>
          )}

          {/* Tab toggle */}
          <div className="flex items-center gap-1 bg-gray-100 dark:bg-[#0f1a2e] rounded-xl p-0.5">
            {[{ key: 'all', label: 'All Depts' }, { key: 'mine', label: 'My Dept' }].map(t => (
              <button key={t.key} onClick={() => setActiveTab(t.key)}
                className={clsx('text-xs px-3 py-1.5 rounded-lg font-semibold transition-all',
                  activeTab === t.key ? 'bg-white dark:bg-[#132035] text-brand-600 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Filters */}
          <div className="flex items-center gap-1 ml-auto flex-wrap">
            {FILTERS.map(f => (
              <button key={f.key} onClick={() => setFilter(f.key)}
                className={clsx('text-xs px-2.5 py-1 rounded-full font-semibold transition-colors',
                  filter === f.key ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200')}>
                {f.label}
              </button>
            ))}
          </div>

          {/* Send WhatsApp update to client */}
          {linkedLead && (
            <button
              onClick={() => setWaModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-xs font-bold transition-all flex-shrink-0"
            >
              <PaperAirplaneIcon className="w-3.5 h-3.5" /> Send Client Update
            </button>
          )}

          {/* New Project */}
          {isAdmin && (
            <button onClick={() => setShowNew(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold transition-all flex-shrink-0">
              <PlusIcon className="w-3.5 h-3.5" /> New Project
            </button>
          )}

          {/* Delete project */}
          {projectId && isAdmin && (
            confirmDel ? (
              <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-xl px-2.5 py-1.5">
                <ExclamationTriangleIcon className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                <span className="text-xs text-red-600 font-semibold whitespace-nowrap">Delete project?</span>
                <button onClick={handleDeleteProject} disabled={deleting}
                  className="text-xs px-2 py-0.5 rounded bg-red-500 text-white font-bold disabled:opacity-50">
                  {deleting ? '…' : 'Yes'}
                </button>
                <button onClick={() => setConfirmDel(false)} className="text-xs px-2 py-0.5 rounded bg-white border border-gray-200 text-gray-500">No</button>
              </div>
            ) : (
              <button onClick={() => setConfirmDel(true)}
                className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-400 transition-colors flex-shrink-0">
                <TrashIcon className="w-4 h-4" />
              </button>
            )
          )}
        </div>

        {/* Project info + progress */}
        {tree && (
          <div className="mt-2.5 flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <ChartBarIcon className="w-4 h-4 text-brand-500 flex-shrink-0" />
              <span className="text-sm font-bold text-gray-900 dark:text-white truncate">{tree.title}</span>
              {tree.priority && <span className={clsx('text-[10px] font-bold px-2 py-0.5 rounded-full uppercase flex-shrink-0', PRIORITY_CLS[tree.priority])}>{tree.priority}</span>}
              {tree.dueDate && <span className="text-xs text-gray-400 flex-shrink-0">· Due {format(new Date(tree.dueDate), 'd MMM yyyy')}</span>}
              <span className="text-xs text-gray-400 flex-shrink-0">· {depts.length} dept{depts.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="flex items-center gap-2 flex-1 min-w-[180px]">
              <Bar value={overallPct} cls="bg-gradient-to-r from-brand-500 to-purple-500" h="h-2" />
              <span className="text-xs font-bold text-gray-700 dark:text-gray-200 whitespace-nowrap">{overallPct}% overall</span>
            </div>
            {/* Dept pills */}
            <div className="flex gap-1.5 flex-wrap">
              {depts.map(d => {
                const dt = deptMap[d];
                const dp = pct(dt.reduce((a, t) => { const c = calcProgress(t); return { done: a.done + c.done, total: a.total + c.total }; }, { done: 0, total: 0 }));
                const c = deptCfg(d);
                return (
                  <span key={d} className={clsx('flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border', c.tag, c.border)}>
                    <c.icon className="w-2.5 h-2.5" />
                    {d === 'Accounts & Finance' ? 'Finance' : d} {dp}%
                    {dp === 100 && <CheckCircleIcon className="w-2.5 h-2.5 text-green-500" />}
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Columns area */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        {treeLoading || projLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !projectId ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-100 to-purple-100 flex items-center justify-center">
              <SparklesIcon className="w-7 h-7 text-brand-400" />
            </div>
            <p className="text-sm font-semibold text-gray-600 dark:text-gray-300">Select a project to view the workflow</p>
            {isAdmin && <button onClick={() => setShowNew(true)} className="btn-primary text-sm px-5 py-2"><PlusIcon className="w-4 h-4 inline mr-1.5" />Create New Project</button>}
          </div>
        ) : !tree || depts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
            <ChartBarIcon className="w-10 h-10 opacity-40" />
            <p className="text-sm">No department tasks yet for this project</p>
          </div>
        ) : visibleDepts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
            <p className="text-sm">No tasks assigned to your department</p>
          </div>
        ) : (
          <div className="flex gap-5 p-6 h-full items-start">
            {visibleDepts.map(dept => (
              <DeptColumn
                key={dept}
                dept={dept}
                tasks={deptMap[dept]}
                editable={isAdmin || dept === userDept}
                filter={filter}
                rootId={projectId}
                onStatus={handleStatus}
                onAddTask={handleAddTask}
                onAddSub={handleAddSub}
                onDelete={handleDelete}
                onAssign={({ dept: d, tasks }) => setMemberModal({ dept: d, deptTasks: tasks })}
                onUpdate={(d, p) => setUpdateModal({ dept: d, progress: p })}
              />
            ))}
          </div>
        )}
      </div>

      {/* WhatsApp Client Update Modal */}
      {waModal && linkedLead && (
        <WhatsAppUpdateModal lead={linkedLead} onClose={() => setWaModal(false)} />
      )}

      {/* Modals */}
      {showNew && (
        <NewProjectModal onClose={() => setShowNew(false)}
          onCreated={rootId => {
            setShowNew(false);
            queryClient.invalidateQueries({ queryKey: ['workflow-projects'] });
            if (rootId) setTimeout(() => setProjectId(rootId), 300);
            showToast('Project created ✓');
          }} />
      )}
      {updateModal && (
        <UpdateModal dept={updateModal.dept} progress={updateModal.progress} projectId={projectId}
          onClose={ok => { setUpdateModal(null); showToast(ok ? 'Update sent ✓' : 'Failed to send', ok); }} />
      )}
      {memberModal && (
        <AssignMemberModal dept={memberModal.dept} deptTasks={memberModal.deptTasks}
          onClose={() => setMemberModal(null)}
          onCreated={() => { setMemberModal(null); queryClient.invalidateQueries({ queryKey: ['task-tree', projectId] }); showToast('Subtask assigned ✓'); }} />
      )}
    </div>
  );
}
