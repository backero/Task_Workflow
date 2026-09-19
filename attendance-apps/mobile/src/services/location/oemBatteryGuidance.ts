/**
 * OEM battery-optimization guidance (Phase 7,
 * docs/architecture/location-tracking.md: "known problem manufacturers ...
 * documented with manufacturer-specific 'disable battery optimization for
 * this app' deep links, surfaced once per OEM the first time a
 * background-tracking gap is detected for that device").
 *
 * `Linking.sendIntent` can only target an intent *action*, not an explicit
 * OEM component (e.g. MIUI's autostart-manager activity) — those are
 * unversioned, change across ROM releases, and silently no-op or crash when
 * wrong. Rather than ship deep links this codebase has no real device to
 * verify, this pairs the one universal, always-correct action
 * (`ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS`, standard AOSP since API 23)
 * with manufacturer-specific *written* guidance text, and opens that
 * settings screen when the user taps through.
 */
import {Linking, NativeModules, Platform} from 'react-native';

const SEEN_OEM_GUIDANCE_KEY = 'backero.oemBatteryGuidanceShown.v1';

const OEM_GUIDANCE: Record<string, string> = {
  xiaomi:
    'MIUI may stop background tracking to save battery. Go to Settings > Apps > Backero Attendance > Battery saver, and choose "No restrictions". Also check Security app > Autostart and enable it for this app.',
  huawei:
    'EMUI/HarmonyOS may stop background tracking to save battery. Go to Settings > Battery > App launch, find Backero Attendance, and switch it to "Manage manually" with all three toggles (Auto-launch, Secondary launch, Run in background) enabled.',
  oppo: 'ColorOS may stop background tracking to save battery. Go to Settings > Battery > App Battery Management, find Backero Attendance, and set it to "Allow background activity".',
  realme:
    'realme UI may stop background tracking to save battery. Go to Settings > Battery > App Battery Management, find Backero Attendance, and set it to "Allow background activity".',
  vivo: 'FuntouchOS/OriginOS may stop background tracking to save battery. Go to Settings > Battery > Background power consumption management, and allow Backero Attendance to run in the background.',
  oneplus:
    'OxygenOS may stop background tracking to save battery. Go to Settings > Battery > Battery optimization, find Backero Attendance, and choose "Don\'t optimize".',
};

const DEFAULT_GUIDANCE =
  'Your phone\'s battery saver may stop background tracking. Please exclude Backero Attendance from battery optimization in your device Settings.';

function getManufacturer(): string {
  if (Platform.OS !== 'android') {
    return '';
  }
  const constants = (NativeModules.PlatformConstants ?? {}) as {Manufacturer?: string};
  return (constants.Manufacturer ?? '').toLowerCase();
}

export function getOemGuidanceText(): string {
  const manufacturer = getManufacturer();
  const match = Object.keys(OEM_GUIDANCE).find(vendor => manufacturer.includes(vendor));
  return match ? OEM_GUIDANCE[match] : DEFAULT_GUIDANCE;
}

export async function openBatteryOptimizationSettings(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }
  try {
    await Linking.sendIntent('android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS');
  } catch {
    // Some OEM ROMs remove this action — fall back to the app's own
    // settings page, which always exists and gets the user close enough.
    try {
      await Linking.openSettings();
    } catch {
      // Nothing more we can do — the guidance dialog's text is still shown.
    }
  }
}

export {SEEN_OEM_GUIDANCE_KEY};
