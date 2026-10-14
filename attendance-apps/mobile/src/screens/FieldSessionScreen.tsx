import {useFocusEffect} from '@react-navigation/native';
import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, StyleSheet, Text, TouchableOpacity, View} from 'react-native';

import {ApiError} from '../api/client';
import GradientButton from '../components/ui/GradientButton';
import LoadingIndicator from '../components/ui/LoadingIndicator';
import {locationService} from '../services/location/LocationService';
import type {TrackingSnapshot} from '../services/location/LocationService';
import {useGetMyEmployeeProfileQuery} from '../store/employeesApi';
import {attendanceStatusColors} from '../theme/statusColors';
import {
  destructive,
  neutral,
  primary,
  radius,
  spacing,
  surface,
  text as textColor,
  typography,
} from '../theme/palette';

const LOW_ACCURACY_WARNING_METERS = 50;

function statusLabel(snapshot: TrackingSnapshot): string {
  switch (snapshot.status) {
    case 'IDLE':
      return 'Not tracking';
    case 'STARTING':
      return 'Starting field session…';
    case 'TRACKING':
      return 'Location tracking is active';
    case 'GPS_DISABLED':
      return 'Location tracking is active — waiting for GPS';
    case 'PERMISSION_DENIED':
      return 'Location permission denied';
    case 'STOPPING':
      return 'Ending field session…';
    default:
      return snapshot.status;
  }
}

