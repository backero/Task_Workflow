import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Lock } from 'lucide-react';
import { Button, Input, Typography } from 'antd';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import AuthLayout from '../../components/auth/AuthLayout';

const { Title, Text } = Typography;

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const navigate = useNavigate();

  if (!token) {
    return (
      <AuthLayout maxWidth={384}>
        <div style={{ textAlign: 'center' }}>
          <Text type="danger" strong style={{ display: 'block', marginBottom: 16 }}>Invalid or missing reset token.</Text>
          <Link to="/forgot-password"><Button type="primary">Request a new link</Button></Link>
        </div>
      </AuthLayout>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password.length < 8) return toast.error('Password must be at least 8 characters');
    if (password !== confirm) return toast.error('Passwords do not match');
    setLoading(true);
    try {
      await api.post('/auth/reset-password', { token, password });
      setDone(true);
      setTimeout(() => navigate('/login'), 3000);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Reset link is invalid or expired.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout maxWidth={384}>
      {!done ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#669c2c1f', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Lock size={18} color="#669c2c" />
            </div>
            <div>
              <Title level={4} style={{ marginBottom: 0 }}>Set new password</Title>
              <Text type="secondary" style={{ fontSize: 13 }}>Must be at least 8 characters</Text>
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>New Password</Text>
            <Input.Password value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" size="large" autoFocus autoComplete="new-password" style={{ marginBottom: 16 }} />

            <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Confirm Password</Text>
            <Input.Password value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="••••••••" size="large" autoComplete="new-password" status={confirm && password !== confirm ? 'error' : undefined} />
            {confirm && password !== confirm && <Text type="danger" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>Passwords do not match</Text>}

            <Button type="primary" htmlType="submit" block size="large" style={{ marginTop: 16 }} loading={loading} disabled={!password || !confirm || password !== confirm}>Reset Password</Button>
          </form>
        </>
      ) : (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} style={{ textAlign: 'center', padding: '16px 0' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#f6ffed', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <Lock size={28} color="#22c55e" />
          </div>
          <Title level={4} style={{ marginBottom: 8 }}>Password reset!</Title>
          <Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 24 }}>Your password has been updated. Redirecting to sign in...</Text>
          <Link to="/login"><Button type="primary">Sign in now</Button></Link>
        </motion.div>
      )}
    </AuthLayout>
  );
}
