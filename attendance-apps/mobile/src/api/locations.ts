import type {
  FieldSessionResponse,
  FieldSessionStartResponse,
  LocationBatchResponse,
  LocationPointPayload,
  SessionEndReason,
} from '../types/models';
import {apiRequest} from './client';

interface NodeStartSessionResponse {
  session: {id: string; employeeId: string; startedAt: string; locationIntervalSeconds: number};
}

interface NodeEndSessionResponse {
  session: {_id: string; employeeId: string; startedAt: string; endedAt: string | null; endReason: SessionEndReason | null};
}

export async function startFieldSession(): Promise<FieldSessionStartResponse> {
  const res = await apiRequest<NodeStartSessionResponse>('/locations/sessions/start', {method: 'POST'});
  return {
    id: res.session.id,
    employee_id: res.session.employeeId,
    started_at: res.session.startedAt,
    location_interval_seconds: res.session.locationIntervalSeconds,
  };
}

export async function endFieldSession(
  sessionId: string,
  reason: SessionEndReason = 'MANUAL',
): Promise<FieldSessionResponse> {
  const res = await apiRequest<NodeEndSessionResponse>(`/locations/sessions/${sessionId}/end`, {
    method: 'POST',
    body: JSON.stringify({reason}),
  });
  return {
    id: res.session._id,
    employee_id: res.session.employeeId,
    started_at: res.session.startedAt,
    ended_at: res.session.endedAt,
    end_reason: res.session.endReason,
  };
}

export function uploadLocationBatch(
  sessionId: string,
  points: LocationPointPayload[],
): Promise<LocationBatchResponse> {
  return apiRequest<LocationBatchResponse>('/locations/batch', {
    method: 'POST',
    body: JSON.stringify({session_id: sessionId, points}),
  });
}
