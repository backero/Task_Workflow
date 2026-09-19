import {createApi} from '@reduxjs/toolkit/query/react';
import type {BaseQueryFn} from '@reduxjs/toolkit/query/react';
import type {AxiosError, AxiosRequestConfig} from 'axios';

import {ApiError} from '../api/httpClient';
import httpClient from '../api/httpClient';

interface AxiosBaseQueryError {
  status: number;
  data: {code: string; message: string};
}

/** RTK Query base query backed by the shared Axios client (api/httpClient.ts)
 * — mirrors apps/admin-web/src/store/apiSlice.ts. */
const axiosBaseQuery = (): BaseQueryFn<AxiosRequestConfig, unknown, AxiosBaseQueryError> => async config => {
  try {
    const result = await httpClient.request(config);
    return {data: result.data};
  } catch (err) {
    if (err instanceof ApiError) {
      return {error: {status: err.status, data: {code: err.code, message: err.message}}};
    }
    const axiosErr = err as AxiosError;
    return {error: {status: axiosErr.response?.status ?? 0, data: {code: 'unknown_error', message: axiosErr.message}}};
  }
};

export const apiSlice = createApi({
  reducerPath: 'api',
  baseQuery: axiosBaseQuery(),
  tagTypes: ['Attendance'],
  endpoints: () => ({}),
});
