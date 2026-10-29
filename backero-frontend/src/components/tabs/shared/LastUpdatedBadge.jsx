import React from 'react';
import { Clock } from 'lucide-react';

function fmtDate(d) {
  return d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
}

export default function LastUpdatedBadge({ date, onChange }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-semibold bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
        <Clock size={11} className="inline -mt-0.5 mr-1" />Last updated: {fmtDate(date)}
      </span>
      <input type="date" value={date ? new Date(date).toISOString().split('T')[0] : ''} onChange={e => onChange(e.target.value ? new Date(e.target.value).toISOString() : null)}
        className="text-[11px] px-2 py-1 border border-gray-200 dark:border-[#1b2e4a] rounded-lg bg-white dark:bg-[#0d1b2e]" title="Edit last updated date" />
    </div>
  );
}
