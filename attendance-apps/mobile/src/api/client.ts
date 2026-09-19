/**
 * Fetch wrapper: injects the access token, transparently refreshes once on
 * a 401 and retries the original request, and normalizes the Node backend's
 * `{success: false, message}` error shape into a typed ApiError.
 */
import {API_BASE_URL, API_V1_PREFIX} from '../config';
import {clearTokens, getAccessToken, getRefreshToken, notifySessionExpired, setTokens} from './tokenStore';

interface NodeRefreshResponse {
  accessToken: string;
  refreshToken: string;
}

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function rawRequest(path: string, options: RequestInit): Promise<Response> {
  return fetch(`${API_BASE_URL}${API_V1_PREFIX}${path}`, options);
}

// Coalesces concurrent 401s into a single refresh call rather than firing
// one refresh-token rotation per in-flight request.
let refreshPromise: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    return false;
  }
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const response = await rawRequest('/auth/refresh', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({refreshToken}),
        });
        if (!response.ok) {
          return false;
        }
        const tokens = (await response.json()) as NodeRefreshResponse;
        await setTokens({access_token: tokens.accessToken, refresh_token: tokens.refreshToken});
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

export async function apiRequest<T>(path: string, options: RequestInit = {}, isRetry = false): Promise<T> {
  const accessToken = getAccessToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await rawRequest(path, {...options, headers});

  // /auth/login and /auth/refresh never carry a session to have "expired" —
  // a 401 here means bad credentials or an invalid/revoked refresh token,
  // not an access token that needs refreshing. Let the generic error path
  // below surface the backend's actual message instead of misreporting it
  // as a session timeout (and instead of recursively refreshing inside a
  // refresh call itself).
  const isAuthEndpoint = path === '/auth/login' || path === '/auth/refresh';

  if (response.status === 401 && !isRetry && !isAuthEndpoint) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return apiRequest<T>(path, options, true);
    }
    await clearTokens();
    notifySessionExpired();
    throw new ApiError(401, 'unauthorized', 'Your session has expired. Please log in again.');
  }

  if (!response.ok) {
    let message = `Request failed with status ${response.status}.`;
    try {
      const body = (await response.json()) as {success?: boolean; message?: string};
      message = body.message ?? message;
    } catch {
      // Response body wasn't JSON — keep the generic message.
    }
    // Node backend has no error `code` field, just `{success: false, message}` — use the
    // HTTP status as the code so callers that branch on ApiError.code still have something.
    throw new ApiError(response.status, String(response.status), message);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}
