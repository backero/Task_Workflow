import React, { useState, useEffect } from 'react';
import { PlayIcon, ClockIcon, ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';
import { format } from 'date-fns';
import { clsx } from 'clsx';
import { useTaskTimer } from '../../store/useTaskTimer';

function fmtMs(ms, mode = 'clock') {
  if (!ms || ms < 0) return mode === 'clock' ? '00:00:00' : '0s';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (mode === 'clock') return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

// Square stop icon (not in heroicons outline)
function StopIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <rect x="5" y="5" width="14" height="14" rx="2" />
    </svg>
  );
}

export default function TaskTimer({ task }) {
  const taskId = task?._id?.toString();
  const { active, isRunning, startTimer, stopTimer, isStarting, isStopping } = useTaskTimer(taskId);

  const [elapsed, setElapsed] = useState(0);
  const [showSessions, setShowSessions] = useState(false);

  useEffect(() => {
    if (!isRunning || !active?.startedAt) { setElapsed(0); return; }
    const base = new Date(active.startedAt).getTime();
    const tick = () => setElapsed(Date.now() - base);
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isRunning, active?.startedAt]);

  const totalMs = (task?.totalTrackedMs || 0) + (isRunning ? elapsed : 0);
  const sessions = task?.timerSessions || [];

  return (
    <div className="rounded-xl border border-gray-200 dark:border-[#1b2e4a] overflow-hidden">
      {/* Main timer row */}
      <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-[#0f1a2e]">
        {/* Indicator dot */}
        <div className={clsx(
          'w-2.5 h-2.5 rounded-full flex-shrink-0',
          isRunning ? 'bg-green-500 animate-pulse' : 'bg-gray-300 dark:bg-gray-600'
        )} />

        {/* Clock display */}
        <div className="flex-1">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-xl font-bold text-gray-900 dark:text-white tracking-tight">
              {fmtMs(totalMs, 'clock')}
            </span>
            {isRunning && (
              <span className="text-xs font-semibold text-green-600 dark:text-green-400 animate-pulse">
                RUNNING
              </span>
            )}
          </div>
          {sessions.length > 0 && (
            <p className="text-xs text-gray-400 mt-0.5">{sessions.length} session{sessions.length !== 1 ? 's' : ''} · {fmtMs(task?.totalTrackedMs || 0, 'compact')} total</p>
          )}
        </div>

        {/* Start / Stop button */}
        <button
          onClick={() => isRunning ? stopTimer({ id: taskId }) : startTimer(taskId)}
          disabled={isStarting || isStopping}
          className={clsx(
            'flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold transition-all disabled:opacity-50',
            isRunning
              ? 'bg-red-500 hover:bg-red-600 text-white shadow-sm shadow-red-200'
              : 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm shadow-blue-200'
          )}
        >
          {isRunning
            ? <><StopIcon className="w-3.5 h-3.5" /> Stop</>
            : <><PlayIcon className="w-3.5 h-3.5" /> Start</>
          }
        </button>
      </div>

      {/* Sessions toggle */}
      {sessions.length > 0 && (
        <>
          <button
            onClick={() => setShowSessions(v => !v)}
            className="w-full flex items-center justify-between px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-[#0f1a2e] border-t border-gray-100 dark:border-[#1b2e4a] transition-colors"
          >
            <span>Time Log ({sessions.length})</span>
            {showSessions ? <ChevronUpIcon className="w-3.5 h-3.5" /> : <ChevronDownIcon className="w-3.5 h-3.5" />}
          </button>

          {showSessions && (
            <div className="divide-y divide-gray-100 dark:divide-[#1b2e4a] max-h-52 overflow-y-auto">
              {[...sessions].reverse().map((s, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-2.5">
                  <div>
                    <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 font-mono">
                      {fmtMs(s.durationMs, 'compact')}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {s.startedAt ? format(new Date(s.startedAt), 'dd MMM, hh:mm a') : ''}
                      {s.stoppedAt ? ` → ${format(new Date(s.stoppedAt), 'hh:mm a')}` : ''}
                    </p>
                    {s.note && <p className="text-[11px] text-gray-400 italic mt-0.5">{s.note}</p>}
                  </div>
                  <ClockIcon className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
