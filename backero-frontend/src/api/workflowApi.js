// Axios client for the new backero-backend-py (FastAPI/Postgres) backend —
// separate from api/axios.js (the existing Node/Mongo backend), since the
// two backends are separate realms this phase (separate logins, snake_case
// response shapes, no `data` envelope). Mirrors axios.js's interceptor
// pattern (401 refresh-token retry queue) against the new backend's
// /workflow/auth/refresh endpoint.
import axios from 'axios';
import { useWorkflowAuthStore } from '../store/useWorkflowAuthStore';

const workflowApi = axios.create({
  baseURL: import.meta.env.VITE_WORKFLOW_API_URL || 'http://localhost:8010/api/v1',
  withCredentials: false,
});

workflowApi.interceptors.request.use((config) => {
  const token = useWorkflowAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let isRefreshing = false;
let pendingQueue = [];

workflowApi.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config, response } = error;
    if (response?.status !== 401 || config?._retried) {
      return Promise.reject(error);
    }

    const { refreshToken, setTokens, logout } = useWorkflowAuthStore.getState();
    if (!refreshToken) {
      logout();
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        pendingQueue.push({ resolve, reject, config });
      });
    }

    isRefreshing = true;
    config._retried = true;

    try {
      const { data } = await axios.post(
        `${workflowApi.defaults.baseURL}/workflow/auth/refresh`,
        { refresh_token: refreshToken }
      );
      setTokens(data.access_token, data.refresh_token);

      pendingQueue.forEach(({ resolve, config: queuedConfig }) => {
        queuedConfig.headers.Authorization = `Bearer ${data.access_token}`;
        resolve(workflowApi(queuedConfig));
      });
      pendingQueue = [];

      config.headers.Authorization = `Bearer ${data.access_token}`;
      return workflowApi(config);
    } catch (refreshError) {
      pendingQueue.forEach(({ reject: rejectQueued }) => rejectQueued(refreshError));
      pendingQueue = [];
      logout();
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);

export default workflowApi;
