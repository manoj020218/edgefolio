import { Preferences } from '@capacitor/preferences';
import { apiPost } from './api';

const QUEUE_KEY = 'edgefolio.offlineQueue';

export interface QueuedCheckIn {
  kind: 'checkin';
  id: string;
  queuedAt: string;
  payload: {
    empId: string;
    workType: 'tour' | 'wfh';
    timestamp: string;
    similarity: number;
    liveness: 'PASSED';
    location: { lat: number; lon: number; accuracy?: number };
  };
}

export interface QueuedCheckOut {
  kind: 'checkout';
  id: string;
  queuedAt: string;
  payload: { timestamp: string };
}

export type QueueItem = QueuedCheckIn | QueuedCheckOut;

async function readQueue(): Promise<QueueItem[]> {
  const { value } = await Preferences.get({ key: QUEUE_KEY });
  if (!value) return [];
  try {
    return JSON.parse(value) as QueueItem[];
  } catch {
    return [];
  }
}

async function writeQueue(items: QueueItem[]): Promise<void> {
  await Preferences.set({ key: QUEUE_KEY, value: JSON.stringify(items) });
}

export async function getQueue(): Promise<QueueItem[]> {
  return readQueue();
}

export async function getPendingCount(): Promise<number> {
  return (await readQueue()).length;
}

export async function enqueue(item: QueueItem): Promise<void> {
  const items = await readQueue();
  items.push(item);
  await writeQueue(items);
}

// Replays queued items in order through the same endpoints an online call
// would hit (POST /attendance, POST /attendance/checkout) — no separate
// offline-only server code path to keep in sync with the real first-in/
// last-out attendance logic. Stops at the first failure so order is
// preserved and nothing is skipped; whatever's left stays queued for the
// next successful sync.
export async function syncQueue(onProgress?: (remaining: number) => void): Promise<{ synced: number; failed: boolean }> {
  const items = await readQueue();
  let synced = 0;
  for (const item of items) {
    try {
      if (item.kind === 'checkin') {
        await apiPost('/attendance', item.payload);
      } else {
        await apiPost('/attendance/checkout', item.payload);
      }
      synced++;
      onProgress?.(items.length - synced);
    } catch {
      await writeQueue(items.slice(synced));
      return { synced, failed: true };
    }
  }
  await writeQueue([]);
  return { synced, failed: false };
}
