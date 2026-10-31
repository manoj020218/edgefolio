/**
 * Standalone U5 attendance poller — run this on a machine with LAN access to the device
 * (the cloud backend cannot reach the device's private IP). It has no dependency on the
 * rest of this backend; it only needs network access to the device and to the deployed
 * push endpoint (POST /api/devices/push/:apiKey), which is already live.
 *
 * Usage:
 *   U5_IP=192.168.1.92 U5_PASSWORD=123456 PUSH_URL=https://community.iotsoft.in/api/devices/push/<apiKey> \
 *     npx ts-node scripts/u5Poller.ts
 *
 * Env vars:
 *   U5_IP          device LAN IP (required)
 *   U5_PASSWORD    device admin password (default: 123456)
 *   PUSH_URL       full Jenix push URL including the device's apiKey (required)
 *   POLL_MS        poll interval in ms (default: 15000)
 *   STATE_FILE     where to persist the last-seen timestamp (default: ./u5-poller-state.json)
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';

const U5_IP = process.env.U5_IP;
const U5_PASSWORD = process.env.U5_PASSWORD || '123456';
const PUSH_URL = process.env.PUSH_URL;
const POLL_MS = Number(process.env.POLL_MS) || 15000;
const STATE_FILE = process.env.STATE_FILE || './u5-poller-state.json';

if (!U5_IP || !PUSH_URL) {
  console.error('Missing required env vars. Need U5_IP and PUSH_URL — see file header for usage.');
  process.exit(1);
}

interface WorkNoteRow {
  userid?: string; userId?: string; checkin_time: string;
  ispass?: number; id_number?: string; name?: string; temp?: number;
}

function loadLastSeen(): number {
  if (!existsSync(STATE_FILE)) return 0;
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8')).lastSeenMs ?? 0;
  } catch {
    return 0;
  }
}

function saveLastSeen(ms: number): void {
  writeFileSync(STATE_FILE, JSON.stringify({ lastSeenMs: ms }));
}

async function fetchWorkNoteList(): Promise<WorkNoteRow[]> {
  const res = await fetch(`http://${U5_IP}/getWorkNoteList`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: U5_PASSWORD, type: 2 }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Device HTTP ${res.status}`);
  const data = (await res.json()) as { result?: number; code?: number; data?: WorkNoteRow[] };
  const failed = (data.result !== undefined && data.result !== 0) || (data.code !== undefined && data.code !== 200);
  if (failed) throw new Error(`Device returned failure (result=${data.result}, code=${data.code})`);
  return data.data || [];
}

async function pushToJenix(rows: WorkNoteRow[]): Promise<void> {
  const res = await fetch(PUSH_URL!, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: rows }),
    signal: AbortSignal.timeout(15000),
  });
  const body = (await res.json().catch(() => ({}))) as { data?: { received?: number; warning?: string } };
  console.log(`[push] status=${res.status} received=${body.data?.received ?? '?'} warning=${body.data?.warning ?? '-'}`);
}

async function pollOnce(): Promise<void> {
  const lastSeen = loadLastSeen();
  let rows: WorkNoteRow[];
  try {
    rows = await fetchWorkNoteList();
  } catch (err) {
    console.error(`[poll] failed to reach device: ${(err as Error).message}`);
    return;
  }

  const fresh = rows.filter((r) => {
    const t = new Date(r.checkin_time).getTime();
    return !isNaN(t) && t > lastSeen;
  });

  if (fresh.length === 0) {
    console.log(`[poll] ${rows.length} total record(s) on device, none newer than last check`);
    return;
  }

  console.log(`[poll] ${fresh.length} new record(s) — pushing to Jenix`);
  await pushToJenix(fresh);

  const newestMs = Math.max(...fresh.map((r) => new Date(r.checkin_time).getTime()));
  saveLastSeen(newestMs);
}

console.log(`U5 poller starting — device=${U5_IP} pushTo=${PUSH_URL} intervalMs=${POLL_MS}`);
pollOnce();
setInterval(pollOnce, POLL_MS);
