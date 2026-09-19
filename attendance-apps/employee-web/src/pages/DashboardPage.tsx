import {App, Card, Typography} from 'antd';
import type React from 'react';

import StatusTag from '../components/StatusTag';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import LoadingState from '../components/ui/LoadingState';
import PageHeader from '../components/ui/PageHeader';
import {ApiError} from '../api/httpClient';
import {useGetMyAttendanceQuery, usePunchAttendanceMutation} from '../store/attendanceApi';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatTime(value: string | null): string {
  return value ? new Date(value).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'}) : '—';
}

export default function DashboardPage(): React.JSX.Element {
  const {message} = App.useApp();
  const today = todayIso();
  const {data: records, isLoading} = useGetMyAttendanceQuery({date_from: today, date_to: today});
  const [punch, {isLoading: isPunching}] = usePunchAttendanceMutation();
  const todayRecord = records?.[0] ?? null;

  // Toggles between CHECK_IN/CHECK_OUT rather than locking out after one
  // pair — once a session closes, the next punch starts a new one
  // (Keka-style multi-punch, matches the backend's punch endpoint).
  const nextAction: 'CHECK_IN' | 'CHECK_OUT' =
    !todayRecord || !todayRecord.check_in || todayRecord.check_out ? 'CHECK_IN' : 'CHECK_OUT';

  const handlePunch = async (): Promise<void> => {
    try {
      const res = await punch().unwrap();
      message.success(res.punched === 'CHECK_IN' ? 'Checked in' : 'Checked out');
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : 'Could not log attendance.');
    }
  };

  return (
    <div>
      <PageHeader title="Dashboard" description="Your attendance status for today." />

      <Card>
        {isLoading ? (
          <LoadingState />
        ) : todayRecord ? (
          <div>
            <StatusTag status={todayRecord.status} />
            <div style={{marginTop: 16, display: 'flex', gap: 32}}>
              <div>
                <Typography.Text type="secondary" style={{display: 'block', fontSize: 12.5}}>
                  Check In
                </Typography.Text>
                <Typography.Title level={4} style={{margin: 0}}>
                  {formatTime(todayRecord.check_in)}
                </Typography.Title>
              </div>
              <div>
                <Typography.Text type="secondary" style={{display: 'block', fontSize: 12.5}}>
                  Check Out
                </Typography.Text>
                <Typography.Title level={4} style={{margin: 0}}>
                  {formatTime(todayRecord.check_out)}
                </Typography.Title>
              </div>
            </div>
          </div>
        ) : (
          <EmptyState title="No attendance recorded yet today" description="Check back after you punch in." />
        )}

        <div style={{marginTop: 24}}>
          <Button variant="primary" loading={isPunching} onClick={() => void handlePunch()}>
            {nextAction === 'CHECK_IN' ? 'Check In' : 'Check Out'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
