/**
 * RTK Query base query backed by the existing fetch-based client
 * (api/client.ts) — reuses its token-attachment/401-refresh-retry logic
 * unchanged, same as apps/admin-web and apps/employee-web wrap their own
 * Axios clients. Endpoint modules (store/attendanceApi.ts, etc.) inject
 * into this via `apiSlice.injectEndpoints()`.
 */
import {createApi} from '@reduxjs/toolkit/query/react';
import type {BaseQueryFn} from '@reduxjs/toolkit/query/react';

import {ApiError, apiRequest} from '../api/client';

interface ApiQueryArgs {
  url: string;
  method?: string;
  body?: unknown;
  // Mirrors AxiosRequestConfig['params'] (also `any`): each endpoint
  // module's own params interface (e.g. MyAttendanceParams) has named
  // optional string fields rather than an index signature, so TS won't
  // structurally match it against any Record<string, X> without this.
  params?: any;
}

interface RtkApiError {
  status: number;
  data: {code: string; message: string};
}

function buildUrl(url: string, params?: Record<string, unknown>): string {
  if (!params) return url;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `${url}?${query}` : url;
}

const fetchBaseQuery = (): BaseQueryFn<ApiQueryArgs, unknown, RtkApiError> => async ({url, method = 'GET', body, params}) => {
  try {
    const data = await apiRequest(buildUrl(url, params), {
      method,
      ...(body !== undefined ? {body: JSON.stringify(body)} : {}),
    });
    return {data};
  } catch (err) {
    if (err instanceof ApiError) {
      return {error: {status: err.status, data: {code: err.code, message: err.message}}};
    }
    return {
      error: {status: 0, data: {code: 'unknown_error', message: err instanceof Error ? err.message : 'Unknown error'}},
    };
  }
};

export const apiSlice = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery(),
  tagTypes: ['Attendance', 'Employee'],
  endpoints: () => ({}),
});
