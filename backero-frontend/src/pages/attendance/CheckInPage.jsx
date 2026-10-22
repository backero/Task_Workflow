import React, { useState, useEffect } from 'react';
import { Button, Card, Space, Spin, Tag, Timeline, message, Modal } from 'antd';
import { ClockCircleOutlined, EnvironmentOutlined, CheckCircleOutlined, StopOutlined } from '@ant-design/icons';
import { api } from '../../api';
import './CheckInPage.css';

export default function CheckInPage() {
  const [loading, setLoading] = useState(false);
  const [todayStatus, setTodayStatus] = useState(null);
  const [location, setLocation] = useState(null);
  const [address, setAddress] = useState('Getting location...');
  const [history, setHistory] = useState([]);
  const [elapsedHours, setElapsedHours] = useState(0);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setLocation({ latitude, longitude });
          getAddressFromCoordinates(latitude, longitude);
        },
        (error) => {
          message.error('Could not get location');
          setAddress('Location denied');
        }
      );
    }
  }, []);

  useEffect(() => {
    fetchTodayStatus();
    fetchHistory();
  }, []);

  useEffect(() => {
    if (todayStatus?.status === 'checked-in' && todayStatus?.checkInTime) {
      const interval = setInterval(() => {
        const now = new Date();
        const checkInTime = new Date(todayStatus.checkInTime);
        const diffMs = now - checkInTime;
        const hours = (diffMs / (1000 * 60 * 60)).toFixed(2);
        setElapsedHours(parseFloat(hours));
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [todayStatus]);

  const getAddressFromCoordinates = async (lat, lng) => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`
      );
      const data = await response.json();
      setAddress(data.address?.city || data.address?.town || 'Current Location');
    } catch (error) {
      setAddress('Current Location');
    }
  };

  const fetchTodayStatus = async () => {
    try {
      const response = await api.get('/attendance/today-status');
      setTodayStatus(response.data);
    } catch (error) {
      console.error('Error:', error.message);
      setTodayStatus({ status: 'not-checked-in', message: 'Ready to check in' });
    }
  };

  const fetchHistory = async () => {
    try {
      const response = await api.get('/attendance/history', { params: { days: 7 } });
      setHistory(response.data.logs || []);
    } catch (error) {
      setHistory([]);
    }
  };

  const handleCheckIn = async () => {
    if (!location) {
      message.error('Location not available');
      return;
    }
    setLoading(true);
    try {
      await api.post('/attendance/check-in', {
        latitude: location.latitude,
        longitude: location.longitude,
        address
      });
      message.success('Checked in!');
      setTimeout(() => fetchTodayStatus(), 500);
    } catch (error) {
      message.error(error.response?.data?.message || 'Check-in failed');
    } finally {
      setLoading(false);
    }
  };

  const handleCheckOut = async () => {
    if (!location) {
      message.error('Location not available');
      return;
    }
    Modal.confirm({
      title: 'Check Out?',
      content: `Hours: ${elapsedHours.toFixed(2)}`,
      onOk: async () => {
        setLoading(true);
        try {
          await api.post('/attendance/check-out', {
            latitude: location.latitude,
            longitude: location.longitude,
            address
          });
          message.success('Checked out!');
          setTimeout(() => {
            fetchTodayStatus();
            fetchHistory();
          }, 500);
        } catch (error) {
          message.error(error.response?.data?.message || 'Check-out failed');
        } finally {
          setLoading(false);
        }
      }
    });
  };

  const renderTodayCard = () => {
    if (!todayStatus) return null;

    if (todayStatus.status === 'not-checked-in') {
      return (
        <Card className="check-in-card">
          <Space direction="vertical" style={{ width: '100%', textAlign: 'center' }}>
            <h2>Good Morning! 🌅</h2>
            <p style={{ color: '#999', marginBottom: 20 }}>Not checked in</p>
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
            <div style={{ fontSize: 12, color: '#999' }}>
              <EnvironmentOutlined /> {address}
            </div>
          </Space>
        </Card>
      );
    }

    if (todayStatus.status === 'checked-in') {
      const checkInTime = new Date(todayStatus.checkInTime);
      const displayHours = elapsedHours || todayStatus.hoursWorked || 0;

      return (
        <Card className="check-in-card checked-in-card">
          <Space direction="vertical" style={{ width: '100%', textAlign: 'center' }}>
            <h2 style={{ color: '#52c41a' }}>✓ Clocked In</h2>
            <div style={{ fontSize: 32, fontWeight: 'bold', color: '#52c41a', marginTop: 10 }}>
              {displayHours.toFixed(2)} hours
            </div>
            <div style={{ color: '#666', marginTop: 10, fontSize: 14 }}>
              Started at {checkInTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
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
            <div style={{ fontSize: 12, color: '#999', marginTop: 8 }}>
              <EnvironmentOutlined /> {address}
            </div>
          </Space>
        </Card>
      );
    }

    if (todayStatus.status === 'checked-out') {
      const checkInTime = new Date(todayStatus.checkInTime);
      const checkOutTime = new Date(todayStatus.checkOutTime);

      return (
        <Card className="check-in-card checked-out-card">
          <Space direction="vertical" style={{ width: '100%', textAlign: 'center' }}>
            <h2 style={{ color: '#1890ff' }}>🎉 Great Work!</h2>
            <Tag color="blue">✓ Checked Out</Tag>
            <div style={{ fontSize: 28, fontWeight: 'bold', color: '#52c41a', marginTop: 15 }}>
              {todayStatus.hoursWorked?.toFixed(2)} hours
            </div>
            <div style={{ color: '#666', marginTop: 15, fontSize: 14 }}>
              <div>In: {checkInTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</div>
              <div>Out: {checkOutTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</div>
            </div>
          </Space>
        </Card>
      );
    }
  };

  return (
    <div className="check-in-page">
      <h1 style={{ textAlign: 'center', marginBottom: 30 }}>Attendance Check-In</h1>

      {loading && <Spin tip="Processing..." style={{ textAlign: 'center' }} />}

      {renderTodayCard()}

      <Card style={{ marginTop: 30 }}>
        <h3>Last 7 Days</h3>
        {history.length > 0 ? (
          <Timeline
            items={history.map((log) => ({
              key: log._id,
              color: log.status === 'present' ? 'green' : 'orange',
              children: (
                <div>
                  <strong>{new Date(log.checkInTime).toLocaleDateString()}</strong>
                  <div style={{ color: '#666', fontSize: 12 }}>
                    In: {new Date(log.checkInTime).toLocaleTimeString()}
                    {log.checkOutTime && (
                      <>
                        {' | Out: '}
                        {new Date(log.checkOutTime).toLocaleTimeString()}
                      </>
                    )}
                  </div>
                  {log.hoursWorked && (
                    <div style={{ color: '#666', fontSize: 12 }}>
                      Hours: {log.hoursWorked.toFixed(2)}h
                    </div>
                  )}
                </div>
              )
            }))}
          />
        ) : (
          <p style={{ color: '#999' }}>No records</p>
        )}
      </Card>
    </div>
  );
}
