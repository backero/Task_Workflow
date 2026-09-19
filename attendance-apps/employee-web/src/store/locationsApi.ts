import type {
  FieldSessionResponse,
  FieldSessionStartResponse,
  LocationBatchResponse,
  LocationPointPayload,
  SessionEndReason,
} from '../types/models';
import {apiSlice} from './apiSlice';

interface NodeStartSessionResponse {
  session: {id: string; employeeId: string; startedAt: string; locationIntervalSeconds: number};
}

interface NodeEndSessionResponse {
  session: {_id: string; employeeId: string; startedAt: string; endedAt: string | null; endReason: SessionEndReason | null};
}

export const locationsApi = apiSlice.injectEndpoints({
  endpoints: builder => ({
    startFieldSession: builder.mutation<FieldSessionStartResponse, void>({
      query: () => ({url: '/locations/sessions/start', method: 'POST'}),
      transformResponse: (res: NodeStartSessionResponse) => ({
        id: res.session.id,
        employee_id: res.session.employeeId,
        started_at: res.session.startedAt,
        location_interval_seconds: res.session.locationIntervalSeconds,
      }),
    }),
    endFieldSession: builder.mutation<FieldSessionResponse, {sessionId: string; reason?: SessionEndReason}>({
      query: ({sessionId, reason = 'MANUAL'}) => ({
        url: `/locations/sessions/${sessionId}/end`,
        method: 'POST',
        data: {reason},
      }),
      transformResponse: (res: NodeEndSessionResponse) => ({
        id: res.session._id,
        employee_id: res.session.employeeId,
        started_at: res.session.startedAt,
        ended_at: res.session.endedAt,
        end_reason: res.session.endReason,
      }),
    }),
    uploadLocationBatch: builder.mutation<LocationBatchResponse, {sessionId: string; points: LocationPointPayload[]}>({
      query: ({sessionId, points}) => ({
        url: '/locations/batch',
        method: 'POST',
        data: {session_id: sessionId, points},
      }),
    }),
  }),
});

export const {useStartFieldSessionMutation, useEndFieldSessionMutation, useUploadLocationBatchMutation} = locationsApi;
