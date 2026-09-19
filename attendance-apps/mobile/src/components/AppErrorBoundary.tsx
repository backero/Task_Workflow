import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {captureException} from '../services/CrashReportingService';
import {spacing, surface, text as textColor, typography} from '../theme/palette';

type AppErrorBoundaryState = {hasError: boolean};

/**
 * App-level error boundary (spec §5/§24: a crash must never show a white
 * screen). Extracted from App.tsx so it's independently testable without
 * mounting the full navigation tree — see __tests__/AppErrorBoundary.test.tsx.
 */
export default class AppErrorBoundary extends React.Component<React.PropsWithChildren, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {hasError: false};

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return {hasError: true};
  }

  componentDidCatch(error: Error): void {
    captureException(error);
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <SafeAreaView style={styles.container}>
          <View style={styles.centered}>
            <Text style={styles.title}>Something went wrong</Text>
            <Text style={styles.body}>Please restart the app. If this keeps happening, contact HR.</Text>
          </View>
        </SafeAreaView>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: surface,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  title: {
    fontSize: typography.scale.h1.size,
    fontWeight: typography.scale.h1.weight as '600',
    color: textColor.primary,
  },
  body: {
    marginTop: spacing.lg,
    fontSize: typography.scale.body.size,
    color: textColor.primary,
    textAlign: 'center',
  },
});
