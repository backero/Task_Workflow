/**
 * Maps the Node backend's (Task_Workflow/backero-backend) camelCase field
 * names and `{success, message, ...data}` envelope onto this app's existing
 * snake_case client types (types/models.ts, still mirroring the old Python
 * backend's schemas). Keeping the mapping here, at the API boundary, means
 * every page component stays untouched by the backend swap.
 */
import type {AttendanceRecord, CurrentUser, Employee, Holiday, WorkSchedule} from '../types/models';

interface NodeAttendance {
  _id: string;
  employeeId: string;
  attendancePeriodId: string | null;
  attendanceDate: string;
  checkIn: string | null;
  checkOut: string | null;
  status: AttendanceRecord['status'];
  isCorrected: boolean;
  correctionHistory: unknown[];
}

export function mapAttendance(row: NodeAttendance): AttendanceRecord {
  return {
    id: row._id,
    employee_id: row.employeeId,
    attendance_period_id: row.attendancePeriodId ?? '',
    attendance_date: row.attendanceDate,
    check_in: row.checkIn,
    check_out: row.checkOut,
    status: row.status,
    is_corrected: row.isCorrected,
    correction_history: row.correctionHistory ?? [],
  };
}

interface NodeEmployee {
  _id: string;
  userId: string | null;
  employeeCode: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  departmentId: string;
  designationId: string;
  category: Employee['category'];
  dateOfJoining: string;
  createdAt: string;
  updatedAt: string;
}

export function mapEmployee(row: NodeEmployee): Employee {
  return {
    id: row._id,
    user_id: row.userId,
    employee_code: row.employeeCode,
    full_name: row.fullName,
    email: row.email,
    phone: row.phone,
    department_id: row.departmentId,
    designation_id: row.designationId,
    category: row.category,
    date_of_joining: row.dateOfJoining,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

interface NodeUser {
  _id: string;
  email: string;
  role: string;
  permissions?: string[];
}

export function mapCurrentUser(row: NodeUser): CurrentUser {
  return {
    id: row._id,
    email: row.email,
    role: row.role,
    permissions: row.permissions ?? [],
  };
}

interface NodeHoliday {
  _id: string;
  name: string;
  date: string;
  isRecurringAnnually: boolean;
}

export function mapHoliday(row: NodeHoliday): Holiday {
  return {
    id: row._id,
    name: row.name,
    date: row.date,
    is_recurring_annually: row.isRecurringAnnually,
  };
}

interface NodeWorkSchedule {
  _id: string;
  weekOffDays: number[];
  effectiveFrom: string;
}

export function mapWorkSchedule(row: NodeWorkSchedule): WorkSchedule {
  return {
    id: row._id,
    week_off_days: row.weekOffDays,
    effective_from: row.effectiveFrom,
  };
}
