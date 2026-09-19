import {
  CalendarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  MinusCircleOutlined,
  PauseCircleOutlined,
  StarOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import type {ComponentType} from 'react';

import type {AttendanceStatus, DeviceStatus} from '../types/models';

export interface StatusTone {
  bg: string;
  text: string;
  icon: ComponentType;
  label: string;
}

/**
 * One tone per AttendanceStatus. Color alone never carries the meaning —
 * every tone also gets a distinct icon (spec: "colour not the only status
 * indicator"). MISSING_PUNCH and ABSENT are both "problem" states and are
 * deliberately kept visually distinct (rose vs red, different icon).
 */
export const attendanceStatusColors: Record<AttendanceStatus, StatusTone> = {
  PRESENT: {bg: '#DCFCE7', text: '#15803D', icon: CheckCircleOutlined, label: 'Present'},
  ABSENT: {bg: '#FEE2E2', text: '#B91C1C', icon: CloseCircleOutlined, label: 'Absent'},
  LATE: {bg: '#FEF3C7', text: '#B45309', icon: ClockCircleOutlined, label: 'Late'},
  HALF_DAY: {bg: '#DBEAFE', text: '#1D4ED8', icon: MinusCircleOutlined, label: 'Half Day'},
  ON_LEAVE: {bg: '#EDE9FE', text: '#6D28D9', icon: CalendarOutlined, label: 'On Leave'},
  HOLIDAY: {bg: '#CCFBF1', text: '#0F766E', icon: StarOutlined, label: 'Holiday'},
  WEEK_OFF: {bg: '#E2E8F0', text: '#475569', icon: PauseCircleOutlined, label: 'Week Off'},
  MISSING_PUNCH: {bg: '#FFE4E6', text: '#BE123C', icon: WarningOutlined, label: 'Missing Punch'},
  INCOMPLETE: {bg: '#FDE68A', text: '#92400E', icon: ExclamationCircleOutlined, label: 'Incomplete'},
};

/**
 * Device statuses deliberately reuse the green/red/neutral idiom from
 * attendance (good/bad/neutral) rather than inventing a parallel palette —
 * the two domains never render in the same table, so there's no risk of
 * cross-reading them as the same thing.
 */
export const deviceStatusColors: Record<DeviceStatus, StatusTone> = {
  ONLINE: {...attendanceStatusColors.PRESENT, label: 'Online'},
  OFFLINE: {...attendanceStatusColors.ABSENT, label: 'Offline'},
  UNKNOWN: {...attendanceStatusColors.WEEK_OFF, label: 'Unknown'},
};

export const destructiveColor = '#DC2626';
