'use strict';
/**
 * m68Protocol.js — Pure protocol functions for the WitEasy M68 BS (B/S) protocol.
 *
 * All functions are pure (no DB, no network) so they are fully unit-testable.
 *
 * VERIFIED BYTE LAYOUT from FKDataHS100.cs constructor (lines 142-151):
 *   byte[0]   Valid      — must be 1
 *   bytes[1-2] tmMode    — 16-bit LE BitVector32
 *                          bits 0-5  = VerifyMode (sctKind = first 6-bit section)
 *                          bits 6-7  = InOut      (sctInOut = next 2-bit section)
 *   byte[3]   Second
 *   bytes[4-7] UserId    — uint32 LE
 *   bytes[8-11] tmLog    — int32 LE BitVector32
 *                          bits 0-11  = Year  (real year - 1900, range 100-200 → 2000-2100)
 *                          bits 12-15 = Month (1-12)
 *                          bits 16-20 = Day   (1-31)
 *                          bits 21-25 = Hour  (0-23)
 *                          bits 26-31 = Minute (0-59)
 *
 * NOTE: The plan §1 listed the CIF11 C struct layout (UserID first), but the C# GLog
 * class in FKDataHS100.cs reads the bytes differently — Valid is first, then tmMode
 * (a 2-byte char), then Second, then UserId.  The C# constructor is authoritative for
 * what the M68 device actually sends.
 *
 * RESPONSE FORMAT (from Default.aspx.cs SendResponseToClient):
 *   HTTP 200, Content-Type: application/octet-stream
 *   Headers: response_code, trans_id, cmd_code   (+ optional encrypt header)
 *   Body: BSComm binary buffer OR empty (Content-Length: 0)
 *
 * BSComm binary format (from FKWebTrans.cs GetJsonBlock / SetJsonBlock):
 *   [4 bytes LE uint32 = json_len+1] [json_bytes] [0x00] [optional binary blocks...]
 *   Binary block: [4 bytes LE uint32 = block_len] [block_bytes]
 */

// ── BitVector32 helpers (C# compatible) ─────────────────────────────────────

/**
 * Extract a bit-field from a 32-bit integer value.
 * BitVector32.Section is allocated LSB-first: the first section starts at bit 0.
 * @param {number} value  — 32-bit integer (JS number, treated as signed)
 * @param {number} shift  — bit offset of the section start
 * @param {number} mask   — mask of the section width (e.g. 0x3FF for 10 bits)
 */
function bv32Get(value, shift, mask) {
  return (value >>> shift) & mask;
}

// tmMode sections (16-bit value, treated as uint16)
// sctKind  = CreateSection((1<<6)-1)         → shift=0, mask=0x3F
// sctInOut = CreateSection((1<<2)-1, sctKind) → shift=6, mask=0x03
const TM_MODE_VERIFY_SHIFT = 0;
const TM_MODE_VERIFY_MASK  = 0x3F;
const TM_MODE_INOUT_SHIFT  = 6;
const TM_MODE_INOUT_MASK   = 0x03;

// tmLog sections (32-bit value)
// sctYear   = CreateSection((1<<12)-1)              → shift=0,  mask=0xFFF
// sctMonth  = CreateSection((1<<4)-1,  sctYear)     → shift=12, mask=0x0F
// sctDay    = CreateSection((1<<5)-1,  sctMonth)    → shift=16, mask=0x1F
// sctHour   = CreateSection((1<<5)-1,  sctDay)      → shift=21, mask=0x1F
// sctMinute = CreateSection((1<<6)-1,  sctHour)     → shift=26, mask=0x3F
const TM_YEAR_SHIFT   = 0;  const TM_YEAR_MASK   = 0xFFF;
const TM_MONTH_SHIFT  = 12; const TM_MONTH_MASK  = 0x0F;
const TM_DAY_SHIFT    = 16; const TM_DAY_MASK    = 0x1F;
const TM_HOUR_SHIFT   = 21; const TM_HOUR_MASK   = 0x1F;
const TM_MINUTE_SHIFT = 26; const TM_MINUTE_MASK = 0x3F;

