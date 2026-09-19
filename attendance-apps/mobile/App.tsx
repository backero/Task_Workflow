/**
 * Backero Attendance — mobile app entry point.
 *
 * Phase 5: real auth/dashboard/history/profile screens (see src/screens),
 * navigation (src/navigation/RootNavigator), the token-refreshing API
 * client (src/api), and crash reporting wired into the app-level error
 * boundary below. Theming is exclusively via `src/theme/palette.ts` — an
 * independent orange-gradient design shared visually with apps/employee-web
 * (see src/theme/palette.ts's header comment) — no raw hex literals
 * anywhere in src/.
 *
 * @format
 */

import React, {useEffect} from 'react';
import {StatusBar, StyleSheet, View} from 'react-native';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {Provider as ReduxProvider} from 'react-redux';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';

import {useAuth} from './src/auth/useAuth';
import AppErrorBoundary from './src/components/AppErrorBoundary';
import LoadingIndicator from './src/components/ui/LoadingIndicator';
import RootNavigator from './src/navigation/RootNavigator';
import SnackbarHost from './src/components/snackbar/SnackbarHost';
import {initCrashReporting} from './src/services/CrashReportingService';
import {store} from './src/store';
import {spacing, surface} from './src/theme/palette';

function AppShell(): React.JSX.Element {
  const {isBootstrapping} = useAuth();

  if (isBootstrapping) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <LoadingIndicator />
        </View>
      </SafeAreaView>
    );
  }

  return <RootNavigator />;
}

function App(): React.JSX.Element {
  useEffect(() => {
    initCrashReporting();
  }, []);

  return (
    <AppErrorBoundary>
      <GestureHandlerRootView style={styles.container}>
        <SafeAreaProvider>
          {/* Android edge-to-edge is the RN 0.87 default; StatusBar background
              color is set at the native theme level (android/app/src/main/res/
              values/styles.xml), not via the removed StatusBar.backgroundColor
              prop. dark-content matches the new white app-shell background. */}
          <StatusBar barStyle="dark-content" />
          <ReduxProvider store={store}>
            <AppShell />
          </ReduxProvider>
          <SnackbarHost />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </AppErrorBoundary>
  );
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
});

export default App;
