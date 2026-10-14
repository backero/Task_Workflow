/**
 * Bounded, persisted offline queue for location points
 * (docs/architecture/location-tracking.md §8): bounded by both max size and
 * max age, dropping the *oldest* points first and counting drops rather than
 * growing unboundedly on-device. Persisted to AsyncStorage so a queued point
 * survives the app being backgrounded/killed between retries (full
 * session-resume-after-kill UX is Phase 7 scope; this is just durable
 * storage for the queue itself).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import type {LocationPointPayload} from '../../types/models';

const STORAGE_KEY = 'backero.locationQueue.v1';
const MAX_QUEUE_SIZE = 500;
const MAX_QUEUE_AGE_MS = 24 * 60 * 60 * 1000;

let droppedPointCount = 0;

async function readQueue(): Promise<LocationPointPayload[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as LocationPointPayload[]) : [];
  } catch {
    return [];
  }
}

async function writeQueue(points: LocationPointPayload[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(points));
  } catch {
    // Best-effort persistence — an in-memory-only queue for this app
    // session is still better than crashing tracking over a storage error.
  }
}

function pruneExpired(points: LocationPointPayload[]): LocationPointPayload[] {
  const cutoff = Date.now() - MAX_QUEUE_AGE_MS;
  const kept: LocationPointPayload[] = [];
  for (const point of points) {
    if (new Date(point.recorded_at).getTime() >= cutoff) {
      kept.push(point);
    } else {
      droppedPointCount += 1;
    }
  }
  return kept;
}

export async function enqueuePoint(point: LocationPointPayload): Promise<void> {
  let points = pruneExpired(await readQueue());
  points.push(point);
  while (points.length > MAX_QUEUE_SIZE) {
    points.shift();
    droppedPointCount += 1;
  }
  await writeQueue(points);
}

export async function peekQueue(): Promise<LocationPointPayload[]> {
  const points = pruneExpired(await readQueue());
  await writeQueue(points);
  return points;
}

export async function removeUploaded(clientPointIds: string[]): Promise<void> {
  const idsToRemove = new Set(clientPointIds);
  const remaining = (await readQueue()).filter(point => !idsToRemove.has(point.client_point_id));
  await writeQueue(remaining);
}

export async function clearQueue(): Promise<void> {
  droppedPointCount = 0;
  await writeQueue([]);
}

export function getDroppedPointCount(): number {
  return droppedPointCount;
}
