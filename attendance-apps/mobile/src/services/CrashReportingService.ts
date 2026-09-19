/**
 * Sentry RN wrapper (spec §12/§24, mirrors the backend's `services/
 * error_tracking.py` pattern: swappable, and a safe no-op with no DSN
 * configured rather than a hard failure). Phase 5 wires this into the app
 * error boundary; a missing DSN means crashes are still caught (never a
 * white screen) but not reported anywhere beyond the device console.
 */
import * as Sentry from '@sentry/react-native';

import {SENTRY_DSN} from '../config';

let initialized = false;

export function initCrashReporting(): void {
  if (!SENTRY_DSN) {
    return;
  }
  Sentry.init({dsn: SENTRY_DSN, tracesSampleRate: 0.2});
  initialized = true;
}

export function captureException(error: unknown): void {
  if (!initialized) {
    console.error('[CrashReportingService] (Sentry not configured) captured:', error);
    return;
  }
  Sentry.captureException(error);
}
