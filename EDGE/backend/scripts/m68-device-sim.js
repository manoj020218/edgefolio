'use strict';
/**
 * m68-device-sim.js — Simulates an M68 WitEasy device against a running backend.
 *
 * The device must be pre-registered (direct DB insert or M68-2 API) before this runs.
 * The simulator does NOT register itself.
 *
 * Usage:
 *   node scripts/m68-device-sim.js [--server http://127.0.0.1:5005] [--dev-id SIM001] [--user 42]
 *
 * Behaviour:
 *   1. Polls receive_cmd a few times (first poll should get SET_TIME if scheduler ran)
 *   2. Answers SET_TIME with a send_cmd_result OK
 *   3. Pushes one realtime_glog punch
 *   4. Tests unregistered dev_id rejection
 *   5. Reports results and exits
 */

const http = require('http');
const path = require('path');

// Parse CLI args
const args = process.argv.slice(2);
function getArg(name, def) {
  const idx = args.indexOf(name);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : def;
}
const SERVER      = getArg('--server', 'http://127.0.0.1:5005');
const DEV_ID      = getArg('--dev-id', 'SIM001');
const USER_ID     = getArg('--user', '42');
const BOGUS_DEV   = 'UNREGISTERED_XXXX';

const serverUrl = new URL(SERVER);

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { console.log(`  PASS  ${label}`); passed++; }
  else       { console.error(`  FAIL  ${label}`); failed++; }
}

// ── HTTP helpers ───────────────────────────────────────────────────────────────

function postBinary(devId, requestCode, transId, blkNo, bodyBuffer, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: serverUrl.hostname,
      port:     parseInt(serverUrl.port, 10) || 80,
      path:     '/',
      method:   'POST',
      headers: {
        'Content-Type':   'application/octet-stream',
        'dev_id':         devId,
        'request_code':   requestCode,
        'trans_id':       transId || '',
        'blk_no':         String(blkNo || 0),
        'blk_len':        String(bodyBuffer ? bodyBuffer.length : 0),
        'Content-Length': String(bodyBuffer ? bodyBuffer.length : 0),
        ...extraHeaders,
      },
    };
    const req = http.request(options, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        resolve({
          status:    res.statusCode,
          headers:   res.headers,
          body:      Buffer.concat(chunks),
          responseCode: res.headers['response_code'] || '',
          transId:   res.headers['trans_id'] || '',
          cmdCode:   res.headers['cmd_code'] || '',
        });
      });
    });
    req.on('error', reject);
    if (bodyBuffer && bodyBuffer.length > 0) req.write(bodyBuffer);
    req.end();
  });
}

function buildJsonBlock(jsonText) {
  const textBytes = Buffer.from(jsonText, 'utf8');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32LE(textBytes.length + 1, 0);
  return Buffer.concat([lenBuf, textBytes, Buffer.alloc(1)]);
}

function getJsonBlock(buf) {
  if (!buf || buf.length < 4) return '';
  try {
    const len = buf.readUInt32LE(0);
    if (len === 0 || len > buf.length - 4) return '';
    const end = buf[4 + len - 1] === 0 ? len - 1 : len;
    return buf.slice(4, 4 + end).toString('utf8');
  } catch { return ''; }
}

function fkTime14(d) {
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  return pad(d.getFullYear(), 4) + pad(d.getMonth() + 1) + pad(d.getDate()) +
         pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
}

// Unique trans_id per request
let _txSeq = 1;
function nextTransId() { return `SIM-TX-${Date.now()}-${_txSeq++}`; }

// ── Main sim flow ──────────────────────────────────────────────────────────────

