import type {AttendanceStatus} from '../types/models';

export interface StatusTone {
  bg: string;
  text: string;
  label: string;
}

/**
 * One tone per AttendanceStatus — identical values to
 * apps/employee-web/src/theme/statusColors.ts, so the same status always
 * reads the same color across every Backero surface. MISSING_PUNCH and
 * ABSENT are both "problem" states and are deliberately kept visually
 * distinct (rose vs red).
 */
export const attendanceStatusColors: Record<AttendanceStatus, StatusTone> = {
  PRESENT: {bg: '#DCFCE7', text: '#15803D', label: 'Present'},
  ABSENT: {bg: '#FEE2E2', text: '#B91C1C', label: 'Absent'},
  LATE: {bg: '#FEF3C7', text: '#B45309', label: 'Late'},
  HALF_DAY: {bg: '#DBEAFE', text: '#1D4ED8', label: 'Half Day'},
  ON_LEAVE: {bg: '#EDE9FE', text: '#6D28D9', label: 'On Leave'},
  HOLIDAY: {bg: '#CCFBF1', text: '#0F766E', label: 'Holiday'},
  WEEK_OFF: {bg: '#E2E8F0', text: '#475569', label: 'Week Off'},
  MISSING_PUNCH: {bg: '#FFE4E6', text: '#BE123C', label: 'Missing Punch'},
  INCOMPLETE: {bg: '#FDE68A', text: '#92400E', label: 'Incomplete'},
};
