/**
 * Token persistence + in-memory cache. AsyncStorage (unencrypted) is an
 * accepted Phase 5 limitation, not the final posture — see docs/roadmap.md
 * Phase 5 notes: moving to Keychain/Keystore-backed secure storage
 * (react-native-keychain) is a Phase 11 hardening candidate. Access tokens
 * are short-lived (15 min, backend/app/core/config.py) which bounds the
 * exposure window in the meantime.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const ACCESS_TOKEN_KEY = 'backero.access_token';
const REFRESH_TOKEN_KEY = 'backero.refresh_token';

let accessToken: string | null = null;
let refreshToken: string | null = null;
let onSessionExpired: (() => void) | null = null;

export async function loadPersistedTokens(): Promise<void> {
  const [storedAccess, storedRefresh] = await Promise.all([
    AsyncStorage.getItem(ACCESS_TOKEN_KEY),
    AsyncStorage.getItem(REFRESH_TOKEN_KEY),
  ]);
  accessToken = storedAccess;
  refreshToken = storedRefresh;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function getRefreshToken(): string | null {
  return refreshToken;
}

export async function setTokens(tokens: {access_token: string; refresh_token: string}): Promise<void> {
  accessToken = tokens.access_token;
  refreshToken = tokens.refresh_token;
  await AsyncStorage.multiSet([
    [ACCESS_TOKEN_KEY, tokens.access_token],
    [REFRESH_TOKEN_KEY, tokens.refresh_token],
  ]);
}

export async function clearTokens(): Promise<void> {
  accessToken = null;
  refreshToken = null;
  await AsyncStorage.multiRemove([ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY]);
}

/** Registered by store/index.ts so api/client.ts can force a Redux-driven
 * logout on a refresh failure without either module importing the other. */
export function setSessionExpiredHandler(handler: (() => void) | null): void {
  onSessionExpired = handler;
}

export function notifySessionExpired(): void {
  onSessionExpired?.();
}