export default function FieldSessionScreen(): React.JSX.Element {
  const {data: employee, isLoading: isLoadingProfile, isError: isProfileError, refetch} = useGetMyEmployeeProfileQuery();
  const [snapshot, setSnapshot] = useState<TrackingSnapshot | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  useEffect(() => {
    return locationService.subscribeToLocationUpdates(setSnapshot);
  }, []);

  const handleStart = async (): Promise<void> => {
    setActionError(null);
    setIsBusy(true);
    try {
      await locationService.startTracking();
    } catch (error) {
      setActionError(
        error instanceof ApiError
          ? error.message
          : locationService.getTrackingStatus() === 'PERMISSION_DENIED'
            ? 'Location permission is required to start a field session.'
            : 'Could not start the field session. Please try again.',
      );
    } finally {
      setIsBusy(false);
    }
  };

  const handleStop = async (): Promise<void> => {
    setActionError(null);
    setIsBusy(true);
    try {
      await locationService.stopTracking();
    } catch {
      setActionError('Could not end the field session. Please try again.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleResume = async (): Promise<void> => {
    setActionError(null);
    setIsBusy(true);
    try {
      await locationService.resumePendingSession();
    } catch {
      setActionError('Could not resume the field session. Please try again.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleDiscard = async (): Promise<void> => {
    setIsBusy(true);
    try {
      await locationService.discardPendingSession();
    } finally {
      setIsBusy(false);
    }
  };

  if (isLoadingProfile) {
    return (
      <View style={styles.centered}>
        <LoadingIndicator />
      </View>
    );
  }

  if (isProfileError || !employee) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>No employee profile is linked to your account yet.</Text>
      </View>
    );
  }

  if (employee.category !== 'FIELD') {
    return (
      <View style={styles.centered}>
        <Text style={styles.body}>Field location tracking is only available to field employees.</Text>
      </View>
    );
  }

  const isTracking = snapshot?.status === 'TRACKING' || snapshot?.status === 'GPS_DISABLED';
  const isWeakSignal =
    isTracking &&
    snapshot?.lastSample?.accuracyMeters != null &&
    snapshot.lastSample.accuracyMeters > LOW_ACCURACY_WARNING_METERS;

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Field Session</Text>

      {snapshot?.pendingResumeSessionId ? (
        <View style={[styles.statusBanner, styles.promptBanner]}>
          <Text style={styles.promptText}>
            A field session was left running when the app last closed. Resume tracking, or end it?
          </Text>
          <View style={styles.promptButtonRow}>
            <TouchableOpacity
              style={[styles.promptButton, styles.promptButtonPrimary]}
              onPress={handleResume}
              disabled={isBusy}>
              <Text style={styles.promptButtonPrimaryText}>Resume tracking</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.promptButton, styles.promptButtonSecondary]}
              onPress={handleDiscard}
              disabled={isBusy}>
              <Text style={styles.promptButtonSecondaryText}>End session</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {snapshot?.oemGuidanceMessage ? (
        <View style={[styles.statusBanner, styles.promptBanner]}>
          <Text style={styles.promptText}>{snapshot.oemGuidanceMessage}</Text>
          <View style={styles.promptButtonRow}>
            <TouchableOpacity
              style={[styles.promptButton, styles.promptButtonPrimary]}
              onPress={() => locationService.openOemBatterySettings()}>
              <Text style={styles.promptButtonPrimaryText}>Open Settings</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.promptButton, styles.promptButtonSecondary]}
              onPress={() => locationService.dismissOemGuidance()}>
              <Text style={styles.promptButtonSecondaryText}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {snapshot && snapshot.status !== 'IDLE' ? (
        <View
          style={[
            styles.statusBanner,
            snapshot.status === 'PERMISSION_DENIED' ? styles.statusBannerError : styles.statusBannerActive,
          ]}>
          <Text
            style={[
              styles.statusBannerText,
              snapshot.status === 'PERMISSION_DENIED' ? styles.statusBannerTextError : styles.statusBannerTextActive,
            ]}>
            {statusLabel(snapshot)}
          </Text>
        </View>
      ) : null}

      {isWeakSignal ? <Text style={styles.warning}>Weak GPS signal — points are still being recorded.</Text> : null}

      {snapshot && snapshot.droppedPointCount > 0 ? (
        <Text style={styles.warning}>
          {snapshot.droppedPointCount} location point(s) could not be uploaded and were discarded.
        </Text>
      ) : null}

      {actionError ? <Text style={styles.error}>{actionError}</Text> : null}

      {isTracking ? (
        <TouchableOpacity
          style={[styles.button, styles.stopButton, isBusy && styles.buttonDisabled]}
          onPress={handleStop}
          disabled={isBusy}>
          {isBusy ? <ActivityIndicator color={surface} /> : <Text style={styles.buttonText}>End field session</Text>}
        </TouchableOpacity>
      ) : (
        <GradientButton
          title="Start field session"
          onPress={handleStart}
          loading={isBusy}
          style={styles.button}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: surface, padding: spacing.xl},
  centered: {flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: surface},
  heading: {
    fontSize: typography.scale.h1.size,
    fontWeight: typography.scale.h1.weight as '600',
    color: textColor.primary,
    marginBottom: spacing.lg,
  },
  body: {fontSize: typography.scale.body.size, color: textColor.secondary, textAlign: 'center'},
  error: {
    fontSize: typography.scale.body.size,
    color: destructive,
    marginBottom: spacing.md,
  },
  warning: {
    fontSize: typography.scale.caption.size,
    color: attendanceStatusColors.LATE.text,
    marginBottom: spacing.md,
  },
  statusBanner: {
    borderRadius: radius.card,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  statusBannerActive: {backgroundColor: attendanceStatusColors.PRESENT.bg},
  statusBannerError: {backgroundColor: attendanceStatusColors.ABSENT.bg},
  statusBannerText: {
    fontSize: typography.scale.body.size,
    fontWeight: typography.weight.semibold as '600',
  },
  statusBannerTextActive: {color: attendanceStatusColors.PRESENT.text},
  statusBannerTextError: {color: attendanceStatusColors.ABSENT.text},
  promptBanner: {backgroundColor: attendanceStatusColors.LATE.bg},
  promptText: {
    fontSize: typography.scale.body.size,
    color: attendanceStatusColors.LATE.text,
    marginBottom: spacing.md,
  },
  promptButtonRow: {flexDirection: 'row', gap: spacing.sm},
  promptButton: {
    flex: 1,
    borderRadius: radius.card,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  promptButtonPrimary: {backgroundColor: primary.base},
  promptButtonSecondary: {borderWidth: 1, borderColor: neutral[400]},
  promptButtonPrimaryText: {
    color: surface,
    fontSize: typography.scale.caption.size,
    fontWeight: typography.weight.semibold as '600',
  },
  promptButtonSecondaryText: {
    color: textColor.primary,
    fontSize: typography.scale.caption.size,
    fontWeight: typography.weight.semibold as '600',
  },
  button: {
    borderRadius: radius.card,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  stopButton: {backgroundColor: destructive},
  buttonDisabled: {opacity: 0.6},
  buttonText: {
    color: surface,
    fontSize: typography.scale.body.size,
    fontWeight: typography.weight.semibold as '600',
  },
});
