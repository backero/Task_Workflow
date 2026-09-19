/**
 * Shared types for the location-tracking service layer
 * (docs/architecture/location-tracking.md). Screens/UI code only ever import
 * from `./LocationService`, never these implementation-detail types
 * directly from `LocationTrackingManager`.
 */

export type TrackingStatus =
  | 'IDLE'
  | 'STARTING'
  | 'TRACKING'
  | 'GPS_DISABLED'
  | 'PERMISSION_DENIED'
  | 'STOPPING';

export type PermissionResult = 'GRANTED' | 'DENIED';

export interface LocationSample {
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  recordedAt: string;
}

export interface TrackingSnapshot {
  status: TrackingStatus;
  sessionId: string | null;
  lastSample: LocationSample | null;
  queuedPointCount: number;
  droppedPointCount: number;
  /** Phase 7: a session was left open by a previous app run (kill/crash/
   * reboot) — surfaced so the UI can prompt resume-or-end, never silently
   * auto-resumed. */
  pendingResumeSessionId: string | null;
  /** Phase 7: set once a missed-heartbeat pattern suggests the OS killed
   * background tracking for this device; cleared via `dismissOemGuidance()`. */
  oemGuidanceMessage: string | null;
}

export type TrackingListener = (snapshot: TrackingSnapshot) => void;
