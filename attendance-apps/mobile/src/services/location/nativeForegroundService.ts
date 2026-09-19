/**
 * Thin wrapper around the native `LocationTrackingService` module
 * (android/.../LocationTrackingModule.kt, Phase 7). Never imported by
 * screens/UI — only `LocationTrackingManager` talks to this, matching the
 * "swap the implementation without touching call sites" principle.
 *
 * The module is Android-only and only exists once the app has been rebuilt
 * with the native code in `android/app/src/main/java/...` — every call is
 * wrapped so a missing module (iOS, or a JS-only Metro reload before a
 * native rebuild) degrades to foreground-only tracking rather than
 * throwing, per the Phase 7 regression requirement that foreground tracking
 * stays fully functional independent of background tracking.
 *
 * The native service periodically emits `HEARTBEAT_EVENT` on the global
 * `DeviceEventEmitter` (not scoped to this module) — a plain JS
 * `setInterval` gets throttled once Android backgrounds the app, but a
 * native-triggered bridge event isn't subject to that same throttling, so
 * it's what actually drives `LocationTrackingManager.tick()` while
 * backgrounded. Confirmed live: without this, no new points arrived for
 * several minutes with only the notification-holding service running.
 */
import {DeviceEventEmitter, NativeModules, Platform} from 'react-native';

export const HEARTBEAT_EVENT = 'BackeroLocationHeartbeat';

interface NativeLocationTrackingService {
  start(intervalSeconds: number): Promise<null>;
  stop(): Promise<null>;
}

const nativeModule: NativeLocationTrackingService | undefined = NativeModules.LocationTrackingService;

export async function startForegroundKeepAlive(intervalSeconds: number): Promise<void> {
  if (Platform.OS !== 'android' || !nativeModule) {
    return;
  }
  try {
    await nativeModule.start(intervalSeconds);
  } catch {
    // Best-effort — JS-side foreground polling still works without this.
  }
}

export async function stopForegroundKeepAlive(): Promise<void> {
  if (Platform.OS !== 'android' || !nativeModule) {
    return;
  }
  try {
    await nativeModule.stop();
  } catch {
    // Best-effort.
  }
}

export function subscribeToHeartbeat(listener: () => void): () => void {
  const subscription = DeviceEventEmitter.addListener(HEARTBEAT_EVENT, listener);
  return () => subscription.remove();
}
