import {useFocusEffect} from '@react-navigation/native';
import React, {useCallback} from 'react';
import {RefreshControl, ScrollView, StyleSheet, Text, View} from 'react-native';

import StatusBadge from '../components/StatusBadge';
import SwipeToPunch from '../components/SwipeToPunch';
import LoadingIndicator from '../components/ui/LoadingIndicator';
import {snackbarStore} from '../components/snackbar/store';
import {ApiError} from '../api/client';
import {useGetMyAttendanceQuery, usePunchAttendanceMutation} from '../store/attendanceApi';
import {destructive, neutral, primary, radius, spacing, surface, text as textColor, typography} from '../theme/palette';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function DashboardScreen(): React.JSX.Element {
  const date = todayIso();
  const {data: records, isLoading, isError, refetch} = useGetMyAttendanceQuery({date_from: date, date_to: date});
  const [punch, {isLoading: isPunching}] = usePunchAttendanceMutation();
  const today = records?.[0] ?? null;

  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  // Toggles between CHECK_IN/CHECK_OUT rather than locking out after one
  // pair — once a session closes, the next punch starts a new one
  // (Keka-style multi-punch, matches the backend's punch endpoint).
  const nextAction: 'CHECK_IN' | 'CHECK_OUT' =
    !today || !today.check_in || today.check_out ? 'CHECK_IN' : 'CHECK_OUT';

  const handlePunch = useCallback(async () => {
    try {
      const res = await punch().unwrap();
      snackbarStore.show({text: res.punched === 'CHECK_IN' ? 'Checked in' : 'Checked out'});
    } catch (err) {
      snackbarStore.show({text: err instanceof ApiError ? err.message : 'Could not log attendance.'});
    }
  }, [punch]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={() => void refetch()} tintColor={primary.base} />}>
      <Text style={styles.heading}>Today</Text>

      {isLoading && !today ? (
        <LoadingIndicator />
      ) : isError ? (
        <Text style={styles.error}>Could not load today&apos;s attendance.</Text>
      ) : today ? (
        <View style={styles.card}>
          <StatusBadge status={today.status} />
          <Text style={styles.timeLabel}>
            Check-in: {today.check_in ? new Date(today.check_in).toLocaleTimeString() : '—'}
          </Text>
          <Text style={styles.timeLabel}>
            Check-out: {today.check_out ? new Date(today.check_out).toLocaleTimeString() : '—'}
          </Text>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.body}>No attendance recorded yet today.</Text>
        </View>
      )}

      {!isLoading && !isError ? (
        <View style={styles.swipeWrapper}>
          <SwipeToPunch
            label={nextAction === 'CHECK_IN' ? 'Check In' : 'Check Out'}
            loading={isPunching}
            disabled={false}
            onComplete={() => void handlePunch()}
          />
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: surface},
  content: {padding: spacing.xl},
  heading: {
    fontSize: typography.scale.h1.size,
    fontWeight: typography.scale.h1.weight as '600',
    color: textColor.primary,
    marginBottom: spacing.lg,
  },
  swipeWrapper: {marginTop: spacing.xl},
  card: {
    backgroundColor: surface,
    borderColor: neutral[200],
    borderWidth: 1,
    borderRadius: radius.card,
    padding: spacing.lg,
  },
  timeLabel: {
    marginTop: spacing.sm,
    fontSize: typography.scale.body.size,
    color: textColor.primary,
  },
  body: {fontSize: typography.scale.body.size, color: textColor.secondary},
  error: {fontSize: typography.scale.body.size, color: destructive},
});