// ── fkTime14 ─────────────────────────────────────────────────────────────────

/**
 * Format a Date as the 14-char FK time string "YYYYMMDDHHMMSS".
 * @param {Date} date
 * @returns {string}
 */
function fkTime14(date) {
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  return (
    pad(date.getFullYear(), 4) +
    pad(date.getMonth() + 1) +
    pad(date.getDate()) +
    pad(date.getHours()) +
    pad(date.getMinutes()) +
    pad(date.getSeconds())
  );
}

// ── parseRequest ─────────────────────────────────────────────────────────────

/**
 * Parse a raw incoming HTTP request into a normalised object.
 *
 * Supports:
 *   Content-Type: application/octet-stream
 *     — dev_id, request_code, trans_id, blk_no, blk_len in HTTP headers
 *     — binary body in rawBodyBuffer
 *   Content-Type: application/json;charset=utf-8 (and variants with/without charset)
 *     — all fields + base64 "block" in JSON body
 *
 * @param {object}  headers       — object of lower-cased HTTP headers
 * @param {Buffer}  rawBodyBuffer — raw request body as Buffer
 * @returns {{
 *   devId:       string,
 *   requestCode: string,
 *   transId:     string,
 *   blkNo:       number,
 *   blkLen:      number,
 *   bodyBuffer:  Buffer,   — decoded binary payload
 *   encrypt:     string,   — 'none'|'base64only'|'aes'
 *   error:       string|null
 * }}
 */
function parseRequest(headers, rawBodyBuffer) {
  const result = {
    devId: '', requestCode: '', transId: '', blkNo: 0, blkLen: 0,
    bodyBuffer: Buffer.alloc(0), encrypt: 'none', error: null,
  };

  try {
    const enc = (headers['encrypt'] || '').toLowerCase();
    if (enc === 'yes') result.encrypt = 'aes';
    else if (enc === 'base64only') result.encrypt = 'base64only';

    const ct = (headers['content-type'] || '').toLowerCase().replace(/\s/g, '');

    if (ct === 'application/octet-stream') {
      // Binary mode: metadata in headers
      result.devId       = headers['dev_id']       || '';
      result.requestCode = headers['request_code'] || '';
      result.transId     = headers['trans_id']     || '';
      result.blkNo       = parseInt(headers['blk_no']  || '0', 10) || 0;
      result.blkLen      = parseInt(headers['blk_len'] || '0', 10) || 0;
      result.bodyBuffer  = rawBodyBuffer || Buffer.alloc(0);
    } else if (ct.startsWith('application/json')) {
      // JSON mode: all fields in body, binary payload base64-encoded under "block"
      const json = JSON.parse(rawBodyBuffer.toString('utf8'));
      result.devId       = String(json.dev_id       || '');
      result.requestCode = String(json.request_code || '');
      result.transId     = String(json.trans_id     || '');
      result.blkNo       = parseInt(json.blk_no     || 0, 10) || 0;
      result.blkLen      = parseInt(json.blk_len    || 0, 10) || 0;
      if (json.block) {
        result.bodyBuffer = Buffer.from(json.block, 'base64');
      }
    } else {
      result.error = `unsupported content-type: ${ct}`;
    }
  } catch (e) {
    result.error = `parseRequest failed: ${e.message}`;
  }

  return result;
}

// ── BSComm binary helpers ─────────────────────────────────────────────────────

/**
 * Read the JSON text block from a BSComm binary buffer.
 * Format: [4-byte LE uint32 json_len] [json_bytes (may end with NUL)] ...
 * @param {Buffer} buf
 * @returns {string}
 */
function getJsonBlock(buf) {
  if (!buf || buf.length < 4) return '';
  try {
    const len = buf.readUInt32LE(0);
    if (len === 0 || len > buf.length - 4) return '';
    // Strip trailing NUL if present
    const end = buf[4 + len - 1] === 0 ? len - 1 : len;
    return buf.slice(4, 4 + end).toString('utf8');
  } catch { return ''; }
}

/**
 * Build a BSComm binary buffer containing a JSON text block.
 * @param {string} jsonText
 * @returns {Buffer}
 */
