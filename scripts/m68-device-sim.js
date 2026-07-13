'use strict';
/**
 * m68-device-sim.js — Simulator for a WitEasy M68 FK BS-protocol device.
 *
 * Behaves like the M68 machine: sends HTTP POSTs to the EDGE backend M68 listener,
 * polls for commands, executes GET_LOG_DATA (multi-block) and GET_USER_ID_LIST
 * results, and pushes a realtime_glog punch.
 *
 * Usage:
 *   node scripts/m68-device-sim.js [--port <port>] [--host <host>] [--devid <id>] [--once]
 *
 * Options:
 *   --port   M68 listener port (default 5005)
 *   --host   M68 listener host (default 127.0.0.1)
 *   --devid  Device ID (default SIM001)
 *   --once   Do one full cycle then exit (used by E2E test)
 */

const http    = require('http');

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(name, def) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
}
const PORT   = parseInt(getArg('--port', '5005'), 10);
const HOST   = getArg('--host', '127.0.0.1');
const DEV_ID = getArg('--devid', 'SIM001');
const ONCE   = args.includes('--once');

// ── Protocol helpers ──────────────────────────────────────────────────────────

/**
 * Build a BSComm buffer with a JSON block + optional binary block.
 * Format: [4-byte LE json_len+1] [json_bytes] [0x00] [4-byte LE bin_len] [bin_bytes]
 */
function buildBSCommBuffer(jsonText, binBuffer) {
  const jsonBytes = Buffer.from(jsonText, 'utf8');
  const jsonLenBuf = Buffer.alloc(4);
  jsonLenBuf.writeUInt32LE(jsonBytes.length + 1, 0);  // +1 for NUL terminator

  const parts = [jsonLenBuf, jsonBytes, Buffer.alloc(1)];  // NUL

  if (binBuffer && binBuffer.length > 0) {
    const binLenBuf = Buffer.alloc(4);
    binLenBuf.writeUInt32LE(binBuffer.length, 0);
    parts.push(binLenBuf, binBuffer);
  }

  return Buffer.concat(parts);
}

/**
 * Build a 12-byte FKDataHS100 GLog record.
 *
 * Layout (from FKDataHS100.cs constructor — authoritative):
 *   [0]    Valid      = 1
 *   [1-2]  tmMode    = 16-bit LE: bits 0-5=VerifyMode(face=0), bits 6-7=InOut(0=out,1=in)
 *   [3]    Second
 *   [4-7]  UserId    = uint32 LE
 *   [8-11] tmLog     = int32 LE: bits 0-11=Year-1900, 12-15=Month, 16-20=Day, 21-25=Hour, 26-31=Minute
 */
function buildGLogRecord({ userId, year, month, day, hour, minute, second = 0, inOut = 1, verifyMode = 0 }) {
  const buf = Buffer.alloc(12);

  // [0] Valid = 1
  buf[0] = 1;

  // [1-2] tmMode: verifyMode in bits 0-5, inOut in bits 6-7
  const tmMode = (verifyMode & 0x3F) | ((inOut & 0x03) << 6);
  buf.writeUInt16LE(tmMode, 1);

  // [3] Second
  buf[3] = second & 0xFF;

  // [4-7] UserId (uint32 LE)
  buf.writeUInt32LE(userId >>> 0, 4);

  // [8-11] tmLog: year-1900 in bits 0-11, month in 12-15, day in 16-20, hour in 21-25, minute in 26-31
  const yearOffset = (year - 1900) & 0xFFF;
  const tmLog = yearOffset
              | ((month  & 0x0F) << 12)
              | ((day    & 0x1F) << 16)
              | ((hour   & 0x1F) << 21)
              | ((minute & 0x3F) << 26);
  buf.writeInt32LE(tmLog, 8);

  return buf;
}

/**
 * Build an 8-byte FKDataHS100 UserIdInfo record.
 *
 * Layout (from FKDataHS100.cs constructor, line 409-419):
 *   [0]   Enabled      (byte)
 *   [1]   Privilege    (byte, 0=staff 1=admin)
 *   [2]   BackupNumber (byte)
 *   [3]   reserved/padding
 *   [4-7] UserId       (uint32 LE)
 */
