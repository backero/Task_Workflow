import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { DevicePhoneMobileIcon, ArrowLeftIcon } from '@heroicons/react/24/outline';
import { useAuthStore } from '../../store/useAuthStore';
import api from '../../api/axios';
import toast from 'react-hot-toast';

export default function Login() {
  const [step, setStep] = useState(1);
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
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
      const res = await api.post('/auth/send-login-otp', { phone: fullPhone() });
      const devOtp = res.data?._devOtp;
      setStep(2);
      setResendTimer(60);
      if (devOtp) {
        const digits = String(devOtp).split('');
        setOtp(digits);
        setTimeout(() => submitOTP(String(devOtp)), 300);
      } else {
        toast.success('OTP sent to your WhatsApp!');
        setTimeout(() => otpRefs.current[0]?.focus(), 100);
      }
    } catch (err) {
      if (!err.response) {
        toast.error('Cannot reach server. Please check your internet connection and try again.');
      } else {
        toast.error(err.response?.data?.message || 'Failed to send OTP');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleOtpInput = (value) => {
    const digits = value.replace(/\D/g, '').slice(0, 6);
    setOtp(digits.split('').concat(Array(6 - digits.length).fill('')));
    if (digits.length === 6 && !loading) submitOTP(digits);
  };

  const submitOTP = async (code) => {
    const otpCode = code || otp.join('');
    if (otpCode.length !== 6) return toast.error('Enter the complete 6-digit OTP');
    if (loading) return;
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
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
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
        toast.error('Cannot reach server. Please check your internet connection and try again.');
      } else {
        toast.error(err.response?.data?.message || 'Failed to resend OTP');
      }
    } finally {
      setLoading(false);
    }
  };

  // ── UI ────────────────────────────────────────────────────────────────────

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

        <div className="bg-white dark:bg-[#070c17] rounded-2xl p-8 shadow-modal overflow-hidden">
          <AnimatePresence mode="wait">
            {step === 1 ? (
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

                {/* Google OAuth */}
                <button
                  type="button"
                  onClick={() => { window.location.href = `${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}/auth/google`; }}
                  className="w-full flex items-center justify-center gap-3 px-4 py-2.5 rounded-lg border border-gray-300 dark:border-[#1b2e4a] bg-white dark:bg-[#0f1a2e] text-gray-700 dark:text-gray-200 font-medium text-sm hover:bg-gray-50 dark:hover:bg-[#1a2e4a] transition-colors mb-4"
                >
                  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Continue with Google
                </button>

                <div className="relative mb-4">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-200 dark:border-[#1b2e4a]" />
                  </div>
                  <div className="relative flex justify-center">
                    <span className="bg-white dark:bg-[#070c17] px-3 text-xs text-gray-400">or sign in with OTP</span>
                  </div>
                </div>

                <form onSubmit={handleSendOTP} className="space-y-4">
                  <div>
                    <label className="label">Mobile Number</label>
                    <div className="flex gap-2">
                      <span className="flex items-center px-3 bg-gray-100 dark:bg-[#0f1a2e] border border-gray-300 dark:border-[#1b2e4a] rounded-lg text-sm font-semibold text-gray-600 dark:text-gray-400 shrink-0 select-none">
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
                  onClick={() => { setStep(1); setOtp(['', '', '', '', '', '']); setResendTimer(0); }}
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

                <div className="mb-6">
                  <input
                    ref={(el) => (otpRefs.current[0] = el)}
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    autoComplete="one-time-code"
                    value={otp.join('')}
                    onChange={(e) => handleOtpInput(e.target.value)}
                    placeholder="Enter 6-digit OTP"
                    autoFocus
                    className="input w-full text-center text-2xl font-bold tracking-[0.5em] py-3"
                  />
                </div>

                <button
                  onClick={() => submitOTP(otp.join(''))}
                  disabled={loading || otp.join('').length !== 6}
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
