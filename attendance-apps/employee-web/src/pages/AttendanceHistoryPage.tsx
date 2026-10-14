import {Table} from 'antd';
import type {ColumnsType} from 'antd/es/table';
import {useState} from 'react';
import type React from 'react';

import StatusTag from '../components/StatusTag';
import Card from '../components/ui/Card';
import DatePicker from '../components/ui/DatePicker';
import EmptyState from '../components/ui/EmptyState';
import Field from '../components/ui/Field';
import PageHeader from '../components/ui/PageHeader';
import {useGetMyAttendanceQuery} from '../store/attendanceApi';
import type {AttendanceRecord} from '../types/models';

function daysAgoIso(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatTime(value: string | null): string {
  return value ? new Date(value).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'}) : '—';
}

export default function AttendanceHistoryPage(): React.JSX.Element {
  const [dateFrom, setDateFrom] = useState(daysAgoIso(30));
  const [dateTo, setDateTo] = useState(todayIso());
  const {data: records, isFetching: isLoading} = useGetMyAttendanceQuery({date_from: dateFrom, date_to: dateTo});

  const columns: ColumnsType<AttendanceRecord> = [
    {title: 'Date', dataIndex: 'attendance_date', key: 'attendance_date'},
    {title: 'Check In', key: 'check_in', render: (_, record) => formatTime(record.check_in)},
    {title: 'Check Out', key: 'check_out', render: (_, record) => formatTime(record.check_out)},
    {title: 'Status', key: 'status', render: (_, record) => <StatusTag status={record.status} />},
  ];

  return (
    <div>
      <PageHeader title="Attendance History" description="Your punch records over a date range." />

      <div style={{marginBottom: 24}}>
        <Card>
          <div style={{display: 'flex', gap: 16, flexWrap: 'wrap'}}>
            <div style={{minWidth: 150}}>
              <Field label="From">
                <DatePicker value={dateFrom} onChange={setDateFrom} />
              </Field>
            </div>
            <div style={{minWidth: 150}}>
              <Field label="To">
                <DatePicker value={dateTo} onChange={setDateTo} />
              </Field>
            </div>
          </div>
        </Card>
      </div>

      <Table<AttendanceRecord>
        columns={columns}
        dataSource={records ?? []}
        rowKey={record => record.id}
        loading={isLoading}
        pagination={false}
        locale={{emptyText: <EmptyState title="No attendance records" description="No records exist for this date range." />}}
      />
    </div>
  );
}
