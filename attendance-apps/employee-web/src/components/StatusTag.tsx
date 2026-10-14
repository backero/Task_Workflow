import {Tag} from 'antd';
import type React from 'react';

import {attendanceStatusColors} from '../theme/statusColors';
import type {AttendanceStatus} from '../types/models';

export default function StatusTag({status}: {status: AttendanceStatus}): React.JSX.Element {
  const tone = attendanceStatusColors[status];
  const Icon = tone.icon;
  return (
    <Tag icon={<Icon />} style={{backgroundColor: tone.bg, color: tone.text, border: 'none', borderRadius: 999, fontWeight: 600}}>
      {tone.label}
    </Tag>
  );
}
