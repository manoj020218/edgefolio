import { DeviceAdapter, NormalizedMovementEvent, ParsedPush, VerificationMethod } from './deviceAdapter.types';

/**
 * U5-family terminal adapter (HTTP "third-party record push").
 *
 * The vendor's "Face recognition 3.0 API-MQTT" spec (§3.5/3.6) documents the AUTHORITATIVE punch
 * record envelope used over MQTT: `{ type: "note", data: { deviceId, employeeId, employeeName,
 * notePity, noteTime, noteWay, notePass, ... } }`. `noteWay`/`notePass` numeric codes below match
 * that spec. What's still UNCONFIRMED: whether the HTTP "third-party push" feature (a separate
 * toggle from the mqtt/http "Protocol type") reuses this exact envelope or sends something flatter
 * — the vendor doc's own third-party-push section (2.17) is incomplete. So this parser checks for
 * the documented `type`/`data` envelope first, and falls back to a defensive flat-field guess
 * otherwise. It ALWAYS returns the untouched raw record too, so nothing is lost either way — check
 * `GET /api/devices/:id/event-logs` after a real push and adjust here if the fallback path fires.
 */
function firstDefined(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null && obj[key] !== '') return obj[key];
  }
  return undefined;
}

// Per the vendor spec, noteWay only formally documents 0=face / 1="punch in" (translation is
// ambiguous — likely fingerprint or a generic manual/other bucket). The wider mapping below is
// carried over from a separate real-traffic capture of the same device family and kept as the
// best available guess for the values the spec left undocumented.
const METHOD_MAP: Record<string, VerificationMethod> = {
  '0': 'FACE', face: 'FACE',
  '1': 'CARD', card: 'CARD', id_card: 'CARD', '4': 'CARD',
  '2': 'QR', qr: 'QR',
  '3': 'PASSWORD', password: 'PASSWORD',
  '6': 'OTHER', button: 'OTHER',
};

function resolveMethod(raw: unknown): VerificationMethod {
  if (raw === undefined || raw === null) return 'OTHER';
  return METHOD_MAP[String(raw).toLowerCase()] || 'OTHER';
}

// Spec-defined notePass codes: 0 failed, 1 passed, 2 no permission, 4 expired, 5 times used up.
function resolvePassed(raw: unknown): boolean {
  if (raw === undefined || raw === null) return true; // most firmwares only push successful punches
  const s = String(raw).toLowerCase();
  return s === '1' || s === 'true' || s === 'pass' || s === 'success';
}

/** U5 clocks default to China Standard Time (UTC+8) regardless of install location — convert to UTC. */
function resolveTimestamp(raw: unknown, deviceTimezoneOffsetMinutes: number): Date {
  const parsed = raw ? new Date(String(raw).replace(' ', 'T')) : new Date();
  const asUtcMs = Number.isNaN(parsed.getTime()) ? Date.now() : parsed.getTime() - deviceTimezoneOffsetMinutes * 60_000;
  return new Date(asUtcMs);
}

/** Spec-shape parse: `data` is the object documented in API §3.6 (employeeId/noteTime/noteWay/notePass/...). */
function parseSpecRecord(data: Record<string, unknown>, tzOffset: number): NormalizedMovementEvent {
  return {
    deviceExternalUserId: String(data.employeeId ?? 'UNKNOWN'),
    personName: data.employeeName as string | undefined,
    timestamp: resolveTimestamp(data.noteTime, tzOffset),
    method: resolveMethod(data.noteWay),
    passed: resolvePassed(data.notePass),
    raw: data,
  };
}

/** Defensive fallback for whatever shape the HTTP third-party push turns out to actually use. */
function parseFlatRecord(record: Record<string, unknown>, tzOffset: number): NormalizedMovementEvent {
  return {
    deviceExternalUserId: String(firstDefined(record, ['employeeId', 'userid', 'user_id', 'pin', 'id_number']) ?? 'UNKNOWN'),
    personName: firstDefined(record, ['employeeName', 'name', 'username']) as string | undefined,
    timestamp: resolveTimestamp(firstDefined(record, ['noteTime', 'checkin_time', 'time', 'record_time', 'punch_time']), tzOffset),
    method: resolveMethod(firstDefined(record, ['noteWay', 'verify_mode', 'mode'])),
    passed: resolvePassed(firstDefined(record, ['notePass', 'ispass', 'status', 'result'])),
    raw: record,
  };
}

export const u5Adapter: DeviceAdapter = {
  make: 'U5',
  parse(rawBody: unknown, deviceTimezoneOffsetMinutes: number): ParsedPush {
    if (!rawBody || typeof rawBody !== 'object') {
      return { events: [], warning: 'Push body was empty or not an object' };
    }
    const body = rawBody as Record<string, unknown>;

    // Documented envelope: { type: "note"|"heart"|..., data: {...} }
    if (typeof body.type === 'string') {
      if (body.type === 'heart') return { events: [] }; // heartbeat, not a movement event — nothing to log as a warning
      if (body.type === 'note' && body.data && typeof body.data === 'object') {
        return { events: [parseSpecRecord(body.data as Record<string, unknown>, deviceTimezoneOffsetMinutes)] };
      }
      return { events: [], warning: `Unhandled push type "${body.type}"` };
    }

    // Fallback: batch of flat records, several possible wrapper keys.
    const records = Array.isArray(body.data) ? body.data
      : Array.isArray(body.records) ? body.records
      : Array.isArray(rawBody) ? (rawBody as unknown[])
      : [body];

    const events = records
      .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
      .map((r) => parseFlatRecord(r, deviceTimezoneOffsetMinutes));

    return events.length ? { events } : { events: [], warning: 'No recognizable record fields in push body' };
  },
};