function buildUserIdInfoRecord({ userId, enabled = 1, privilege = 0, backupNumber = 0 }) {
  const buf = Buffer.alloc(8);
  buf[0] = enabled;
  buf[1] = privilege;
  buf[2] = backupNumber;
  buf[3] = 0;  // reserved
  buf.writeUInt32LE(userId >>> 0, 4);
  return buf;
}

// ── Fake punches (5 punches for E2E: 2 for user 101, 3 for user 202) ─────────

const FAKE_PUNCHES = [
  { userId: 101, year: 2026, month: 7, day: 10, hour: 9,  minute: 5,  second: 12, inOut: 1 },  // in
  { userId: 101, year: 2026, month: 7, day: 10, hour: 18, minute: 2,  second: 45, inOut: 0 },  // out
  { userId: 202, year: 2026, month: 7, day: 11, hour: 8,  minute: 55, second: 30, inOut: 1 },  // in
  { userId: 202, year: 2026, month: 7, day: 11, hour: 13, minute: 0,  second: 0,  inOut: 0 },  // out
  { userId: 202, year: 2026, month: 7, day: 11, hour: 17, minute: 59, second: 0,  inOut: 0 },  // out again
];

// 2 binary blocks to exercise the blk_no accumulation path:
// Block 1 (blk_no=1): 3 records; Block 2 (blk_no=2): 2 records; Final (blk_no=0) = empty final
// Actually: BSComm reassembly in m68Service uses request-level blk_no (not binary sub-blocks):
//   - First block: blk_no=1, body = first 3 GLog records
//   - Second block: blk_no=2, body = last 2 GLog records
//   - Final: blk_no=0, body = complete BSComm buffer (JSON + all 5 records in BIN_1)
// The service accumulates blk_no 1,2 and then on blk_no=0 concatenates them to get fullBuffer.
// BUT the fullBuffer is the complete BSComm framing (JSON header + binary records).
// So: we send blk_no=1 (raw chunk 1), blk_no=2 (raw chunk 2), blk_no=0 (complete BSComm).
// On blk_no=0, the service calls getAndClearBlockBuffer which prepends the earlier chunks —
// this means the final body MUST be the complete payload (chunks 1+2 + final body = fullBuffer).
// Since BSComm parsing reads from the assembled fullBuffer, the simplest approach is:
//   blk_no=1: send partial dummy bytes (these will be prepended but the final parse reads from start)
//   blk_no=2: more partial dummy bytes
//   blk_no=0: the COMPLETE BSComm framing (but assembled = chunk1 + chunk2 + final_body)
// The service reassembles as Buffer.concat([chunks..., finalChunk]) — so fullBuffer is NOT
// a valid BSComm if we split arbitrarily. The correct approach: split the BSComm bytes across requests.
//
// Strategy: build the complete BSComm buffer, then split it into 3 chunks across the 3 HTTP requests.

function buildGetLogDataBSComm() {
  // All 5 punch records
  const records = Buffer.concat(FAKE_PUNCHES.map(buildGLogRecord));
  const jsonMeta = JSON.stringify({ log_count: FAKE_PUNCHES.length, one_log_size: 12 });
  return buildBSCommBuffer(jsonMeta, records);
}

function buildGetUserIdListBSComm() {
  const FAKE_USERS = [
    { userId: 101, enabled: 1, privilege: 0, backupNumber: 1 },  // face enrolled
    { userId: 202, enabled: 1, privilege: 0, backupNumber: 1 },
    { userId: 303, enabled: 1, privilege: 1, backupNumber: 0 },  // admin
  ];
  const records = Buffer.concat(FAKE_USERS.map(buildUserIdInfoRecord));
  const jsonMeta = JSON.stringify({ user_id_count: FAKE_USERS.length, one_user_id_size: 8 });
  return buildBSCommBuffer(jsonMeta, records);
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

let _transId = 1000;
function nextTransId() { return `SIM-${DEV_ID}-${++_transId}`; }

function postBinary(headers, body) {
  return new Promise((resolve, reject) => {
    const options = {
      method: 'POST',
      hostname: HOST,
      port: PORT,
      path: '/',
      headers: {
        'Content-Type':   'application/octet-stream',
        'Content-Length': body ? String(body.length) : '0',
        ...headers,
      },
    };
    const r = http.request(options, (res) => {
      const responseHeaders = res.headers;
      const data = [];
      res.on('data', c => data.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: responseHeaders, body: Buffer.concat(data) }));
    });
    r.on('error', reject);
    if (body && body.length > 0) r.write(body);
    r.end();
  });
}

