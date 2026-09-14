import React, { useState, useEffect } from 'react';
import { Button, Tag, Typography } from 'antd';
import { CaretDownOutlined, CaretUpOutlined, ClockCircleOutlined, PlayCircleFilled } from '@ant-design/icons';
import { format } from 'date-fns';
import { useTaskTimer } from '../../store/useTaskTimer';

const { Text } = Typography;

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

function StopSquareIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
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
    <div style={{ borderRadius: 12, border: '1px solid rgba(28,25,23,0.1)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'rgba(15,23,42,0.03)' }}>
        <span
          style={{
            width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
            background: isRunning ? '#22c55e' : '#d1d5db',
            animation: isRunning ? 'pulse 2s infinite' : 'none',
          }}
        />

        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontFamily: 'monospace', fontSize: 20, fontWeight: 700 }}>{fmtMs(totalMs, 'clock')}</span>
            {isRunning && <Tag color="success" style={{ fontSize: 10, fontWeight: 700 }}>RUNNING</Tag>}
          </div>
          {sessions.length > 0 && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {sessions.length} session{sessions.length !== 1 ? 's' : ''} · {fmtMs(task?.totalTrackedMs || 0, 'compact')} total
            </Text>
          )}
        </div>

        <Button
          type={isRunning ? 'default' : 'primary'}
          danger={isRunning}
          icon={isRunning ? <StopSquareIcon /> : <PlayCircleFilled />}
          loading={isStarting || isStopping}
          onClick={() => isRunning ? stopTimer({ id: taskId }) : startTimer(taskId)}
        >
          {isRunning ? 'Stop' : 'Start'}
        </Button>
      </div>

      {sessions.length > 0 && (
        <>
          <button
            onClick={() => setShowSessions((v) => !v)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 16px', fontSize: 12, fontWeight: 500, color: '#6b6155',
              borderTop: '1px solid rgba(28,25,23,0.08)', background: 'none', border: 'none', cursor: 'pointer',
            }}
          >
            <span>Time Log ({sessions.length})</span>
            {showSessions ? <CaretUpOutlined /> : <CaretDownOutlined />}
          </button>

          {showSessions && (
            <div style={{ maxHeight: 208, overflowY: 'auto' }}>
              {[...sessions].reverse().map((s, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 16px', borderTop: '1px solid rgba(28,25,23,0.06)',
                  }}
                >
                  <div>
                    <Text strong style={{ fontSize: 12, fontFamily: 'monospace', display: 'block' }}>
                      {fmtMs(s.durationMs, 'compact')}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {s.startedAt ? format(new Date(s.startedAt), 'dd MMM, hh:mm a') : ''}
                      {s.stoppedAt ? ` → ${format(new Date(s.stoppedAt), 'hh:mm a')}` : ''}
                    </Text>
                    {s.note && <Text type="secondary" italic style={{ fontSize: 11, display: 'block' }}>{s.note}</Text>}
                  </div>
                  <ClockCircleOutlined style={{ color: '#d1d5db', flexShrink: 0 }} />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
