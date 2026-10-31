export type VerificationMethod = 'FINGER' | 'CARD' | 'PASSWORD' | 'FACE' | 'QR' | 'OTHER';

export interface NormalizedMovementEvent {
  /** The person identifier as known to the device (e.g. its internal userid/pin) — not yet
   *  resolved to a Jenix Resident/Student. That mapping is a later, adapter-independent step. */
  deviceExternalUserId: string;
  personName?: string;
  timestamp: Date;
  method: VerificationMethod;
  /** Did the device itself grant access for this record? Kept separate from "we received a push"
   *  since some firmwares report denied/failed attempts too. */
  passed: boolean;
  /** Untouched original payload for this single record, so nothing is lost even if our field
   *  parsing guesses turn out wrong once tested against real hardware. */
  raw: Record<string, unknown>;
}

export interface ParsedPush {
  events: NormalizedMovementEvent[];
  /** Set when the payload didn't match any known shape for this adapter — the raw body is still
   *  stored by the caller regardless, this is just a signal for "the parser needs updating." */
  warning?: string;
}

export interface DeviceAdapter {
  /** Matches Device.make (uppercase) — e.g. 'U5'. */
  readonly make: string;
  /** Parse one HTTP push body from this device brand into normalized event(s). A single push
   *  can carry a batch of records, hence an array. */
  parse(rawBody: unknown, deviceTimezoneOffsetMinutes: number): ParsedPush;
}
