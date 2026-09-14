import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Typography } from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import { useTaskTimer } from '../../store/useTaskTimer';

const { Text } = Typography;

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
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!active?.startedAt) { setElapsed(0); return; }
    const base = new Date(active.startedAt).getTime();
    const baseTotal = active.totalTrackedMs || 0;
    const tick = () => setElapsed(baseTotal + (Date.now() - base));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [active?.startedAt, active?.totalTrackedMs]);

  useEffect(() => { setDismissed(false); }, [active?.taskId]);

  if (!active || dismissed) return null;

  return (
    <div
      style={{
        position: 'fixed', bottom: 20, right: 20, zIndex: 40,
        display: 'flex', alignItems: 'center', gap: 12,
        background: '#1c1917', color: '#fff', borderRadius: 16,
        padding: '10px 14px', boxShadow: '0 16px 48px rgba(0,0,0,0.35)',
        border: '1px solid rgba(255,255,255,0.1)',
      }}
    >
      <span
        style={{
          width: 8, height: 8, borderRadius: '50%', background: '#22c55e', flexShrink: 0,
          boxShadow: '0 0 0 0 rgba(34,197,94,0.6)', animation: 'pulse 2s infinite',
        }}
      />

      <button
        onClick={() => navigate(`/workflow/${active.taskId}`)}
        style={{ background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', minWidth: 0, flex: 1 }}
      >
        <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, display: 'block' }} ellipsis>
          {active.title}
        </Text>
        <Text style={{ color: '#fff', fontFamily: 'monospace', fontWeight: 700, fontSize: 15, display: 'block' }}>
          {fmtMs(elapsed)}
        </Text>
      </button>

      <Button
        size="small"
        danger
        ghost
        loading={isStopping}
        onClick={() => stopTimer({ id: active.taskId?.toString() })}
        style={{ flexShrink: 0 }}
      >
        Stop
      </Button>

      <button
        onClick={(e) => { e.stopPropagation(); setDismissed(true); }}
        style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', flexShrink: 0 }}
      >
        <CloseOutlined style={{ fontSize: 12 }} />
      </button>
    </div>
  );
}