function buildJsonBlock(jsonText) {
  const textBytes = Buffer.from(jsonText, 'utf8');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32LE(textBytes.length + 1, 0);   // +1 for NUL terminator
  return Buffer.concat([lenBuf, textBytes, Buffer.alloc(1)]); // NUL at end
}

// ── parseGLogRecords ──────────────────────────────────────────────────────────

/**
 * Parse consecutive 12-byte CIF11 GLog records from a binary buffer.
 * Used for bulk GET_LOG_DATA results (send_cmd_result reassembly).
 *
 * Each record is 12 bytes. Byte layout (from FKDataHS100.cs):
 *   [0]    Valid     — must be 1; skip record if 0
 *   [1-2]  tmMode   — 16-bit LE: bits 0-5=VerifyMode, bits 6-7=InOut
 *   [3]    Second
 *   [4-7]  UserId   — uint32 LE
 *   [8-11] tmLog    — int32 LE: bits 0-11=Year(+1900), 12-15=Month, 16-20=Day, 21-25=Hour, 26-31=Minute
 *
 * @param {Buffer} buffer
 * @returns {Array<{userId:number, at:string, punchDate:string, punchTime:string,
 *                  inOut:number, verifyMode:number, second:number}>}
 */
function parseGLogRecords(buffer) {
  const RECORD_SIZE = 12;
  const records = [];

  if (!Buffer.isBuffer(buffer)) return records;

  const count = Math.floor(buffer.length / RECORD_SIZE);
  for (let i = 0; i < count; i++) {
    const offset = i * RECORD_SIZE;
    try {
      const valid = buffer[offset];
      if (valid !== 1) continue;  // skip invalid records

      const tmModeVal = buffer.readUInt16LE(offset + 1);
      const second    = buffer[offset + 3];
      const userId    = buffer.readUInt32LE(offset + 4);
      const tmLogVal  = buffer.readInt32LE(offset + 8);

      const verifyMode = bv32Get(tmModeVal, TM_MODE_VERIFY_SHIFT, TM_MODE_VERIFY_MASK);
      const inOut      = bv32Get(tmModeVal, TM_MODE_INOUT_SHIFT,  TM_MODE_INOUT_MASK);

      const yearOffset = bv32Get(tmLogVal, TM_YEAR_SHIFT,   TM_YEAR_MASK);
      const month      = bv32Get(tmLogVal, TM_MONTH_SHIFT,  TM_MONTH_MASK);
      const day        = bv32Get(tmLogVal, TM_DAY_SHIFT,    TM_DAY_MASK);
      const hour       = bv32Get(tmLogVal, TM_HOUR_SHIFT,   TM_HOUR_MASK);
      const minute     = bv32Get(tmLogVal, TM_MINUTE_SHIFT, TM_MINUTE_MASK);

      const year = yearOffset + 1900;

      // Plausibility checks (mirrors FKDataHS100.cs IsValidIoTime)
      if (year < 1900 || year > 3000) continue;
      if (month < 1   || month > 12)  continue;
      if (day   < 1   || day   > 31)  continue;
      if (hour  > 24)                  continue;
      if (minute > 60)                 continue;
      if (second > 60)                 continue;

      // Build ISO datetime string
      const pad = (n, w = 2) => String(n).padStart(w, '0');
      const punchDate = `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
      const punchTime = `${pad(hour)}:${pad(minute)}:${pad(second)}`;
      const at        = `${punchDate}T${punchTime}`;

      records.push({ userId, at, punchDate, punchTime, inOut, verifyMode, second });
    } catch {
      // Skip malformed record — never throw (STAB-01)
    }
  }

  return records;
}

// ── BSComm binary block extractor ────────────────────────────────────────────

/**
 * Extract a binary block from a BSComm buffer.
 * Format after the JSON block:
 *   [4-byte LE uint32 = block_len] [block_bytes]
 *   (potentially multiple numbered blocks, but the SDK only uses BIN_1 in practice)
 *
 * @param {number} blockIndex  — 1-based index (BIN_1 = first binary block after JSON)
 * @param {Buffer} buf
 * @returns {Buffer}
 */
function getBinaryBlock(blockIndex, buf) {
  if (!buf || buf.length < 4) return Buffer.alloc(0);
  try {
    // Skip the JSON block first
    const jsonLen = buf.readUInt32LE(0);
    let offset = 4 + jsonLen;  // position after JSON block (including NUL terminator already counted in jsonLen)
    if (offset > buf.length) return Buffer.alloc(0);

    // Iterate over binary blocks: [4-byte len][block_bytes], 1-indexed
    let blkIdx = 0;
    while (offset + 4 <= buf.length) {
      const blkLen = buf.readUInt32LE(offset);
      offset += 4;
      blkIdx++;
      if (blkIdx === blockIndex) {
        if (offset + blkLen > buf.length) return Buffer.alloc(0);
        return buf.slice(offset, offset + blkLen);
      }
      offset += blkLen;
    }
  } catch { /* ignore */ }
  return Buffer.alloc(0);
}

// ── GET_LOG_DATA result parser ────────────────────────────────────────────────

/**
 * Parse a completed GET_LOG_DATA send_cmd_result buffer.
 *
 * SDK evidence (FKWebTrans.cs SaveGLog, lines 962-1083):
 *   sJson = GetJsonBlock(buf)        → {"log_count": N, "one_log_size": 12}
 *   bytLogList = GetBinaryBlock(1, buf)  → N × 12-byte GLog records (FKDataHS100 layout)
 *
 * @param {Buffer} buf — fully reassembled BSComm buffer from the device
 * @returns {{ punches: Array, logCount: number, oneLogSize: number, error: string|null }}
 */
function parseGetLogDataResult(buf) {
  try {
    const jsonStr = getJsonBlock(buf);
    if (!jsonStr) return { punches: [], logCount: 0, oneLogSize: 0, error: 'missing JSON block in GET_LOG_DATA result' };

    let meta;
    try { meta = JSON.parse(jsonStr); } catch (e) { return { punches: [], logCount: 0, oneLogSize: 0, error: `JSON parse failed: ${e.message}` }; }

    const logCount  = parseInt(meta.log_count    || 0, 10);
    const oneLogSize = parseInt(meta.one_log_size || 0, 10);

    if (logCount === 0) return { punches: [], logCount: 0, oneLogSize, error: null };
    if (oneLogSize !== 12) {
      return { punches: [], logCount, oneLogSize, error: `unsupported one_log_size: ${oneLogSize} (expected 12 for FKDataHS100)` };
    }

    const binData = getBinaryBlock(1, buf);
    if (binData.length < logCount * oneLogSize) {
      return { punches: [], logCount, oneLogSize, error: `binary block too short: ${binData.length} < ${logCount * oneLogSize}` };
    }

    const punches = parseGLogRecords(binData.slice(0, logCount * oneLogSize));
    return { punches, logCount, oneLogSize, error: null };
  } catch (e) {
    return { punches: [], logCount: 0, oneLogSize: 0, error: `parseGetLogDataResult failed: ${e.message}` };
  }
}

// ── GET_USER_ID_LIST result parser ────────────────────────────────────────────

/**
 * Parse a completed GET_USER_ID_LIST send_cmd_result buffer.
 *
 * SDK evidence (FKWebTrans.cs SaveUserIdList, lines 1420-1544):
 *   sJson = GetJsonBlock(buf)               → {"user_id_count": N, "one_user_id_size": 8}
 *   bytUserIdList = GetBinaryBlock(1, buf)  → N × 8-byte UserIdInfo structs (FKDataHS100):
 *     [0]   Enabled      (byte)
 *     [1]   Privilege    (byte)
 *     [2]   BackupNumber (byte)
 *     [3]   reserved     (byte, padding to align UserId at offset 4)
 *     [4-7] UserId       (uint32 LE)
 *
 * @param {Buffer} buf
 * @returns {{ users: Array<{userId:number, privilege:number, enabled:number, backupNumber:number}>, userCount: number, error: string|null }}
 */
function parseGetUserIdListResult(buf) {
  try {
    const jsonStr = getJsonBlock(buf);
    if (!jsonStr) return { users: [], userCount: 0, error: 'missing JSON block in GET_USER_ID_LIST result' };

    let meta;
    try { meta = JSON.parse(jsonStr); } catch (e) { return { users: [], userCount: 0, error: `JSON parse failed: ${e.message}` }; }

    const userCount    = parseInt(meta.user_id_count    || 0, 10);
    const oneUserSize  = parseInt(meta.one_user_id_size || 0, 10);

    if (userCount === 0) return { users: [], userCount: 0, error: null };
    if (oneUserSize !== 8) {
      return { users: [], userCount, error: `unsupported one_user_id_size: ${oneUserSize} (expected 8 for FKDataHS100)` };
    }

    const binData = getBinaryBlock(1, buf);
    if (binData.length < userCount * oneUserSize) {
      return { users: [], userCount, error: `binary block too short: ${binData.length} < ${userCount * oneUserSize}` };
    }

    const users = [];
    for (let i = 0; i < userCount; i++) {
      const off = i * oneUserSize;
      try {
        const enabled      = binData[off];
        const privilege    = binData[off + 1];
        const backupNumber = binData[off + 2];
        // off+3 is reserved padding
        const userId = binData.readUInt32LE(off + 4);
        users.push({ userId, privilege, enabled, backupNumber });
      } catch { /* skip malformed record */ }
    }

    return { users, userCount, error: null };
  } catch (e) {
    return { users: [], userCount: 0, error: `parseGetUserIdListResult failed: ${e.message}` };
  }
}

// ── Response builders ─────────────────────────────────────────────────────────

/**
 * Build the HTTP response headers and body for a receive_cmd reply that carries a command.
 *
 * The device expects (from Default.aspx.cs OnReceiveCmd → ProcessCommand → SendResponseToClient):
 *   HTTP 200
 *   Headers: response_code=OK, trans_id=<transId>, cmd_code=<cmdCode>
 *   Content-Type: application/octet-stream
 *   Body: BSComm binary buffer  (SetJsonBlock(cmdParam) + optional binary blocks)
 *
 * For SET_TIME the SDK calls LoadCurrentTime which calls SetJsonBlock({"time":"<fkTime14>"}),
 * but we pass in the pre-built cmdParamJson so the caller can inject the current time.
 *
 * @param {string} transId
 * @param {string} cmdCode
 * @param {string} cmdParamJson   — JSON string, e.g. '{"time":"20260713103000"}'
 * @returns {{ responseCode:string, transId:string, cmdCode:string, body:Buffer }}
 */
function buildReceiveCmdResponse(transId, cmdCode, cmdParamJson) {
  const body = cmdParamJson ? buildJsonBlock(cmdParamJson) : Buffer.alloc(0);
  return {
    responseCode: 'OK',
    transId,
    cmdCode,
    body,
  };
}

/**
 * Build a simple OK response (no command, no body) — used for:
 *   - realtime_glog, realtime_enroll, realtime_barcode, realtime_operation
 *   - receive_cmd when there is no pending command ("ERROR_NO_CMD")
 *   - intermediate block acknowledgements (blk_no > 0)
 *
 * @param {string} responseCode  — e.g. 'OK', 'ERROR_NO_CMD', 'ERROR_DB_ACCESS'
 * @param {string} [transId]
 * @returns {{ responseCode:string, transId:string|undefined, body:Buffer }}
 */
function buildSimpleResponse(responseCode, transId) {
  return { responseCode, transId, body: Buffer.alloc(0) };
}

/**
 * Apply a response object to a Node.js http.ServerResponse.
 * Replicates Default.aspx.cs SendResponseToClient exactly.
 * @param {object} resp    — node http ServerResponse
 * @param {object} r       — { responseCode, transId?, cmdCode?, body }
 */
function sendResponse(resp, r) {
  resp.setHeader('response_code', r.responseCode || 'OK');
  if (r.transId  !== undefined) resp.setHeader('trans_id',  r.transId);
  if (r.cmdCode  !== undefined) resp.setHeader('cmd_code',  r.cmdCode);
  resp.setHeader('Content-Type',   'application/octet-stream');
  resp.setHeader('Content-Length', String(r.body ? r.body.length : 0));

  if (r.body && r.body.length > 0) {
    resp.end(r.body);
  } else {
    resp.end();
  }
}

// ── parseRealtimeGLog ─────────────────────────────────────────────────────────

/**
 * Parse a realtime_glog BSComm binary body.
 *
 * Unlike bulk GET_LOG_DATA (which carries raw GLog structs in BIN_1), realtime_glog
 * carries a JSON text block (from SaveRTLog in FKWebTrans.cs) with fields:
 *   user_id, io_mode, verify_mode, io_time (14-char FK time), fk_bin_data_lib, [temperature], [log_image]
 *
 * The io_time string format is "YYYYMMDDHHMMSS" (FKWebTools.ConvertFKTimeToNormalTimeString).
 *
 * @param {Buffer} bodyBuffer — BSComm binary body from realtime_glog request
 * @returns {{
 *   userId:     string,
 *   ioMode:     string,
 *   verifyMode: string,
 *   ioTime:     string,   — FK time "YYYYMMDDHHMMSS"
 *   punchDate:  string,   — "YYYY-MM-DD"
 *   punchTime:  string,   — "HH:MM:SS"
 *   at:         string,   — ISO "YYYY-MM-DDTHH:MM:SS"
 *   fkDataLib:  string,
 *   temperature: string,
 *   rawJson:    string,
 *   error:      string|null
 * }|null}
 */
function parseRealtimeGLog(bodyBuffer) {
  try {
    const jsonStr = getJsonBlock(bodyBuffer);
    if (!jsonStr) return { error: 'empty JSON block in realtime_glog body' };

    const obj = JSON.parse(jsonStr);

    const userId     = String(obj.user_id      || '');
    const ioMode     = String(obj.io_mode      || '0');
    const verifyMode = String(obj.verify_mode  || '0');
    const ioTime     = String(obj.io_time      || '');
    const fkDataLib  = String(obj.fk_bin_data_lib || '');
    const temperature = String(obj.temperature || '0');

    // Parse FK time "YYYYMMDDHHMMSS"
    let punchDate = '', punchTime = '', at = '';
    if (ioTime.length === 14) {
      const yr  = ioTime.slice(0, 4);
      const mo  = ioTime.slice(4, 6);
      const dy  = ioTime.slice(6, 8);
      const hr  = ioTime.slice(8, 10);
      const mn  = ioTime.slice(10, 12);
      const sc  = ioTime.slice(12, 14);
      punchDate = `${yr}-${mo}-${dy}`;
      punchTime = `${hr}:${mn}:${sc}`;
      at        = `${punchDate}T${punchTime}`;
    }

    return { userId, ioMode, verifyMode, ioTime, punchDate, punchTime, at, fkDataLib, temperature, rawJson: jsonStr, error: null };
  } catch (e) {
    return { error: `parseRealtimeGLog failed: ${e.message}` };
  }
}

// ── InOut mode label helper ──────────────────────────────────────────────────

/**
 * Map numeric io_mode to direction string for staging.
 * Values from FKDataHS100.cs constants.
 */
function ioModeToDirection(ioModeNum) {
  const n = parseInt(ioModeNum, 10);
  // 0=OUT, 1=IN/CHKIN, 2=CHKOUT, 3=BRKIN, 4=BRKOUT, 5=OVTIN, 6=OVTOUT
  if (n === 1) return 'in';
  if (n === 0 || n === 2) return 'out';
  return null;  // break/overtime — direction ambiguous
}

module.exports = {
  fkTime14,
  parseRequest,
  parseGLogRecords,
  parseRealtimeGLog,
  parseGetLogDataResult,
  parseGetUserIdListResult,
  getBinaryBlock,
  buildReceiveCmdResponse,
  buildSimpleResponse,
  sendResponse,
  getJsonBlock,
  buildJsonBlock,
  ioModeToDirection,
};
