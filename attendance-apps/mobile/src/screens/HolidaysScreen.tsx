import {useFocusEffect} from '@react-navigation/native';
import React, {useCallback, useMemo} from 'react';
import {FlatList, RefreshControl, StyleSheet, Text, View} from 'react-native';

import LoadingIndicator from '../components/ui/LoadingIndicator';
import {useGetHolidaysQuery, useGetWorkSchedulesQuery} from '../store/holidaysApi';
import type {Holiday} from '../types/models';
import {neutral, primary, spacing, surface, text as textColor, typography} from '../theme/palette';

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

export default function HolidaysScreen(): React.JSX.Element {
  const {data: holidays = [], isLoading: holidaysLoading, refetch: refetchHolidays} = useGetHolidaysQuery();
  const {data: schedules = [], isLoading: schedulesLoading, refetch: refetchSchedules} = useGetWorkSchedulesQuery();

  useFocusEffect(
    useCallback(() => {
      void refetchHolidays();
      void refetchSchedules();
    }, [refetchHolidays, refetchSchedules]),
  );

  const rows: HolidayRow[] = useMemo(
    () =>
      holidays
        .map(h => ({...h, occurrence: occurrenceThisYear(h)}))
        .sort((a, b) => a.occurrence.getTime() - b.occurrence.getTime()),
    [holidays],
  );

  const currentSchedule = schedules[schedules.length - 1];
  const weekOffLabel = currentSchedule?.week_off_days?.length
    ? currentSchedule.week_off_days.map(d => WEEKDAY_LABEL[d]).join(', ')
    : 'Sunday (default)';

  const isLoading = holidaysLoading || schedulesLoading;

  if (isLoading && rows.length === 0) {
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
      data={rows}
      keyExtractor={item => item.id}
      refreshControl={
        <RefreshControl
          refreshing={isLoading}
          onRefresh={() => {
            void refetchHolidays();
            void refetchSchedules();
          }}
          tintColor={primary.base}
        />
      }
      ListHeaderComponent={
        <View style={styles.weekOffCard}>
          <Text style={styles.weekOffLabel}>Weekly Off</Text>
          <Text style={styles.weekOffValue}>{weekOffLabel}</Text>
        </View>
      }
      ListEmptyComponent={<Text style={styles.body}>No holidays declared yet.</Text>}
      renderItem={({item}) => (
        <View style={[styles.row, isPast(item.occurrence) && styles.rowPast]}>
          <View style={styles.rowLeft}>
            <Text style={styles.date}>
              {item.occurrence.toLocaleDateString('en-IN', {day: '2-digit', month: 'short', year: 'numeric'})}
            </Text>
            <Text style={styles.day}>{WEEKDAY_LABEL[item.occurrence.getUTCDay()]}</Text>
          </View>
          <Text style={styles.name}>{item.name}</Text>
          {item.is_recurring_annually && <Text style={styles.tag}>Yearly</Text>}
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: surface},
  content: {padding: spacing.lg},
  centered: {flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: surface},
  weekOffCard: {
    backgroundColor: neutral[50],
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  weekOffLabel: {fontSize: typography.scale.caption.size, color: textColor.secondary, marginBottom: 4},
  weekOffValue: {fontSize: typography.scale.body.size, color: primary.base, fontWeight: '600'},
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: neutral[200],
  },
  rowPast: {opacity: 0.5},
  rowLeft: {width: 100},
  date: {fontSize: typography.scale.body.size, color: textColor.primary},
  day: {fontSize: typography.scale.caption.size, color: textColor.secondary},
  name: {flex: 1, fontSize: typography.scale.body.size, color: textColor.primary},
  tag: {
    fontSize: typography.scale.caption.size,
    color: textColor.secondary,
    backgroundColor: neutral[100],
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  body: {
    fontSize: typography.scale.body.size,
    color: textColor.secondary,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
});
