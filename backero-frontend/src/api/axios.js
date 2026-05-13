import axios from 'axios';
import { useAuthStore } from '../store/useAuthStore';
import toast from 'react-hot-toast';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  withCredentials: true,
  timeout: 30000,
});

// Attach token
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Debounce 429 toast so it only shows once every 30 s
let last429Toast = 0;
const show429Toast = () => {
  const now = Date.now();
  if (now - last429Toast > 30000) {
    last429Toast = now;
    toast('Syncing data… (high traffic, retrying shortly)', {
      icon: '⏳',
      duration: 4000,
      style: { background: '#fffbeb', color: '#92400e' },
    });
  }
};

// Handle 401 → refresh token, 429 → retry with backoff
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) prom.reject(error);
    else prom.resolve(token);
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;

    // 429 — rate limited: wait for Retry-After header or 60 s, then retry once
    if (error.response?.status === 429 && !original._retried429) {
      show429Toast();
      original._retried429 = true;
      const retryAfter = parseInt(error.response.headers['retry-after'] || '10', 10);
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      return api(original);
    }

    // 401 — try token refresh
    if (error.response?.status === 401 && !original._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            original.headers.Authorization = `Bearer ${token}`;
            return api(original);
          })
          .catch(Promise.reject.bind(Promise));
      }

      original._retry = true;
      isRefreshing = true;

      try {
        const res = await axios.post('/api/auth/refresh', {}, {
          withCredentials: true,
          baseURL: import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:5000',
        });
        const { accessToken } = res.data;
        useAuthStore.getState().setToken(accessToken);
        api.defaults.headers.common.Authorization = `Bearer ${accessToken}`;
        processQueue(null, accessToken);
        original.headers.Authorization = `Bearer ${accessToken}`;
        return api(original);
      } catch (refreshError) {
        processQueue(refreshError, null);
        useAuthStore.getState().logout();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default api;
