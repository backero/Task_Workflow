import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore';
import api from '../../api/axios';
import toast from 'react-hot-toast';

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

    // Exchange token for full user profile
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-900 to-brand-950 p-4">
        <div className="bg-white dark:bg-[#070c17] rounded-2xl p-8 shadow-modal max-w-md w-full text-center">
          <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <span className="text-red-600 text-xl font-bold">!</span>
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Sign-in Failed</h2>
          <p className="text-gray-500 text-sm mb-6">{errorMsg}</p>
          <button
            onClick={() => navigate('/login', { replace: true })}
            className="btn-primary w-full justify-center py-2.5"
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-900 to-brand-950">
      <div className="text-center">
        <div className="w-10 h-10 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-400 text-sm">Signing you in...</p>
      </div>
    </div>
  );
}