// ── Request builders ──────────────────────────────────────────────────────────

async function sendReceiveCmd(transId) {
  return postBinary({
    dev_id:       DEV_ID,
    request_code: 'receive_cmd',
    trans_id:     transId,
    blk_no:       '0',
    blk_len:      '0',
  }, Buffer.alloc(0));
}

async function sendRealtimeGLog(punch) {
  // Realtime glog uses JSON BSComm format (not binary GLog records)
  const ioTime = `${punch.year}${String(punch.month).padStart(2,'0')}${String(punch.day).padStart(2,'0')}${String(punch.hour).padStart(2,'0')}${String(punch.minute).padStart(2,'0')}${String(punch.second || 0).padStart(2,'0')}`;
  const jsonPayload = JSON.stringify({
    user_id: String(punch.userId),
    io_mode: String(punch.inOut),
    verify_mode: String(punch.verifyMode || 0),
    io_time: ioTime,
    fk_bin_data_lib: 'FKDataHS100',
    temperature: '0',
  });
  const body = buildBSCommBuffer(jsonPayload, null);
  return postBinary({
    dev_id:       DEV_ID,
    request_code: 'realtime_glog',
    trans_id:     nextTransId(),
    blk_no:       '0',
    blk_len:      String(body.length),
  }, body);
}

/**
 * Send a multi-block send_cmd_result for GET_LOG_DATA.
 * Splits the BSComm buffer into 3 HTTP requests (blk_no=1, 2, 0) to exercise
 * the blk_no>0 accumulation path in m68Service.saveBlockChunk.
 */
async function sendGetLogDataResult(transId) {
  const fullBuf = buildGetLogDataBSComm();
  // Split into 3 chunks: first third, second third, final third
  const splitAt1 = Math.floor(fullBuf.length / 3);
  const splitAt2 = Math.floor(2 * fullBuf.length / 3);
  const chunk1 = fullBuf.slice(0, splitAt1);
  const chunk2 = fullBuf.slice(splitAt1, splitAt2);
  const chunk3 = fullBuf.slice(splitAt2);

  console.log(`  [sim] GET_LOG_DATA result: ${fullBuf.length} bytes split into 3 blocks (${chunk1.length}+${chunk2.length}+${chunk3.length})`);

  // blk_no=1: first chunk
  let r = await postBinary({
    dev_id:       DEV_ID,
    request_code: 'send_cmd_result',
    trans_id:     transId,
    blk_no:       '1',
    blk_len:      String(chunk1.length),
  }, chunk1);
  console.log(`  [sim] blk_no=1 → response_code=${r.headers['response_code'] || r.status}`);

  // blk_no=2: second chunk
  r = await postBinary({
    dev_id:       DEV_ID,
    request_code: 'send_cmd_result',
    trans_id:     transId,
    blk_no:       '2',
    blk_len:      String(chunk2.length),
  }, chunk2);
  console.log(`  [sim] blk_no=2 → response_code=${r.headers['response_code'] || r.status}`);

  // blk_no=0: final chunk
  r = await postBinary({
    dev_id:       DEV_ID,
    request_code: 'send_cmd_result',
    trans_id:     transId,
    blk_no:       '0',
    blk_len:      String(chunk3.length),
  }, chunk3);
  console.log(`  [sim] blk_no=0 → response_code=${r.headers['response_code'] || r.status}`);

  return r;
}

/**
 * Send GET_USER_ID_LIST result as a single block (blk_no=0).
 */
async function sendGetUserIdListResult(transId) {
  const body = buildGetUserIdListBSComm();
  console.log(`  [sim] GET_USER_ID_LIST result: ${body.length} bytes`);
  const r = await postBinary({
    dev_id:       DEV_ID,
    request_code: 'send_cmd_result',
    trans_id:     transId,
    blk_no:       '0',
    blk_len:      String(body.length),
  }, body);
  console.log(`  [sim] GET_USER_ID_LIST blk_no=0 → response_code=${r.headers['response_code'] || r.status}`);
  return r;
}

