import type {Holiday, WorkSchedule} from '../types/models';
import {apiSlice} from './apiSlice';
import {mapHoliday, mapWorkSchedule} from '../api/nodeAdapters';

interface NodeHolidaysResponse {
  holidays: Parameters<typeof mapHoliday>[0][];
}
interface NodeWorkSchedulesResponse {
  schedules: Parameters<typeof mapWorkSchedule>[0][];
}

export const holidaysApi = apiSlice.injectEndpoints({
  endpoints: builder => ({
    getHolidays: builder.query<Holiday[], void>({
      query: () => ({url: '/attendance/holidays'}),
      transformResponse: (res: NodeHolidaysResponse) => res.holidays.map(mapHoliday),
    }),
    getWorkSchedules: builder.query<WorkSchedule[], void>({
      query: () => ({url: '/attendance/work-schedule'}),
      transformResponse: (res: NodeWorkSchedulesResponse) => res.schedules.map(mapWorkSchedule),
    }),
  }),
});

export const {useGetHolidaysQuery, useGetWorkSchedulesQuery} = holidaysApi;
