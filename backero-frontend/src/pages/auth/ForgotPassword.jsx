import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Mail } from 'lucide-react';
import { Button, Input, Typography } from 'antd';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import AuthLayout from '../../components/auth/AuthLayout';

const { Title, Text } = Typography;

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email) return toast.error('Enter your email address');
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout maxWidth={384}>
      {!sent ? (
        <>
          <Link to="/login" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#6b7280', marginBottom: 24, width: 'fit-content' }}>
            <ArrowLeft size={14} /> Back to sign in
          </Link>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#669c2c1f', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Mail size={18} color="#669c2c" />
            </div>
            <div>
              <Title level={4} style={{ marginBottom: 0 }}>Forgot password?</Title>
              <Text type="secondary" style={{ fontSize: 13 }}>We'll send a reset link to your email</Text>
            </div>
          </div>

          <form onSubmit={handleSubmit} autoComplete="off">
            <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Email address</Text>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" size="large" autoFocus autoComplete="off" id="forgot-email-field" name="forgot-email-field" style={{ marginBottom: 16 }} />
            <Button type="primary" htmlType="submit" block size="large" loading={loading} disabled={!email}>Send Reset Link</Button>
          </form>
        </>
      ) : (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} style={{ textAlign: 'center', padding: '16px 0' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#f6ffed', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <Mail size={28} color="#22c55e" />
          </div>
          <Title level={4} style={{ marginBottom: 8 }}>Check your email</Title>
          <Text type="secondary" style={{ fontSize: 13, display: 'block' }}>We sent a password reset link to</Text>
          <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 24 }}>{email}</Text>
          <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 24 }}>The link expires in 1 hour. If you don't see the email, check your spam folder.</Text>
          <Link to="/login"><Button type="primary">Back to sign in</Button></Link>
        </motion.div>
      )}
    </AuthLayout>
  );
}