// ── Main simulation loop ───────────────────────────────────────────────────────

async function runOneCycle() {
  console.log(`[sim] Polling receive_cmd for ${DEV_ID}…`);

  // 1. Push a realtime punch (user 101, in)
  console.log('[sim] Pushing realtime_glog (user 101)…');
  const rtRes = await sendRealtimeGLog(FAKE_PUNCHES[0]);
  console.log(`[sim] realtime_glog → ${rtRes.headers['response_code'] || rtRes.status}`);

  // 2. Poll until we get a command (up to 10 polls)
  let cmd = null;
  for (let i = 0; i < 10; i++) {
    const tid = nextTransId();
    const r = await sendReceiveCmd(tid);
    const rc = r.headers['response_code'];
    const cmdCode = r.headers['cmd_code'];
    const cmdTransId = r.headers['trans_id'];
    console.log(`[sim] receive_cmd → ${rc} / cmd_code=${cmdCode || '—'} trans_id=${cmdTransId || '—'}`);

    if (rc === 'OK' && cmdCode) {
      cmd = { cmdCode, cmdTransId };
      break;
    }
    if (rc === 'ERROR_NO_CMD') {
      // No command yet — wait a bit
      await new Promise(r => setTimeout(r, 500));
    }
  }

  if (!cmd) {
    console.log('[sim] No command received. Done.');
    return;
  }

  // 3. Execute the command
  if (cmd.cmdCode === 'GET_LOG_DATA') {
    console.log(`[sim] Executing GET_LOG_DATA (transId=${cmd.cmdTransId})…`);
    await sendGetLogDataResult(cmd.cmdTransId);
  } else if (cmd.cmdCode === 'GET_USER_ID_LIST') {
    console.log(`[sim] Executing GET_USER_ID_LIST (transId=${cmd.cmdTransId})…`);
    await sendGetUserIdListResult(cmd.cmdTransId);
  } else if (cmd.cmdCode === 'SET_TIME') {
    console.log(`[sim] SET_TIME acknowledged (transId=${cmd.cmdTransId})`);
    // SET_TIME has no result payload
    const r = await postBinary({
      dev_id:       DEV_ID,
      request_code: 'send_cmd_result',
      trans_id:     cmd.cmdTransId,
      blk_no:       '0',
      blk_len:      '0',
    }, Buffer.alloc(0));
    console.log(`[sim] SET_TIME ack → ${r.headers['response_code'] || r.status}`);
  } else {
    console.log(`[sim] Unknown command ${cmd.cmdCode} — ignoring`);
  }

  // 4. Poll for next command to drain the queue
  if (!ONCE) {
    for (let i = 0; i < 3; i++) {
      const tid = nextTransId();
      const r = await sendReceiveCmd(tid);
      const rc = r.headers['response_code'];
      const cmdCode = r.headers['cmd_code'];
      const cmdTransId = r.headers['trans_id'];
      console.log(`[sim] receive_cmd(drain ${i+1}) → ${rc} / cmd_code=${cmdCode || '—'}`);
      if (rc === 'OK' && cmdCode) {
        if (cmdCode === 'GET_LOG_DATA') await sendGetLogDataResult(cmdTransId);
        else if (cmdCode === 'GET_USER_ID_LIST') await sendGetUserIdListResult(cmdTransId);
        else if (cmdCode === 'SET_TIME') {
          await postBinary({ dev_id: DEV_ID, request_code: 'send_cmd_result', trans_id: cmdTransId, blk_no: '0', blk_len: '0' }, Buffer.alloc(0));
        }
      }
      if (rc === 'ERROR_NO_CMD') break;
      await new Promise(r => setTimeout(r, 300));
    }
  }
}

async function main() {
  try {
    await runOneCycle();
    if (!ONCE) {
      console.log('[sim] Waiting 5s before next cycle…');
      await new Promise(r => setTimeout(r, 5000));
      await main();
    }
  } catch (e) {
    console.error('[sim] Error:', e.message);
    if (ONCE) process.exit(1);
  }
}

main().then(() => {
  if (ONCE) process.exit(0);
});
