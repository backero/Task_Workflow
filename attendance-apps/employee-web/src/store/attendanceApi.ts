import type {AttendanceRecord} from '../types/models';
import {apiSlice} from './apiSlice';
import {mapAttendance} from '../api/nodeAdapters';

export interface MyAttendanceParams {
  date_from?: string;
  date_to?: string;
}

interface NodeMyAttendanceResponse {
  attendance: Parameters<typeof mapAttendance>[0][];
}

interface NodePunchResponse {
  attendance: Parameters<typeof mapAttendance>[0];
  punched: 'CHECK_IN' | 'CHECK_OUT';
}

export const attendanceApi = apiSlice.injectEndpoints({
  endpoints: builder => ({
    getMyAttendance: builder.query<AttendanceRecord[], MyAttendanceParams>({
      query: params => ({url: '/attendance/me', method: 'GET', params}),
      transformResponse: (res: NodeMyAttendanceResponse) => res.attendance.map(mapAttendance),
      providesTags: ['Attendance'],
    }),
    punchAttendance: builder.mutation<{attendance: AttendanceRecord; punched: 'CHECK_IN' | 'CHECK_OUT'}, void>({
      query: () => ({url: '/attendance/punch', method: 'POST'}),
      transformResponse: (res: NodePunchResponse) => ({attendance: mapAttendance(res.attendance), punched: res.punched}),
      invalidatesTags: ['Attendance'],
    }),
  }),
});

export const {useGetMyAttendanceQuery, usePunchAttendanceMutation} = attendanceApi;
