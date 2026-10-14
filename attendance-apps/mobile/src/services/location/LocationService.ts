/**
 * The ONLY module screen/UI code should import for location tracking
 * (docs/architecture/location-tracking.md — "Application/UI code never
 * imports the underlying location library directly"). Everything else in
 * `services/location/` is an implementation detail of
 * `LocationTrackingManager` and may be swapped without touching call sites.
 */
import {locationTrackingManager} from './LocationTrackingManager';
import type {LocationSample, PermissionResult, TrackingListener, TrackingStatus} from './types';

export interface LocationService {
  requestPermission(): Promise<PermissionResult>;
  getTrackingStatus(): TrackingStatus;
  getCurrentLocation(): Promise<LocationSample>;
  startTracking(): Promise<{sessionId: string; intervalSeconds: number}>;
  stopTracking(): Promise<void>;
  subscribeToLocationUpdates(listener: TrackingListener): () => void;
  // Phase 7 additions — app-kill/reboot resume prompt and OEM
  // battery-optimization guidance (docs/architecture/location-tracking.md).
  resumePendingSession(): Promise<void>;
  discardPendingSession(): Promise<void>;
  dismissOemGuidance(): void;
  openOemBatterySettings(): Promise<void>;
}

export const locationService: LocationService = locationTrackingManager;

export type {LocationSample, PermissionResult, TrackingListener, TrackingSnapshot, TrackingStatus} from './types';
