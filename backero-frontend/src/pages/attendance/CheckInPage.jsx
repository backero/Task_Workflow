import React, { useState, useEffect } from 'react';
import { Button, Card, Space, message } from 'antd';
import { CheckCircleOutlined, EnvironmentOutlined, StopOutlined } from '@ant-design/icons';
import { api } from '../../api';
import './CheckInPage.css';

export default function CheckInPage() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('not-checked-in');
  const [checkInTime, setCheckInTime] = useState(null);
  const [hours, setHours] = useState(0);

  useEffect(() => {
    fetchStatus();
    const timer = setInterval(() => {
      if (checkInTime) {
        const diff = (Date.now() - new Date(checkInTime)) / (1000 * 60 * 60);
        setHours(parseFloat(diff.toFixed(2)));
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [checkInTime]);

  const fetchStatus = async () => {
    try {
      const res = await api.get('/attendance/today-status');
      if (res.data.status === 'checked-in') {
        setStatus('checked-in');
        setCheckInTime(res.data.checkInTime);
      } else if (res.data.status === 'checked-out') {
        setStatus('checked-out');
        setHours(res.data.hoursWorked || 0);
      }
    } catch (err) {
      console.log('Status fetch error - using default');
    }
  };

  const handleCheckIn = async () => {
    setLoading(true);
    try {
      await api.post('/attendance/check-in', {
        latitude: 11.0084,
        longitude: 76.8511,
        address: 'Office'
      });
      message.success('Checked in!');
      fetchStatus();
    } catch (err) {
      message.error('Check-in failed');
    } finally {
      setLoading(false);
    }
  };

  const handleCheckOut = async () => {
    setLoading(true);
    try {
      await api.post('/attendance/check-out', {
        latitude: 11.0084,
        longitude: 76.8511,
        address: 'Office'
      });
      message.success('Checked out!');
      fetchStatus();
    } catch (err) {
      message.error('Check-out failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="check-in-page">
      <h1 style={{ textAlign: 'center', marginBottom: 30 }}>Attendance Check-In</h1>

      <Card className="check-in-card">
        <Space direction="vertical" style={{ width: '100%', textAlign: 'center' }}>
          {status === 'not-checked-in' && (
            <>
              <h2>Good Morning! 🌅</h2>
              <p style={{ color: '#999' }}>Not checked in yet</p>
              <Button
                type="primary"
                size="large"
                icon={<CheckCircleOutlined />}
                onClick={handleCheckIn}
                loading={loading}
                style={{ width: '100%', height: 50, fontSize: 16 }}
              >
                Check In
              </Button>
            </>
          )}

          {status === 'checked-in' && (
            <>
              <h2 style={{ color: '#52c41a' }}>✓ Clocked In</h2>
              <div style={{ fontSize: 32, fontWeight: 'bold', color: '#52c41a' }}>
                {hours.toFixed(2)} hours
              </div>
              <Button
                type="primary"
                danger
                size="large"
                icon={<StopOutlined />}
                onClick={handleCheckOut}
                loading={loading}
                style={{ width: '100%', height: 50, fontSize: 16, marginTop: 20 }}
              >
                Check Out
              </Button>
            </>
          )}

          {status === 'checked-out' && (
            <>
              <h2 style={{ color: '#1890ff' }}>🎉 Great Work!</h2>
              <div style={{ fontSize: 28, fontWeight: 'bold', color: '#52c41a' }}>
                {hours.toFixed(2)} hours worked
              </div>
            </>
          )}

          <div style={{ fontSize: 12, color: '#999', marginTop: 15 }}>
            <EnvironmentOutlined /> Office
          </div>
        </Space>
      </Card>
    </div>
  );
}
