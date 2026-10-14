import {useFocusEffect} from '@react-navigation/native';
import React, {useCallback} from 'react';
import {FlatList, RefreshControl, StyleSheet, Text, View} from 'react-native';

import StatusBadge from '../components/StatusBadge';
import LoadingIndicator from '../components/ui/LoadingIndicator';
import {useGetMyAttendanceQuery} from '../store/attendanceApi';
import {destructive, neutral, primary, spacing, surface, text as textColor, typography} from '../theme/palette';

const HISTORY_WINDOW_DAYS = 30;

function isoDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

export default function AttendanceHistoryScreen(): React.JSX.Element {
  const {
    data: records = [],
    isLoading,
    isError,
    refetch,
  } = useGetMyAttendanceQuery({date_from: isoDaysAgo(HISTORY_WINDOW_DAYS), date_to: isoDaysAgo(0)});

  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  if (isLoading && records.length === 0) {
    return (
      <View style={styles.centered}>
        <LoadingIndicator />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.content}
      data={records}
      keyExtractor={item => item.id}
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={() => void refetch()} tintColor={primary.base} />}
      ListEmptyComponent={
        isError ? (
          <Text style={styles.error}>Could not load attendance history.</Text>
        ) : (
          <Text style={styles.body}>No attendance records yet.</Text>
        )
      }
      renderItem={({item}) => (
        <View style={styles.row}>
          <Text style={styles.date}>{item.attendance_date}</Text>
          <StatusBadge status={item.status} />
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: surface},
  content: {padding: spacing.lg},
  centered: {flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: surface},
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: neutral[200],
  },
  date: {fontSize: typography.scale.body.size, color: textColor.primary},
  body: {
    fontSize: typography.scale.body.size,
    color: textColor.secondary,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
  error: {
    fontSize: typography.scale.body.size,
    color: destructive,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
});
