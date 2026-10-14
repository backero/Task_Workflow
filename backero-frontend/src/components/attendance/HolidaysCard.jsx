import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays } from 'lucide-react';
import api from '../../api/axios';
import { Card, Empty, Space, Table, Tag, Typography } from 'antd';
import dayjs from 'dayjs';

const { Text } = Typography;

const WEEKDAY_LABEL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// A recurring holiday's stored date is just "which month/day" — roll it
// forward to this year's occurrence (or next year's, if this year's has
// already passed) so it sorts and reads correctly on a calendar-year list.
function occurrenceThisYear(holiday) {
  const stored = dayjs(holiday.date);
  if (!holiday.isRecurringAnnually) return stored;
  return dayjs().year(dayjs().year()).month(stored.month()).date(stored.date());
}

/** Keka-style full holiday calendar for the current year, past dates shown
 * muted rather than hidden — the CEO explicitly asked for "all", not just
 * upcoming. `full` renders a Table (used in the dedicated Attendance >
 * Holidays tab); the default compact Card list is used inline on
 * MyLeave/MyAttendance. Both always show the complete list, never sliced. */
export default function HolidaysCard({ full = false }) {
  const { data: holidaysData, isLoading: holidaysLoading } = useQuery({
    queryKey: ['attendance-holidays'], queryFn: () => api.get('/attendance/holidays').then((r) => r.data),
  });
  const { data: scheduleData, isLoading: scheduleLoading } = useQuery({
    queryKey: ['work-schedules'], queryFn: () => api.get('/attendance/work-schedule').then((r) => r.data),
  });

  const holidays = holidaysData?.holidays || [];
  const schedules = scheduleData?.schedules || [];
  const currentSchedule = schedules[schedules.length - 1];
  const weekOffLabel = currentSchedule?.weekOffDays?.length
    ? currentSchedule.weekOffDays.map((d) => WEEKDAY_LABEL[d]).join(', ')
    : 'Sunday (default)';

  const allHolidays = holidays
    .map((h) => ({ ...h, occ: occurrenceThisYear(h) }))
    .sort((a, b) => a.occ.valueOf() - b.occ.valueOf());
  const isPast = (occ) => occ.isBefore(dayjs(), 'day');

  const weekOffSummary = (
    <div>
      <Text type="secondary" style={{ fontSize: 12 }}>Weekly Off</Text>
      <div><Tag color="blue">{weekOffLabel}</Tag></div>
    </div>
  );

  if (full) {
    const columns = [
      { title: 'Date', key: 'date', width: 140, render: (_, h) => <Text type={isPast(h.occ) ? 'secondary' : undefined}>{h.occ.format('DD MMM YYYY')}</Text> },
      { title: 'Day', key: 'day', width: 110, render: (_, h) => <Text type={isPast(h.occ) ? 'secondary' : undefined}>{WEEKDAY_LABEL[h.occ.day()]}</Text> },
      { title: 'Holiday', key: 'name', render: (_, h) => <Text type={isPast(h.occ) ? 'secondary' : undefined}>{h.name}</Text> },
      { title: '', key: 'meta', width: 120, align: 'right', render: (_, h) => (
        <Space size={4}>
          {h.isRecurringAnnually && <Tag>Yearly</Tag>}
          {isPast(h.occ) && <Tag color="default">Past</Tag>}
        </Space>
      ) },
    ];
    return (
      <div>
        <div style={{ marginBottom: 16 }}>{weekOffSummary}</div>
        <Card styles={{ body: { padding: 0 } }} loading={holidaysLoading || scheduleLoading}>
          <Table
            rowKey="_id" columns={columns} dataSource={allHolidays} pagination={false}
            locale={{ emptyText: <Empty description="No holidays declared yet" /> }}
          />
        </Card>
      </div>
    );
  }

  return (
    <Card size="small" title={<Space size={6}><CalendarDays size={14} />Holidays & Week Off</Space>} loading={holidaysLoading || scheduleLoading}>
      <Space direction="vertical" style={{ width: '100%' }} size={12}>
        {weekOffSummary}
        <div>
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>Holiday Calendar</Text>
          {allHolidays.length === 0 ? (
            <Empty description="No holidays declared yet" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            <Space direction="vertical" size={4} style={{ width: '100%', maxHeight: 260, overflowY: 'auto' }}>
              {allHolidays.map((h) => (
                <div key={h._id} style={{ display: 'flex', justifyContent: 'space-between', opacity: isPast(h.occ) ? 0.5 : 1 }}>
                  <Text style={{ fontSize: 13 }}>{h.name}</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>{h.occ.format('DD MMM YYYY')}{h.isRecurringAnnually ? ' (yearly)' : ''}</Text>
                </div>
              ))}
            </Space>
          )}
        </div>
      </Space>
    </Card>
  );
}
