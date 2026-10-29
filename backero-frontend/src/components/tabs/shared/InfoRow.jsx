import React from 'react';
import { clsx } from 'clsx';

export default function InfoRow({ label, value, mono, badge, accent }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-400 w-28 flex-shrink-0">{label}</span>
      {badge ? (
        <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium', badge === 'green' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : badge === 'yellow' ? 'bg-amber-100 text-amber-700' : badge === 'blue' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-gray-100 text-gray-500')}>{value ?? '-'}</span>
      ) : (
        <span className={clsx('text-xs', mono && 'font-mono', accent ? 'text-base font-bold text-blue-600 dark:text-blue-400' : 'text-gray-800 dark:text-gray-200')}>{value ?? '-'}</span>
      )}
    </div>
  );
}
