import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Form, Input, Segmented, Typography, message } from 'antd';
import { LockOutlined, MailOutlined, UserOutlined, BankOutlined } from '@ant-design/icons';
import workflowApi from '../../api/workflowApi';
import { useWorkflowAuthStore } from '../../store/useWorkflowAuthStore';
import { brand } from '../../theme/workflowTheme';

const { Title, Text } = Typography;

export default function WorkflowLogin() {
  const [mode, setMode] = useState('login');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const setAuth = useWorkflowAuthStore((s) => s.setAuth);

  const handleLogin = async ({ email, password }) => {
    setLoading(true);
    try {
      const { data } = await workflowApi.post('/workflow/auth/login', { email, password });
      const { data: me } = await workflowApi.get('/workflow/auth/me', {
        headers: { Authorization: `Bearer ${data.access_token}` },
      });
      setAuth(me, null, data.access_token, data.refresh_token);
      navigate('/workflow-v2/kanban');
    } catch (err) {
      message.error(err.response?.data?.error?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (values) => {
    setLoading(true);
    try {
      const { data } = await workflowApi.post('/workflow/auth/register', {
        organization_name: values.organization_name,
        first_name: values.first_name,
        last_name: values.last_name,
        email: values.email,
        phone: values.phone || null,
        password: values.password,
      });
      setAuth(data.user, data.organization, data.access_token, data.refresh_token);
      message.success('Organization created!');
      navigate('/workflow-v2/kanban');
    } catch (err) {
      message.error(err.response?.data?.error?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: brand.page,
      }}
    >
      <Card style={{ width: 420, borderRadius: 18 }} styles={{ body: { padding: 32 } }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div
            style={{
              width: 48,
              height: 48,
              margin: '0 auto 12px',
              borderRadius: 12,
              background: brand.gradient,
            }}
          />
          <Title level={3} style={{ marginBottom: 0 }}>Backero Workflow</Title>
          <Text type="secondary">New FastAPI backend — Phase 1 preview</Text>
        </div>

        <Segmented
          block
          value={mode}
          onChange={setMode}
          options={[
            { label: 'Sign in', value: 'login' },
            { label: 'Create organization', value: 'register' },
          ]}
          style={{ marginBottom: 20 }}
        />

        {mode === 'login' ? (
          <Form layout="vertical" onFinish={handleLogin} requiredMark={false}>
            <Form.Item name="email" rules={[{ required: true, message: 'Email required' }]}>
              <Input prefix={<MailOutlined />} placeholder="Email" size="large" />
            </Form.Item>
            <Form.Item name="password" rules={[{ required: true, message: 'Password required' }]}>
              <Input.Password prefix={<LockOutlined />} placeholder="Password" size="large" />
            </Form.Item>
            <Button type="primary" htmlType="submit" block size="large" loading={loading}>
              Sign in
            </Button>
          </Form>
        ) : (
          <Form layout="vertical" onFinish={handleRegister} requiredMark={false}>
            <Form.Item name="organization_name" rules={[{ required: true, message: 'Organization name required' }]}>
              <Input prefix={<BankOutlined />} placeholder="Organization name" size="large" />
            </Form.Item>
            <div style={{ display: 'flex', gap: 8 }}>
              <Form.Item name="first_name" style={{ flex: 1 }} rules={[{ required: true, message: 'Required' }]}>
                <Input prefix={<UserOutlined />} placeholder="First name" size="large" />
              </Form.Item>
              <Form.Item name="last_name" style={{ flex: 1 }} rules={[{ required: true, message: 'Required' }]}>
                <Input placeholder="Last name" size="large" />
              </Form.Item>
            </div>
            <Form.Item name="email" rules={[{ required: true, message: 'Email required' }]}>
              <Input prefix={<MailOutlined />} placeholder="Email" size="large" />
            </Form.Item>
            <Form.Item name="phone">
              <Input placeholder="Phone (optional)" size="large" />
            </Form.Item>
            <Form.Item
              name="password"
              rules={[{ required: true, min: 8, message: 'At least 8 characters' }]}
            >
              <Input.Password prefix={<LockOutlined />} placeholder="Password" size="large" />
            </Form.Item>
            <Button type="primary" htmlType="submit" block size="large" loading={loading}>
              Create organization &amp; admin account
            </Button>
          </Form>
        )}
      </Card>
    </div>
  );
}
