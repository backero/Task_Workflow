import {Table, Tag} from 'antd';
import type {ColumnsType} from 'antd/es/table';
import type React from 'react';

import Card from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import LoadingState from '../components/ui/LoadingState';
import PageHeader from '../components/ui/PageHeader';
import {useGetHolidaysQuery, useGetWorkSchedulesQuery} from '../store/holidaysApi';
import type {Holiday} from '../types/models';

const WEEKDAY_LABEL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface HolidayRow extends Holiday {
  occurrence: Date;
}

// A recurring holiday's stored date is just "which month/day" — roll it
// forward to this year's occurrence so the list sorts/reads correctly.
function occurrenceThisYear(holiday: Holiday): Date {
  const stored = new Date(holiday.date);
  if (!holiday.is_recurring_annually) return stored;
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), stored.getUTCMonth(), stored.getUTCDate()));
}

function isPast(date: Date): boolean {
  const today = new Date();
  const todayUTC = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  return date.getTime() < todayUTC.getTime();
}

export default function HolidaysPage(): React.JSX.Element {
  const {data: holidays, isFetching: holidaysLoading} = useGetHolidaysQuery();
  const {data: schedules, isFetching: schedulesLoading} = useGetWorkSchedulesQuery();

  const currentSchedule = schedules?.[schedules.length - 1];
  const weekOffLabel = currentSchedule?.week_off_days?.length
    ? currentSchedule.week_off_days.map(d => WEEKDAY_LABEL[d]).join(', ')
    : 'Sunday (default)';

  const rows: HolidayRow[] = (holidays ?? [])
    .map(h => ({...h, occurrence: occurrenceThisYear(h)}))
    .sort((a, b) => a.occurrence.getTime() - b.occurrence.getTime());

  const columns: ColumnsType<HolidayRow> = [
    {
      title: 'Date',
      key: 'date',
      width: 130,
      render: (_, row) => (
        <span style={{opacity: isPast(row.occurrence) ? 0.5 : 1}}>
          {row.occurrence.toLocaleDateString('en-IN', {day: '2-digit', month: 'short', year: 'numeric'})}
        </span>
      ),
    },
    {
      title: 'Day',
      key: 'day',
      width: 110,
      render: (_, row) => <span style={{opacity: isPast(row.occurrence) ? 0.5 : 1}}>{WEEKDAY_LABEL[row.occurrence.getUTCDay()]}</span>,
    },
    {
      title: 'Holiday',
      key: 'name',
      render: (_, row) => <span style={{opacity: isPast(row.occurrence) ? 0.5 : 1}}>{row.name}</span>,
    },
    {
      title: '',
      key: 'meta',
      width: 110,
      align: 'right',
      render: (_, row) => (
        <>
          {row.is_recurring_annually && <Tag>Yearly</Tag>}
          {isPast(row.occurrence) && <Tag>Past</Tag>}
        </>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Holidays & Week Off" description="This year's holiday calendar and weekly off days." />

      <div style={{marginBottom: 24}}>
        <Card>
          <div style={{fontSize: 12, color: '#6b7280', marginBottom: 6}}>Weekly Off</div>
          {schedulesLoading ? <LoadingState /> : <Tag color="blue">{weekOffLabel}</Tag>}
        </Card>
      </div>

      <Table<HolidayRow>
        columns={columns}
        dataSource={rows}
        rowKey={row => row.id}
        loading={holidaysLoading}
        pagination={false}
        locale={{emptyText: <EmptyState title="No holidays declared" description="Your organization hasn't set up a holiday calendar yet." />}}
      />
    </div>
  );
}
