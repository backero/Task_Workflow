import React from 'react';
import {StyleSheet, Text, View} from 'react-native';

import {attendanceStatusColors} from '../theme/statusColors';
import {radius, spacing, typography} from '../theme/palette';
import type {AttendanceStatus} from '../types/models';

export default function StatusBadge({status}: {status: AttendanceStatus}): React.JSX.Element {
  const tone = attendanceStatusColors[status];
  return (
    <View style={[styles.badge, {backgroundColor: tone.bg}]}>
      <Text style={[styles.text, {color: tone.text}]}>{tone.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: radius.badge,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  text: {
    fontSize: typography.scale.caption.size,
    fontWeight: typography.weight.semibold as '600',
  },
});