async function run() {
  console.log(`\nM68 device simulator`);
  console.log(`  Server:  ${SERVER}`);
  console.log(`  dev_id:  ${DEV_ID}`);
  console.log(`  user_id: ${USER_ID}`);
  console.log('');

  // ── Step 0: Unregistered device rejection ──────────────────────────────────
  console.log('--- Step 0: Unregistered device should be rejected ---');
  {
    const txId = nextTransId();
    try {
      const r = await postBinary(BOGUS_DEV, 'receive_cmd', txId, 0, Buffer.alloc(0));
      assert(r.responseCode !== 'OK', `unregistered dev_id gets non-OK response (got: ${r.responseCode})`);
      console.log(`       response_code: ${r.responseCode}`);
    } catch (e) {
      console.error(`  FAIL  unregistered test threw: ${e.message}`);
      failed++;
    }
  }

  // ── Step 1: receive_cmd polls ──────────────────────────────────────────────
  console.log('\n--- Step 1: receive_cmd polls (device heartbeat body) ---');
  const deviceBody = buildJsonBlock(JSON.stringify({
    fk_name: 'SIM001',
    fk_info: { ip: '192.168.1.199', firmware: 'SIM_V1.0' },
    fk_time: fkTime14(new Date()),
  }));

  let setCmdTransId = null;
  let receivedSetTime = false;

  for (let poll = 1; poll <= 3; poll++) {
    try {
      const txId = nextTransId();
      const r = await postBinary(DEV_ID, 'receive_cmd', txId, 0, deviceBody);
      const rCode = r.responseCode;
      const cmdCode = r.cmdCode;
      console.log(`  poll ${poll}: response_code=${rCode} cmd_code=${cmdCode}`);

      if (rCode === 'OK' && cmdCode === 'SET_TIME') {
        receivedSetTime = true;
        setCmdTransId = r.transId;
        // Decode the SET_TIME parameter
        const jsonStr = getJsonBlock(r.body);
        console.log(`         SET_TIME param: ${jsonStr}`);
        assert(jsonStr.includes('"time"'), 'SET_TIME body has "time" field');
        break;
      } else if (rCode === 'ERROR_NO_CMD') {
        assert(true, `poll ${poll}: no command pending (OK)`);
      } else {
        assert(false, `poll ${poll}: unexpected response_code=${rCode}`);
      }
    } catch (e) {
      console.error(`  FAIL  poll ${poll} threw: ${e.message}`);
      failed++;
    }
  }

  // ── Step 2: send_cmd_result for SET_TIME ──────────────────────────────────
  if (setCmdTransId) {
    console.log('\n--- Step 2: send_cmd_result (acknowledging SET_TIME) ---');
    try {
      // Build a minimal OK result body (empty JSON block)
      const resultBody = buildJsonBlock(JSON.stringify({ result: 'OK' }));
      const r = await postBinary(
        DEV_ID, 'send_cmd_result', setCmdTransId, 0, resultBody,
        { 'cmd_return_code': 'OK' }
      );
      assert(r.responseCode === 'OK', `send_cmd_result acknowledged (got: ${r.responseCode})`);
    } catch (e) {
      console.error(`  FAIL  send_cmd_result threw: ${e.message}`);
      failed++;
    }
  } else {
    console.log('\n--- Step 2: skipped (no SET_TIME was received in polls) ---');
    console.log('  Note: scheduler queues SET_TIME on startup after 5s; try again after waiting');
  }

  // ── Step 3: realtime_glog punch ───────────────────────────────────────────
  console.log('\n--- Step 3: realtime_glog punch ---');
  {
    try {
      const now = new Date();
      const ioTime = fkTime14(now);
      const innerJson = JSON.stringify({
        user_id:        USER_ID,
        io_mode:        '1',
        verify_mode:    '20',
        io_time:        ioTime,
        fk_bin_data_lib:'FKDataHS100',
        temperature:    '0',
      });
      const bodyBuf = buildJsonBlock(innerJson);
      const r = await postBinary(DEV_ID, 'realtime_glog', '', 0, bodyBuf);
      assert(r.responseCode === 'OK', `realtime_glog accepted (got: ${r.responseCode})`);
      console.log(`       punch user_id=${USER_ID} io_time=${ioTime}`);
      console.log(`       Check machine_import_staging for a row with source_type='m68' and machine_emp_id='${USER_ID}'`);
    } catch (e) {
      console.error(`  FAIL  realtime_glog threw: ${e.message}`);
      failed++;
    }
  }

  // ── Step 4: second receive_cmd poll (should be empty after SET_TIME done) ──
  console.log('\n--- Step 4: receive_cmd after SET_TIME completed ---');
  {
    try {
      const txId = nextTransId();
      const r = await postBinary(DEV_ID, 'receive_cmd', txId, 0, deviceBody);
      console.log(`  response_code=${r.responseCode} cmd_code=${r.cmdCode}`);
      assert(
        r.responseCode === 'ERROR_NO_CMD' || (r.responseCode === 'OK' && r.cmdCode),
        `second poll: got valid response (${r.responseCode})`
      );
    } catch (e) {
      console.error(`  FAIL  second poll threw: ${e.message}`);
      failed++;
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log(`\n${'='.repeat(50)}`);
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error('\nSome simulator checks failed. Check backend logs for details.');
    process.exit(1);
  } else {
    console.log('\nAll simulator checks passed.');
  }
}

run().catch(e => {
  console.error('Fatal simulator error:', e.message);
  process.exit(1);
});
