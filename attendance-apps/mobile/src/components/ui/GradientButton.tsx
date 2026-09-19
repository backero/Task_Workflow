import React from 'react';
import {ActivityIndicator, StyleSheet, Text, TouchableOpacity, type StyleProp, type ViewStyle} from 'react-native';

import {primary, radius, spacing, surface, typography} from '../../theme/palette';

interface GradientButtonProps {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** The primary action button — flat orange fill. */
export default function GradientButton({
  title,
  onPress,
  disabled,
  loading,
  style,
}: GradientButtonProps): React.JSX.Element {
  const isDisabled = Boolean(disabled || loading);
  return (
    <TouchableOpacity
      style={[styles.button, style, isDisabled && styles.disabled]}
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.85}>
      {loading ? <ActivityIndicator color={surface} /> : <Text style={styles.text}>{title}</Text>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: primary.base,
    borderRadius: radius.button,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {opacity: 0.6},
  text: {
    color: surface,
    fontSize: 15,
    fontWeight: typography.weight.semibold as '600',
  },
});
