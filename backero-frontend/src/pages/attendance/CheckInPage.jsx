import React, { useState, useEffect } from 'react';
import { Button, Card, Space, message, Tag } from 'antd';
import { CheckCircleOutlined, PauseCircleOutlined, PlayCircleOutlined, LogoutOutlined } from '@ant-design/icons';
import { api } from '../../api';
import './CheckInPage.css';

export default function CheckInPage() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('not-punched');
  const [punches, setPunches] = useState([]);
  const [workHours, setWorkHours] = useState(0);
  const [breakHours, setBreakHours] = useState(0);

  useEffect(() => {
    fetchStatus();
    const timer = setInterval(fetchStatus, 5000);
    return () => clearInterval(timer);
  }, []);

  const fetchStatus = async () => {
    try {
      const res = await api.get('/attendance/punch/today');
      setStatus(res.data.status);
      setPunches(res.data.punches || []);
      setWorkHours(res.data.totalWorkHours || 0);
      setBreakHours(res.data.totalBreakHours || 0);
    } catch (err) {
      console.log('Status error');
    }
  };

  const handlePunch = async (punchType) => {
    setLoading(true);
    try {
      await api.post('/attendance/punch', {
        punchType,
        latitude: 11.0084,
        longitude: 76.8511,
        address: 'Office'
      });
      message.success(`${punchType.replace('-', ' ').toUpperCase()} recorded!`);
      setTimeout(fetchStatus, 500);
    } catch (err) {
      message.error(err.response?.data?.message || 'Punch failed');
    } finally {
      setLoading(false);
    }
  };

  const getPunchLabel = (punchType) => {
    const labels = {
      'punch-in': 'Punch In',
      'break-start': 'Start Break',
      'break-end': 'Return to Work',
      'punch-out': 'Punch Out'
    };
    return labels[punchType] || punchType;
  };

  const renderCard = () => {
    if (status === 'not-punched') {
      return (
        <Card className="check-in-card">
          <Space direction="vertical" style={{ width: '100%', textAlign: 'center' }}>
            <h2>Good Morning! 🌅</h2>
            <p style={{ color: '#999' }}>Ready to start your day?</p>
            <Button
              type="primary"
              size="large"
              icon={<CheckCircleOutlined />}
              onClick={() => handlePunch('punch-in')}
              loading={loading}
              style={{ width: '100%', height: 50, fontSize: 16 }}
            >
              Punch In
            </Button>
          </Space>
        </Card>
      );
    }

    if (status === 'office-in') {
      return (
        <Card className="check-in-card checked-in-card">
          <Space direction="vertical" style={{ width: '100%', textAlign: 'center' }}>
            <h2 style={{ color: '#52c41a' }}>✓ Clocked In</h2>
            <div style={{ fontSize: 32, fontWeight: 'bold', color: '#52c41a' }}>
              {workHours.toFixed(2)} hrs
            </div>
            {breakHours > 0 && (
              <div style={{ color: '#666', fontSize: 14 }}>
                Break: {breakHours.toFixed(2)} hrs
              </div>
            )}
            <Space style={{ width: '100%', justifyContent: 'center', marginTop: 20 }}>
              <Button
                type="dashed"
                icon={<PauseCircleOutlined />}
                onClick={() => handlePunch('break-start')}
                loading={loading}
              >
                Take Break
              </Button>
              <Button
                type="primary"
                danger
                icon={<LogoutOutlined />}
                onClick={() => handlePunch('punch-out')}
                loading={loading}
              >
                Punch Out
              </Button>
            </Space>
          </Space>
        </Card>
      );
    }

    if (status === 'on-break') {
      return (
        <Card className="check-in-card on-break-card">
          <Space direction="vertical" style={{ width: '100%', textAlign: 'center' }}>
            <h2 style={{ color: '#faad14' }}>☕ On Break</h2>
            <p style={{ color: '#666' }}>Take your time, we'll be here when you get back</p>
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              onClick={() => handlePunch('break-end')}
              loading={loading}
              style={{ width: '100%', height: 50, fontSize: 16 }}
            >
              Back to Work
            </Button>
          </Space>
        </Card>
      );
    }

    if (status === 'office-out') {
      return (
        <Card className="check-in-card checked-out-card">
          <Space direction="vertical" style={{ width: '100%', textAlign: 'center' }}>
            <h2 style={{ color: '#1890ff' }}>🎉 Great Work!</h2>
            <Tag color="blue">Punched Out</Tag>
            <div style={{ fontSize: 28, fontWeight: 'bold', color: '#52c41a', marginTop: 15 }}>
              {workHours.toFixed(2)} hours worked
            </div>
            {breakHours > 0 && (
              <div style={{ color: '#666', fontSize: 14 }}>
                Break time: {breakHours.toFixed(2)} hours
              </div>
            )}
          </Space>
        </Card>
      );
    }
  };

  return (
    <div className="check-in-page">
      <h1 style={{ textAlign: 'center', marginBottom: 30 }}>Daily Attendance</h1>

      {renderCard()}

      {punches.length > 0 && (
        <Card style={{ marginTop: 30 }}>
          <h3>Today's Punches</h3>
          <Space direction="vertical" style={{ width: '100%' }}>
            {punches.map((punch, idx) => (
              <div key={idx} style={{ padding: 10, borderLeft: '3px solid #667eea', paddingLeft: 15 }}>
                <div style={{ fontWeight: 'bold' }}>
                  {getPunchLabel(punch.punchType)}
                </div>
                <div style={{ color: '#666', fontSize: 12 }}>
                  {new Date(punch.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </div>
              </div>
            ))}
          </Space>
        </Card>
      )}
    </div>
  );
}
