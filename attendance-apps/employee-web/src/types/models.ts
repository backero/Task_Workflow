/**
 * Client-side mirrors of backend response schemas (backend/app/schemas/*).
 * Kept minimal — only the fields screens actually read — same convention as
 * apps/admin-web/src/types/models.ts and apps/mobile/src/types/models.ts.
 */

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface CurrentUser {
  id: string;
  email: string;
  role: string;
  permissions: string[];
}

export type EmployeeCategory = 'OFFICE' | 'FIELD';

export interface Employee {
  id: string;
  user_id: string | null;
  employee_code: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  department_id: string;
  designation_id: string;
  category: EmployeeCategory;
  date_of_joining: string;
  created_at: string;
  updated_at: string;
}

export type AttendanceStatus =
  | 'PRESENT'
  | 'ABSENT'
  | 'LATE'
  | 'HALF_DAY'
  | 'ON_LEAVE'
  | 'HOLIDAY'
  | 'WEEK_OFF'
  | 'MISSING_PUNCH'
  | 'INCOMPLETE';

export interface AttendanceRecord {
  id: string;
  employee_id: string;
  attendance_period_id: string;
  attendance_date: string;
  check_in: string | null;
  check_out: string | null;
  status: AttendanceStatus;
  is_corrected: boolean;
  correction_history: unknown[];
}

// Unused by employee-web today (no devices screen) — kept only so
// theme/statusColors.ts stays a literal, type-compatible duplicate of
// admin-web's copy.
export type DeviceStatus = 'ONLINE' | 'OFFLINE' | 'UNKNOWN';

// Must match the Node backend's LocationTrackingSession.endReason enum exactly
// (Mongoose rejects any other value with a 500 on session end).
export type SessionEndReason = 'MANUAL' | 'TIMEOUT' | 'APP_KILLED' | 'ADMIN_STOPPED';

export interface FieldSessionStartResponse {
  id: string;
  employee_id: string;
  started_at: string;
  location_interval_seconds: number;
}

export interface FieldSessionResponse {
  id: string;
  employee_id: string;
  started_at: string;
  ended_at: string | null;
  end_reason: SessionEndReason | null;
}

export interface LocationPointPayload {
  client_point_id: string;
  latitude: number;
  longitude: number;
  accuracy_meters: number | null;
  device_info: string | null;
  recorded_at: string;
}

export interface LocationBatchResponse {
  accepted_count: number;
  duplicate_count: number;
}

export interface Holiday {
  id: string;
  name: string;
  date: string;
  is_recurring_annually: boolean;
}

export interface WorkSchedule {
  id: string;
  week_off_days: number[];
  effective_from: string;
}
