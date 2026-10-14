import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { CircleAlert } from 'lucide-react';
import { Button, Spin, Typography } from 'antd';
import AuthLayout from '../../components/auth/AuthLayout';

const { Title, Text } = Typography;

const ERROR_MESSAGES = {
  no_account: 'No Backero account found for this Google email. Contact your admin.',
  deactivated: 'Your account has been deactivated. Contact your admin.',
  no_email: 'Google did not share your email address. Try again.',
  auth_failed: 'Google sign-in failed. Please try again.',
  server_error: 'Server error during sign-in. Please try again.',
};

export default function AuthCallback() {
  const [searchParams] = useSearchParams();
  const { setAuth } = useAuthStore();
  const navigate = useNavigate();
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');
    const error = searchParams.get('error');

    if (error) {
      const msg = ERROR_MESSAGES[error] || ERROR_MESSAGES.auth_failed;
      setErrorMsg(msg);
      toast.error(msg);
      return;
    }

    if (!token) {
      setErrorMsg(ERROR_MESSAGES.auth_failed);
      return;
    }

    api.get('/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(({ data }) => {
        const { user, organization } = data;
        setAuth(user, token, organization);
        toast.success(`Welcome, ${user.firstName}!`);
        navigate('/', { replace: true });
      })
      .catch(() => {
        setErrorMsg(ERROR_MESSAGES.server_error);
        toast.error(ERROR_MESSAGES.server_error);
      });
  }, []);

  if (errorMsg) {
    return (
      <AuthLayout maxWidth={384}>
        <div style={{ textAlign: 'center' }}>
          <CircleAlert size={44} color="#ef4444" style={{ margin: '0 auto 16px' }} />
          <Title level={4} style={{ marginBottom: 8 }}>Sign-in Failed</Title>
          <Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 24 }}>{errorMsg}</Text>
          <Button type="primary" block onClick={() => navigate('/login', { replace: true })}>Back to Login</Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout maxWidth={384}>
      <div style={{ textAlign: 'center' }}>
        <Spin size="large" />
        <Text type="secondary" style={{ fontSize: 13, display: 'block', marginTop: 16 }}>Signing you in...</Text>
      </div>
    </AuthLayout>
  );
}
