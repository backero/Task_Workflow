/**
 * Implementation detail behind `LocationService` (docs/architecture/
 * location-tracking.md). Foreground tracking (Phase 6) plus background
 * keep-alive, OEM battery-optimization guidance, and app-kill/reboot
 * session resume (Phase 7).
 *
 * Failure-mode behavior implemented here, matching the spec table:
 * - Permission denied -> PERMISSION_DENIED status, session never starts.
 * - GPS disabled / position unavailable -> GPS_DISABLED status; the session
 *   stays "started" (never silently ended) and resumes once GPS returns.
 * - Poor accuracy -> the point is still queued/uploaded, never dropped;
 *   `lastSample.accuracyMeters` lets the UI show a "weak signal" indicator.
 * - Offline -> points go to the bounded offline queue and are retried with
 *   backoff via a NetInfo connectivity listener.
 * - Background restriction (OEM battery killer) -> detected via a
 *   missed-heartbeat check on foreground; surfaces `oemGuidanceMessage`
 *   once per install rather than on every app open.
 * - App kill / reboot with a session left open -> never silently resumed;
 *   surfaced as `pendingResumeSessionId` for the UI to prompt.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import Geolocation, {type GeolocationError, type GeolocationResponse} from '@react-native-community/geolocation';
import {AppState, type AppStateStatus, PermissionsAndroid, Platform} from 'react-native';

import {endFieldSession, startFieldSession, uploadLocationBatch} from '../../api/locations';
import type {LocationPointPayload, SessionEndReason} from '../../types/models';
import {generateClientPointId} from './clientPointId';
import {startForegroundKeepAlive, stopForegroundKeepAlive, subscribeToHeartbeat} from './nativeForegroundService';
import {getOemGuidanceText, openBatteryOptimizationSettings} from './oemBatteryGuidance';
import {clearQueue, enqueuePoint, getDroppedPointCount, peekQueue, removeUploaded} from './offlineQueue';
import type {LocationSample, PermissionResult, TrackingListener, TrackingSnapshot, TrackingStatus} from './types';

const MAX_BATCH_SIZE = 200; // matches LocationBatchRequest.points max_length server-side
const RETRY_BACKOFF_MS = 15_000;
const PERSISTED_SESSION_KEY = 'backero.locationSession.v1';
const SEEN_OEM_GUIDANCE_KEY = 'backero.oemBatteryGuidanceShown.v1';
const MISSED_HEARTBEAT_MULTIPLIER = 2;

interface PersistedSession {
  sessionId: string;
  intervalSeconds: number;
}

class LocationTrackingManager {
  private status: TrackingStatus = 'IDLE';
  private sessionId: string | null = null;
  private intervalSeconds: number | null = null;
  private lastSample: LocationSample | null = null;
  private queuedPointCount = 0;
  private pendingResumeSessionId: string | null = null;
  private oemGuidanceMessage: string | null = null;
  private oemGuidanceShownThisInstall = false;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private backoffHandle: ReturnType<typeof setTimeout> | null = null;
  private unsubscribeNetInfo: (() => void) | null = null;
  private unsubscribeAppState: (() => void) | null = null;
  private unsubscribeHeartbeat: (() => void) | null = null;
  private listeners = new Set<TrackingListener>();

  constructor() {
    this.checkForPendingSession();
  }

  subscribeToLocationUpdates(listener: TrackingListener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.listeners.delete(listener);
  }

  getTrackingStatus(): TrackingStatus {
    return this.status;
  }

  async requestPermission(): Promise<PermissionResult> {
    if (Platform.OS !== 'android') {
      // iOS is out of scope for this phase (spec: "Android first, iOS later
      // without rework") — fail closed rather than silently pretend granted.
      return 'DENIED';
    }
    const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    return result === PermissionsAndroid.RESULTS.GRANTED ? 'GRANTED' : 'DENIED';
  }

  getCurrentLocation(): Promise<LocationSample> {
    return new Promise((resolve, reject) => {
      Geolocation.getCurrentPosition(
        (position: GeolocationResponse) => resolve(this.toSample(position)),
        (error: GeolocationError) => reject(this.mapGeolocationError(error)),
        {enableHighAccuracy: true, timeout: 20_000, maximumAge: 0},
      );
    });
  }

  async startTracking(): Promise<{sessionId: string; intervalSeconds: number}> {
    this.setStatus('STARTING');

    const permission = await this.requestPermission();
    if (permission === 'DENIED') {
      this.setStatus('PERMISSION_DENIED');
      throw new Error('Location permission was denied.');
    }

    const started = await startFieldSession();
    await this.beginTracking(started.id, started.location_interval_seconds);
    return {sessionId: started.id, intervalSeconds: started.location_interval_seconds};
  }

  /** Phase 7: resume a session a previous app run left open, without
   * re-calling `POST /locations/sessions/start` (it's still open server-side). */
  async resumePendingSession(): Promise<void> {
    const pending = this.pendingResumeSessionId;
    if (!pending) {
      return;
    }
    const persisted = await this.readPersistedSession();
    this.pendingResumeSessionId = null;
    if (!persisted || persisted.sessionId !== pending) {
      this.notify();
      return;
    }
    const permission = await this.requestPermission();
    if (permission === 'DENIED') {
      this.setStatus('PERMISSION_DENIED');
      return;
    }
    await this.beginTracking(persisted.sessionId, persisted.intervalSeconds);
  }

  /** Phase 7: explicitly end a session a previous app run left open, rather
   * than resuming it. */
  async discardPendingSession(): Promise<void> {
    const pending = this.pendingResumeSessionId;
    this.pendingResumeSessionId = null;
    await this.clearPersistedSession();
    if (pending) {
      try {
        await endFieldSession(pending, 'APP_KILLED');
      } catch {
        // Best-effort — the backend's timeout sweep closes it eventually if
        // this fails (e.g. offline).
      }
    }
    this.notify();
  }

  dismissOemGuidance(): void {
    this.oemGuidanceMessage = null;
    AsyncStorage.setItem(SEEN_OEM_GUIDANCE_KEY, 'true').catch(() => {});
    this.notify();
  }

  async stopTracking(reason: SessionEndReason = 'MANUAL'): Promise<void> {
    const sessionId = this.sessionId;
    if (!sessionId) {
      return;
    }
    this.setStatus('STOPPING');
    this.stopTimers();
    await stopForegroundKeepAlive();

    await this.flushQueue();
    try {
      await endFieldSession(sessionId, reason);
    } finally {
      // Local tracking always stops on the device regardless of whether the
      // server-side end-session call succeeded — an offline "end" attempt
      // leaves the session open server-side until the timeout sweep closes
      // it (backend/app/tasks/timeout_stale_sessions.py), rather than the
      // device pretending it never stopped. Any points that couldn't be
      // flushed are discarded rather than kept: a new session can't accept
      // points recorded under a different (now-ended) session_id, so
      // holding them would only ever grow the queue toward its cap.
      await clearQueue();
      await this.clearPersistedSession();
      this.sessionId = null;
      this.intervalSeconds = null;
      this.lastSample = null;
      this.queuedPointCount = 0;
      this.setStatus('IDLE');
    }
  }

  private async beginTracking(sessionId: string, intervalSeconds: number): Promise<void> {
    this.sessionId = sessionId;
    this.intervalSeconds = intervalSeconds;
    await clearQueue();
    await this.persistSession({sessionId, intervalSeconds});
    this.setStatus('TRACKING');

    this.unsubscribeNetInfo = NetInfo.addEventListener(state => {
      if (state.isConnected) {
        this.flushQueue();
      }
    });
    this.unsubscribeAppState = AppState.addEventListener('change', this.handleAppStateChange).remove;

    // Best-effort — background permission is requested as a separate,
    // follow-up runtime prompt (Android 30+ requirement); if denied,
    // foreground-only tracking still works exactly as Phase 6 did (Phase 7
    // regression requirement).
    await this.requestBackgroundPermissionAndStartKeepAlive(intervalSeconds);

    this.tick();
    this.intervalHandle = setInterval(() => this.tick(), intervalSeconds * 1000);
  }

  private stopTimers(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    if (this.backoffHandle) {
      clearTimeout(this.backoffHandle);
      this.backoffHandle = null;
    }
    this.unsubscribeNetInfo?.();
    this.unsubscribeNetInfo = null;
    this.unsubscribeAppState?.();
    this.unsubscribeAppState = null;
    this.unsubscribeHeartbeat?.();
    this.unsubscribeHeartbeat = null;
  }

  private async requestBackgroundPermissionAndStartKeepAlive(intervalSeconds: number): Promise<void> {
    if (Platform.OS !== 'android') {
      return;
    }
    try {
      if (Platform.Version >= 33) {
        await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
      }
      const backgroundGranted =
        Platform.Version >= 29
          ? (await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION)) ===
            PermissionsAndroid.RESULTS.GRANTED
          : true; // pre-Android-10: foreground grant already covers background
      if (backgroundGranted) {
        await startForegroundKeepAlive(intervalSeconds);
        // Drives tick() while backgrounded — see nativeForegroundService.ts
        // for why a plain JS setInterval isn't sufficient on its own.
        this.unsubscribeHeartbeat = subscribeToHeartbeat(() => this.tick());
      }
    } catch {
      // Background permission is optional for Phase 6 parity — swallow and
      // continue with foreground-only tracking.
    }
  }

  private handleAppStateChange = (nextState: AppStateStatus): void => {
    if (nextState !== 'active' || this.status !== 'TRACKING' || this.oemGuidanceShownThisInstall) {
      return;
    }
    if (!this.lastSample || !this.intervalSeconds) {
      return;
    }
    const elapsedSeconds = (Date.now() - new Date(this.lastSample.recordedAt).getTime()) / 1000;
    if (elapsedSeconds > this.intervalSeconds * MISSED_HEARTBEAT_MULTIPLIER) {
      this.oemGuidanceShownThisInstall = true;
      this.oemGuidanceMessage = getOemGuidanceText();
      this.notify();
    }
  };

  async openOemBatterySettings(): Promise<void> {
    await openBatteryOptimizationSettings();
  }

  private async checkForPendingSession(): Promise<void> {
    try {
      const seenGuidance = await AsyncStorage.getItem(SEEN_OEM_GUIDANCE_KEY);
      this.oemGuidanceShownThisInstall = seenGuidance === 'true';

      const persisted = await this.readPersistedSession();
      if (persisted && !this.sessionId) {
        this.pendingResumeSessionId = persisted.sessionId;
        this.notify();
      }
    } catch {
      // No persisted state — fine, nothing to resume.
    }
  }

  private async persistSession(session: PersistedSession): Promise<void> {
    try {
      await AsyncStorage.setItem(PERSISTED_SESSION_KEY, JSON.stringify(session));
    } catch {
      // Best-effort — worst case, a killed app can't offer a resume prompt.
    }
  }

  private async readPersistedSession(): Promise<PersistedSession | null> {
    try {
      const raw = await AsyncStorage.getItem(PERSISTED_SESSION_KEY);
      return raw ? (JSON.parse(raw) as PersistedSession) : null;
    } catch {
      return null;
    }
  }

  private async clearPersistedSession(): Promise<void> {
    try {
      await AsyncStorage.removeItem(PERSISTED_SESSION_KEY);
    } catch {
      // Best-effort.
    }
  }

  private async tick(): Promise<void> {
    if (!this.sessionId) {
      return;
    }
    try {
      const sample = await this.getCurrentLocation();
      this.lastSample = sample;
      if (this.status !== 'TRACKING') {
        this.setStatus('TRACKING');
      } else {
        this.notify();
      }
      const point: LocationPointPayload = {
        client_point_id: generateClientPointId(),
        latitude: sample.latitude,
        longitude: sample.longitude,
        accuracy_meters: sample.accuracyMeters,
        device_info: `${Platform.OS} ${Platform.Version}`,
        recorded_at: sample.recordedAt,
      };
      await enqueuePoint(point);
      await this.flushQueue();
    } catch (error) {
      const status = error instanceof GeolocationMappedError ? error.status : null;
      if (status === 'GPS_DISABLED') {
        // Session stays "started" per spec — no points until GPS returns,
        // never a silent stop.
        this.setStatus('GPS_DISABLED');
      } else if (status === 'PERMISSION_DENIED') {
        // Permission was revoked mid-session (e.g. via OS settings) — the
        // session cannot continue without it.
        await this.stopTracking('APP_KILLED');
      }
      // TIMEOUT (a single slow GPS fix) is treated as a transient miss —
      // status is left as-is and the next tick tries again.
    }
  }

  private async flushQueue(): Promise<void> {
    if (!this.sessionId) {
      return;
    }
    let queued = await peekQueue();
    if (queued.length === 0) {
      this.queuedPointCount = 0;
      this.notify();
      return;
    }
    const batch = queued.slice(0, MAX_BATCH_SIZE);
    try {
      await uploadLocationBatch(this.sessionId, batch);
      await removeUploaded(batch.map(point => point.client_point_id));
      queued = await peekQueue();
    } catch {
      // Offline or the request failed — leave the queue in place. The
      // NetInfo listener retries on reconnect; this backoff covers the case
      // where connectivity is flaky rather than fully absent.
      if (!this.backoffHandle) {
        this.backoffHandle = setTimeout(() => {
          this.backoffHandle = null;
          this.flushQueue();
        }, RETRY_BACKOFF_MS);
      }
    }
    this.queuedPointCount = queued.length;
    this.notify();
  }

  private toSample(position: GeolocationResponse): LocationSample {
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracyMeters: position.coords.accuracy ?? null,
      recordedAt: new Date(position.timestamp).toISOString(),
    };
  }

  private mapGeolocationError(error: GeolocationError): GeolocationMappedError {
    if (error.code === error.PERMISSION_DENIED) {
      return new GeolocationMappedError('PERMISSION_DENIED', error.message);
    }
    if (error.code === error.POSITION_UNAVAILABLE) {
      return new GeolocationMappedError('GPS_DISABLED', error.message);
    }
    return new GeolocationMappedError('TIMEOUT', error.message);
  }

  private setStatus(status: TrackingStatus): void {
    this.status = status;
    this.notify();
  }

  private getSnapshot(): TrackingSnapshot {
    return {
      status: this.status,
      sessionId: this.sessionId,
      lastSample: this.lastSample,
      queuedPointCount: this.queuedPointCount,
      droppedPointCount: getDroppedPointCount(),
      pendingResumeSessionId: this.pendingResumeSessionId,
      oemGuidanceMessage: this.oemGuidanceMessage,
    };
  }

  private notify(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}

class GeolocationMappedError extends Error {
  status: 'PERMISSION_DENIED' | 'GPS_DISABLED' | 'TIMEOUT';

  constructor(status: 'PERMISSION_DENIED' | 'GPS_DISABLED' | 'TIMEOUT', message: string) {
    super(message);
    this.status = status;
  }
}

export const locationTrackingManager = new LocationTrackingManager();
