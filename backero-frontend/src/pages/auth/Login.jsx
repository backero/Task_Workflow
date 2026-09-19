import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Divider, Form, Input, Typography } from 'antd';
import { LockOutlined, MailOutlined } from '@ant-design/icons';
import { useAuthStore } from '../../store/useAuthStore';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import AuthLayout from '../../components/auth/AuthLayout';

const { Title, Text } = Typography;

export default function Login() {
  const [loading, setLoading] = useState(false);
  const { setAuth } = useAuthStore();
  const navigate = useNavigate();

  const handleLogin = async ({ email, password }) => {
    setLoading(true);
    try {
      const res = await api.post('/auth/login', { email, password });
      const { accessToken, user, organization } = res.data;
      setAuth(user, accessToken, organization);
      toast.success(`Welcome back, ${user.firstName}!`);
      navigate('/');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout maxWidth={384}>
      <Title level={3} style={{ marginBottom: 2 }}>Welcome back</Title>
      <Text type="secondary">Sign in to continue to your workspace</Text>

      <Button
        block
        size="large"
        style={{ marginTop: 24, marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}
        onClick={() => {
          window.location.href = `${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}/auth/google`;
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
        </svg>
        Continue with Google
      </Button>

      <Divider plain>
        <Text type="secondary" style={{ fontSize: 12 }}>or sign in with email</Text>
      </Divider>

      <Form layout="vertical" onFinish={handleLogin} requiredMark={false} autoComplete="off">
        <Form.Item name="email" label="Email" rules={[{ required: true, message: 'Enter your email' }]}>
          <Input prefix={<MailOutlined />} placeholder="you@company.com" size="large" autoFocus autoComplete="off" id="login-email-field" name="login-email-field" />
        </Form.Item>
        <Form.Item
          name="password"
          label="Password"
          style={{ marginBottom: 8 }}
          rules={[{ required: true, message: 'Enter your password' }]}
        >
          <Input.Password prefix={<LockOutlined />} placeholder="••••••••" size="large" autoComplete="new-password" id="login-password-field" name="login-password-field" />
        </Form.Item>
        <div style={{ textAlign: 'right', marginBottom: 16 }}>
          <Link to="/forgot-password" style={{ fontSize: 13, fontWeight: 500 }}>Forgot password?</Link>
        </div>
        <Button type="primary" htmlType="submit" block size="large" loading={loading}>
          Sign in
        </Button>
      </Form>
    </AuthLayout>
  );
}
