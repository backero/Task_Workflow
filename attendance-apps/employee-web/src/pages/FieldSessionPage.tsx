import {EnvironmentOutlined} from '@ant-design/icons';
import {App, Typography} from 'antd';
import {useEffect, useRef, useState} from 'react';
import type React from 'react';

import {useAuth} from '../auth/useAuth';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import PageHeader from '../components/ui/PageHeader';
import {ApiError} from '../api/httpClient';
import {useEndFieldSessionMutation, useStartFieldSessionMutation, useUploadLocationBatchMutation} from '../store/locationsApi';
import {attendanceStatusColors} from '../theme/statusColors';
import {neutral, radius, spacing, text as textColor} from '../theme/palette';
import type {LocationPointPayload} from '../types/models';

const LOW_ACCURACY_WARNING_METERS = 50;

let clientPointCounter = 0;
function generateClientPointId(): string {
  clientPointCounter = (clientPointCounter + 1) % 1_000_000;
  const random = Math.random().toString(36).slice(2, 10);
  return `web-${Date.now()}-${clientPointCounter}-${random}`;
}

function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {enableHighAccuracy: true, timeout: 15000});
  });
}

export default function FieldSessionPage(): React.JSX.Element {
  const {message} = App.useApp();
  const {employee} = useAuth();
  const [startFieldSession] = useStartFieldSessionMutation();
  const [endFieldSession] = useEndFieldSessionMutation();
  const [uploadLocationBatch] = useUploadLocationBatchMutation();

  const [isTracking, setIsTracking] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [lastAccuracy, setLastAccuracy] = useState<number | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sessionIdRef = useRef<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopInterval = (): void => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  // Best-effort — a hard tab close can't run this (no reliable authenticated
  // beacon for a JSON+bearer-token API), but navigating away within the app
  // should still close the session server-side rather than leave it open.
  useEffect(() => {
    return () => {
      stopInterval();
      if (sessionIdRef.current) {
        void endFieldSession({sessionId: sessionIdRef.current, reason: 'MANUAL'});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sampleAndUpload = async (sessionId: string): Promise<void> => {
    try {
      const position = await getCurrentPosition();
      const point: LocationPointPayload = {
        client_point_id: generateClientPointId(),
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy_meters: position.coords.accuracy ?? null,
        device_info: navigator.userAgent.slice(0, 255),
        recorded_at: new Date(position.timestamp).toISOString(),
      };
      await uploadLocationBatch({sessionId, points: [point]}).unwrap();
      setLastAccuracy(point.accuracy_meters);
      setLastUpdatedAt(new Date());
      setError(null);
    } catch (err) {
      if (err instanceof GeolocationPositionError && err.code === err.PERMISSION_DENIED) {
        setError('Location permission is required to keep tracking. Stopping the session.');
        await handleStop('ADMIN_STOPPED');
        return;
      }
      setError(err instanceof ApiError ? err.message : 'Could not record a location point. Retrying next interval.');
    }
  };

  const handleStart = async (): Promise<void> => {
    if (!navigator.geolocation) {
      setError('This browser does not support location tracking.');
      return;
    }
    setError(null);
    setIsBusy(true);
    try {
      const session = await startFieldSession().unwrap();
      sessionIdRef.current = session.id;
      setIsTracking(true);
      await sampleAndUpload(session.id);
      intervalRef.current = setInterval(() => {
        void sampleAndUpload(session.id);
      }, session.location_interval_seconds * 1000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start the field session.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleStop = async (reason: 'MANUAL' | 'ADMIN_STOPPED' = 'MANUAL'): Promise<void> => {
    const sessionId = sessionIdRef.current;
    stopInterval();
    setIsTracking(false);
    if (!sessionId) return;
    sessionIdRef.current = null;
    setIsBusy(true);
    try {
      await endFieldSession({sessionId, reason}).unwrap();
      if (reason === 'MANUAL') message.success('Field session ended.');
    } catch {
      // Best-effort — local state has already stopped tracking regardless.
    } finally {
      setIsBusy(false);
    }
  };

  if (employee && employee.category !== 'FIELD') {
    return (
      <div>
        <PageHeader title="Field Session" description="Location tracking for field employees." />
        <Card>
          <EmptyState
            title="Not available for your role"
            description="Field location tracking is only available to field employees."
          />
        </Card>
      </div>
    );
  }

  const isWeakSignal = isTracking && lastAccuracy != null && lastAccuracy > LOW_ACCURACY_WARNING_METERS;

  return (
    <div>
      <PageHeader title="Field Session" description="Track your location while you're out in the field." />

      <Card>
        <div style={{display: 'flex', gap: spacing.md, alignItems: 'flex-start'}}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: radius.lg,
              background: isTracking ? attendanceStatusColors.PRESENT.bg : neutral[100],
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <EnvironmentOutlined style={{fontSize: 18, color: isTracking ? attendanceStatusColors.PRESENT.text : neutral[500]}} />
          </div>
          <div style={{flex: 1}}>
            <Typography.Text strong style={{display: 'block'}}>
              {isTracking ? 'Tracking is active' : 'Not tracking'}
            </Typography.Text>
            <Typography.Text type="secondary" style={{fontSize: 13}}>
              {isTracking
                ? lastUpdatedAt
                  ? `Last point recorded at ${lastUpdatedAt.toLocaleTimeString()}${lastAccuracy != null ? ` — accuracy ${Math.round(lastAccuracy)}m` : ''}`
                  : 'Waiting for the first location fix…'
                : 'Start a session to begin sharing your location with the admin team.'}
            </Typography.Text>
            {isWeakSignal ? (
              <Typography.Text style={{display: 'block', marginTop: 4, fontSize: 12.5, color: attendanceStatusColors.LATE.text}}>
                Weak GPS signal — points are still being recorded.
              </Typography.Text>
            ) : null}
          </div>
        </div>

        <div
          style={{
            marginTop: spacing.lg,
            padding: spacing.md,
            borderRadius: radius.base,
            background: neutral[50],
            fontSize: 12.5,
            color: textColor.secondary,
          }}
        >
          Location tracking only runs while this tab stays open in your browser — unlike the mobile app, it stops if
          you close the tab or navigate away. Keep this page open during your field visit.
        </div>

        {error ? (
          <Typography.Text type="danger" role="alert" style={{display: 'block', marginTop: spacing.md}}>
            {error}
          </Typography.Text>
        ) : null}

        <div style={{marginTop: spacing.lg}}>
          {isTracking ? (
            <Button variant="destructive" onClick={() => void handleStop('MANUAL')} loading={isBusy} width="100%">
              End field session
            </Button>
          ) : (
            <Button variant="primary" onClick={() => void handleStart()} loading={isBusy} width="100%">
              Start field session
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
