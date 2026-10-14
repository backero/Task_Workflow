/**
 * Axios client: injects the access token, transparently refreshes once on a
 * 401 and retries the original request, and normalizes the Node backend's
 * `{success: false, message}` error shape into a typed ApiError. Replaces
 * api/client.ts's fetch-based implementation — same behavior, different
 * transport. Mirrors apps/mobile/src/api/client.ts's design.
 *
 * `/auth/login` and `/auth/refresh` are excluded from the refresh-retry
 * branch — a failed login must never be misreported as "session expired"
 * (see docs/roadmap.md Phase 6 mobile lessons learned).
 */
import axios from 'axios';
import type {AxiosError, AxiosRequestConfig, InternalAxiosRequestConfig} from 'axios';

import {API_BASE_URL, API_V1_PREFIX} from '../config';
import {clearTokens, getAccessToken, getRefreshToken, notifySessionExpired, setTokens} from './tokenStore';

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

interface RetryableConfig extends InternalAxiosRequestConfig {
  _isRetry?: boolean;
}

const AUTH_ENDPOINTS = new Set(['/auth/login', '/auth/refresh']);

const httpClient = axios.create({
  baseURL: `${API_BASE_URL}${API_V1_PREFIX}`,
  headers: {'Content-Type': 'application/json'},
});

httpClient.interceptors.request.use(config => {
  const accessToken = getAccessToken();
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

let refreshPromise: Promise<boolean> | null = null;

interface NodeRefreshResponse {
  accessToken: string;
  refreshToken: string;
}

async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    return false;
  }
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const response = await axios.post<NodeRefreshResponse>(
          `${API_BASE_URL}${API_V1_PREFIX}/auth/refresh`,
          {refreshToken},
          {headers: {'Content-Type': 'application/json'}},
        );
        setTokens({
          access_token: response.data.accessToken,
          refresh_token: response.data.refreshToken,
          token_type: 'Bearer',
          expires_in: 0,
        });
        return true;
      } catch {
        return false;
      } finally {
        refreshPromise = null;
      }
    })();
  }
  return refreshPromise;
}

httpClient.interceptors.response.use(
  response => response,
  async (error: AxiosError<{success?: boolean; message?: string}>) => {
    const config = error.config as RetryableConfig | undefined;

    if (!error.response) {
      throw new ApiError(0, 'network_error', 'Network error — please check your connection.');
    }

    const {status} = error.response;
    const relativeUrl = config?.url ?? '';

    if (status === 401 && config && !config._isRetry && !AUTH_ENDPOINTS.has(relativeUrl)) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        config._isRetry = true;
        config.headers.Authorization = `Bearer ${getAccessToken()}`;
        return httpClient(config);
      }
      clearTokens();
      notifySessionExpired();
      throw new ApiError(401, 'unauthorized', 'Your session has expired. Please log in again.');
    }

    // Node backend has no error `code` field, just `{success: false, message}` — use the
    // HTTP status as the code so callers that branch on ApiError.code still have something.
    const message = error.response.data?.message ?? `Request failed with status ${status}.`;
    throw new ApiError(status, String(status), message);
  },
);

export async function apiRequest<T>(config: AxiosRequestConfig): Promise<T> {
  const response = await httpClient.request<T>(config);
  return response.data;
}

export default httpClient;
