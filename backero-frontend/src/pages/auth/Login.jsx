import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { DevicePhoneMobileIcon, ArrowLeftIcon, EnvelopeIcon, LockClosedIcon } from '@heroicons/react/24/outline';
import { useAuthStore } from '../../store/useAuthStore';
import api from '../../api/axios';
import toast from 'react-hot-toast';

export default function Login() {
  const [mode, setMode] = useState('otp'); // 'otp' | 'password'
  const [step, setStep] = useState(1);
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const otpRefs = useRef([]);
  const { setAuth } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (resendTimer <= 0) return;
    const t = setTimeout(() => setResendTimer((r) => r - 1), 1000);
    return () => clearTimeout(t);
  }, [resendTimer]);


  const fullPhone = () => `+91${phone}`;

  // ── OTP flow ──────────────────────────────────────────────────────────────

  const handleSendOTP = async (e) => {
    e.preventDefault();
    if (phone.length !== 10) return toast.error('Enter a valid 10-digit mobile number');
    setLoading(true);
    try {
      await api.post('/auth/send-login-otp', { phone: fullPhone() });
      setStep(2);
      setResendTimer(60);
      toast.success('OTP sent to your WhatsApp!');
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    } catch (err) {
      if (!err.response) {
        toast.error('Cannot reach server. Make sure the backend is running on port 5000.');
      } else {
        toast.error(err.response?.data?.message || 'Failed to send OTP');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (index, value) => {
    if (!/^\d*$/.test(value)) return;
    const next = [...otp];
    next[index] = value.slice(-1);
    setOtp(next);
    if (value && index < 5) otpRefs.current[index + 1]?.focus();
    if (value && index === 5 && next.every((d) => d)) submitOTP(next.join(''));
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const submitOTP = async (code) => {
    const otpCode = code || otp.join('');
    if (otpCode.length !== 6) return toast.error('Enter the complete 6-digit OTP');
    setLoading(true);
    try {
      const res = await api.post('/auth/verify-login-otp', { phone: fullPhone(), otp: otpCode });
      const { accessToken, user, organization } = res.data;
      setAuth(user, accessToken, organization);
      toast.success(`Welcome back, ${user.firstName}!`);
      navigate('/');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Invalid OTP. Try again.');
      setOtp(['', '', '', '', '', '']);
      setTimeout(() => otpRefs.current[0]?.focus(), 50);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendTimer > 0) return;
    setLoading(true);
    try {
      const res = await api.post('/auth/send-login-otp', { phone: fullPhone() });
      const devOtp = res.data?._devOtp;
      setResendTimer(60);
      if (devOtp) {
        const digits = String(devOtp).split('');
        setOtp(digits);
        setTimeout(() => submitOTP(String(devOtp)), 300);
      } else {
        toast.success('OTP resent!');
        setOtp(['', '', '', '', '', '']);
        setTimeout(() => otpRefs.current[0]?.focus(), 50);
      }
    } catch (err) {
      if (!err.response) {
        toast.error('Cannot reach server. Make sure the backend is running on port 5000.');
      } else {
        toast.error(err.response?.data?.message || 'Failed to resend OTP');
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Password flow ─────────────────────────────────────────────────────────

  const handlePasswordLogin = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) return toast.error('Enter email and password');
    setLoading(true);
    try {
      const res = await api.post('/auth/login', { email: email.trim().toLowerCase(), password });
      const { accessToken, user, organization } = res.data;
      setAuth(user, accessToken, organization);
      toast.success(`Welcome back, ${user.firstName}!`);
      navigate('/');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Invalid credentials.');
    } finally {
      setLoading(false);
    }
  };

  // ── Shared UI ─────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-900 to-brand-950 p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <div className="inline-flex w-16 h-16 rounded-2xl gradient-brand items-center justify-center mb-4">
            <span className="text-white font-bold text-2xl">B</span>
          </div>
          <h1 className="text-3xl font-bold text-white">Backero</h1>
          <p className="text-gray-400 mt-1">Enterprise Operations Platform</p>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-modal overflow-hidden">
          {/* Mode toggle */}
          <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl mb-6">
            <button
              onClick={() => { setMode('otp'); setStep(1); }}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${mode === 'otp' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
            >
              <DevicePhoneMobileIcon className="w-4 h-4 inline mr-1.5" />
              OTP Login
            </button>
            <button
              onClick={() => setMode('password')}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${mode === 'password' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
            >
              <LockClosedIcon className="w-4 h-4 inline mr-1.5" />
              Password Login
            </button>
          </div>

          <AnimatePresence mode="wait">
            {mode === 'password' ? (
              <motion.div
                key="password-mode"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.2 }}
              >
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center shrink-0">
                    <EnvelopeIcon className="w-5 h-5 text-brand-600" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">Admin Sign in</h2>
                    <p className="text-sm text-gray-500">Use your registered email and password</p>
                  </div>
                </div>

                <form onSubmit={handlePasswordLogin} className="space-y-4">
                  <div>
                    <label className="label">Email Address</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="input"
                      placeholder="admin@company.com"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="label">Password</label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="input"
                      placeholder="••••••••"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading || !email || !password}
                    className="btn-primary w-full justify-center py-2.5 mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Signing in...
                      </span>
                    ) : 'Sign In'}
                  </button>
                </form>
              </motion.div>
            ) : step === 1 ? (
              <motion.div
                key="phone-step"
                initial={{ opacity: 0, x: -24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.2 }}
              >
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center shrink-0">
                    <DevicePhoneMobileIcon className="w-5 h-5 text-brand-600" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">Sign in with OTP</h2>
                    <p className="text-sm text-gray-500">Enter your registered mobile number</p>
                  </div>
                </div>

                <form onSubmit={handleSendOTP} className="space-y-4">
                  <div>
                    <label className="label">Mobile Number</label>
                    <div className="flex gap-2">
                      <span className="flex items-center px-3 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-semibold text-gray-600 dark:text-gray-400 shrink-0 select-none">
                        +91
                      </span>
                      <input
                        type="tel"
                        inputMode="numeric"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                        className="input flex-1"
                        placeholder="98765 43210"
                        autoFocus
                        maxLength={10}
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading || phone.length !== 10}
                    className="btn-primary w-full justify-center py-2.5 mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Sending OTP...
                      </span>
                    ) : 'Send OTP'}
                  </button>
                </form>
              </motion.div>
            ) : (
              <motion.div
                key="otp-step"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 24 }}
                transition={{ duration: 0.2 }}
              >
                <button
                  onClick={() => { setStep(1); setOtp(['', '', '', '', '', '']); }}
                  className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 mb-6 transition-colors"
                >
                  <ArrowLeftIcon className="w-4 h-4" />
                  Change number
                </button>

                <div className="mb-6">
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">Enter OTP</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Sent to{' '}
                    <span className="font-semibold text-gray-700 dark:text-gray-300">
                      +91 {phone.slice(0, 5)} {phone.slice(5)}
                    </span>
                  </p>
                </div>

                <div className="flex gap-2 justify-between mb-6">
                  {otp.map((digit, i) => (
                    <input
                      key={i}
                      ref={(el) => (otpRefs.current[i] = el)}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpChange(i, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(i, e)}
                      className="w-11 h-13 text-center text-xl font-bold border-2 border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:focus:ring-brand-800 transition-all"
                      style={{ height: '3.25rem' }}
                    />
                  ))}
                </div>

                <button
                  onClick={() => submitOTP(otp.join(''))}
                  disabled={loading || otp.some((d) => !d)}
                  className="btn-primary w-full justify-center py-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Verifying...
                    </span>
                  ) : 'Verify & Sign in'}
                </button>

                <div className="text-center mt-4">
                  {resendTimer > 0 ? (
                    <p className="text-sm text-gray-500">
                      Resend OTP in{' '}
                      <span className="font-semibold text-brand-600">{resendTimer}s</span>
                    </p>
                  ) : (
                    <button
                      onClick={handleResend}
                      disabled={loading}
                      className="text-sm text-brand-600 hover:text-brand-700 font-medium transition-colors"
                    >
                      Resend OTP
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <p className="text-center text-gray-500 text-xs mt-6">
          Secured by Backero Enterprise Security
        </p>
      </motion.div>
    </div>
  );
}
