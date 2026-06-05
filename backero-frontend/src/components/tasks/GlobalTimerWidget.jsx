import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useTaskTimer } from '../../store/useTaskTimer';

function fmtMs(ms) {
  if (!ms || ms < 0) return '00:00:00';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function GlobalTimerWidget() {
  const navigate = useNavigate();
  const { active, stopTimer, isStopping } = useTaskTimer();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!active?.startedAt) { setElapsed(0); return; }
    const base = new Date(active.startedAt).getTime();
    const baseTotal = active.totalTrackedMs || 0;
    const tick = () => setElapsed(baseTotal + (Date.now() - base));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [active?.startedAt, active?.totalTrackedMs]);

  if (!active) return null;

  return (
    <div className="fixed bottom-5 right-5 z-40 flex items-center gap-3 bg-gray-900 dark:bg-[#0f1a2e] text-white rounded-2xl shadow-2xl px-4 py-3 border border-white/10 animate-fade-in">
      {/* Pulse dot */}
      <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse flex-shrink-0" />

      {/* Info — click to go to workflow */}
      <button
        onClick={() => navigate(`/workflow/${active.taskId}`)}
        className="text-left min-w-0 flex-1"
      >
        <p className="text-[11px] text-gray-400 truncate max-w-[150px] leading-tight">{active.title}</p>
        <p className="font-mono font-bold text-base text-white leading-tight">{fmtMs(elapsed)}</p>
      </button>

      {/* Stop button */}
      <button
        onClick={() => stopTimer({ id: active.taskId?.toString() })}
        disabled={isStopping}
        className="flex-shrink-0 px-2.5 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
      >
        Stop
      </button>

      {/* Dismiss (just hides locally, timer keeps running) */}
      <button
        onClick={(e) => { e.stopPropagation(); document.getElementById('global-timer-widget')?.remove(); }}
        className="flex-shrink-0 text-gray-500 hover:text-gray-300 transition-colors"
      >
        <XMarkIcon className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
