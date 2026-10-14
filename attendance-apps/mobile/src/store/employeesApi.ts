import type {Employee} from '../types/models';
import {apiSlice} from './apiSlice';
import {mapEmployee} from '../api/nodeAdapters';

interface NodeEmployeeResponse {
  employee: Parameters<typeof mapEmployee>[0];
}

export const employeesApi = apiSlice.injectEndpoints({
  endpoints: builder => ({
    getMyEmployeeProfile: builder.query<Employee, void>({
      query: () => ({url: '/employees/me'}),
      transformResponse: (res: NodeEmployeeResponse) => mapEmployee(res.employee),
      providesTags: ['Employee'],
    }),
    // Deliberately narrower than the admin side's PATCH /employees/{id} —
    // an employee may only self-edit their own contact info (phone),
    // matching the backend's self-update permission model.
    updateMyEmployeeProfile: builder.mutation<Employee, {phone: string | null}>({
      query: updates => ({url: '/employees/me', method: 'PATCH', body: updates}),
      transformResponse: (res: NodeEmployeeResponse) => mapEmployee(res.employee),
      invalidatesTags: ['Employee'],
    }),
  }),
});

export const {useGetMyEmployeeProfileQuery, useUpdateMyEmployeeProfileMutation} = employeesApi;
