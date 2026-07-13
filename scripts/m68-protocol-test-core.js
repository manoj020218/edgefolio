'use strict';
/**
 * m68-protocol-test.js — Unit tests for m68Protocol.js
 *
 * Pure golden-buffer tests; no DB, no network, no imports except m68Protocol itself.
 * Run with: node scripts/m68-protocol-test.js
 *
 * Exit code 0 = all passed, 1 = failures present.
 */

const path = require('path');
const { parseGLogRecords, parseRequest, parseRealtimeGLog,
  buildReceiveCmdResponse, buildSimpleResponse, sendResponse,
  fkTime14, getJsonBlock, buildJsonBlock } =
  require(path.join(__dirname, '..', 'EDGE', 'backend', 'services', 'm68Protocol'));

// ── Test harness ──────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    console.log(`  PASS  ${name}`);
    passed++;
  } else {
    console.log(`  FAIL  ${name}`);
    console.log(`         expected: ${JSON.stringify(expected)}`);
    console.log(`         actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}

function checkTruthy(name, val) {
  if (val) {
    console.log(`  PASS  ${name}`);
    passed++;
  } else {
    console.log(`  FAIL  ${name}: got falsy ${JSON.stringify(val)}`);
    failed++;
  }
}

// ── Helper: build a 12-byte GLog record buffer ───────────────────────────────
//
// Wire layout (from FKDataHS100.cs GLog constructor lines 143-151):
//   byte[0]   Valid (1 = valid)
//   byte[1]   low-byte of tmMode (VerifyMode bits 0-5, InOut bits 6-7)
//   byte[2]   high-byte of tmMode (always 0)
//   byte[3]   Second
//   bytes[4-7] UserId (uint32 LE)
//   bytes[8-11] tmLog (int32 LE):
//     bits  0-11  = yearOffset (year - 1900)
//     bits 12-15  = month
//     bits 16-20  = day
//     bits 21-25  = hour
//     bits 26-31  = minute

function makeGLogBuf({ valid = 1, verifyMode = 0, inOut = 1, second = 0, userId = 42,
    year = 2026, month = 7, day = 13, hour = 9, minute = 30 } = {}) {
  const buf = Buffer.alloc(12, 0);

  buf[0] = valid;

  // tmMode: VerifyMode in bits 0-5, InOut in bits 6-7
  const tmMode = (verifyMode & 0x3F) | ((inOut & 0x03) << 6);
  buf[1] = tmMode & 0xFF;
  buf[2] = 0; // high byte of tmMode always 0

  buf[3] = second;

  buf.writeUInt32LE(userId, 4);

  // tmLog: year-1900 in bits 0-11, month in 12-15, day in 16-20, hour in 21-25, minute in 26-31
  const yearOff = (year - 1900) & 0xFFF;
  const mo  = (month & 0x0F)  << 12;
  const dy  = (day   & 0x1F)  << 16;
  const hr  = (hour  & 0x1F)  << 21;
  const mn  = (minute & 0x3F) << 26;
  const tmLog = yearOff | mo | dy | hr | mn;
  buf.writeInt32LE(tmLog, 8);

  return buf;
}

// ── Tests: parseGLogRecords ───────────────────────────────────────────────────

console.log('\n=== parseGLogRecords ===');

// 1. Normal punch: userId=42, 2026-07-13 09:30:45, inOut=1 (IN)
{
  const buf = makeGLogBuf({ userId: 42, year: 2026, month: 7, day: 13, hour: 9, minute: 30, second: 45, inOut: 1, verifyMode: 20 });
  const recs = parseGLogRecords(buf);
  check('1 record from single buffer', recs.length, 1);
  check('userId', recs[0].userId, 42);
  check('punchDate', recs[0].punchDate, '2026-07-13');
  check('punchTime', recs[0].punchTime, '09:30:45');
  check('at', recs[0].at, '2026-07-13T09:30:45');
  check('inOut', recs[0].inOut, 1);
  check('verifyMode', recs[0].verifyMode, 20);
  check('second', recs[0].second, 45);
}

// 2. Valid=0: record must be skipped
{
  const buf = makeGLogBuf({ valid: 0, userId: 99 });
  const recs = parseGLogRecords(buf);
  check('Valid=0 is skipped', recs.length, 0);
}

// 3. Multiple records in one buffer (2 valid + 1 invalid)
{
  const r1 = makeGLogBuf({ userId: 1, year: 2026, month: 1, day: 1, hour: 8, minute: 0, second: 0, inOut: 1 });
  const r2 = makeGLogBuf({ valid: 0, userId: 2 });
  const r3 = makeGLogBuf({ userId: 3, year: 2026, month: 12, day: 31, hour: 23, minute: 59, second: 59, inOut: 0 });
  const buf = Buffer.concat([r1, r2, r3]);
  const recs = parseGLogRecords(buf);
  check('3-record buffer: 2 valid returned', recs.length, 2);
  check('rec[0].userId', recs[0].userId, 1);
  check('rec[0].punchDate', recs[0].punchDate, '2026-01-01');
  check('rec[1].userId', recs[1].userId, 3);
  check('rec[1].punchDate', recs[1].punchDate, '2026-12-31');
  check('rec[1].punchTime', recs[1].punchTime, '23:59:59');
  check('rec[1].inOut (OUT=0)', recs[1].inOut, 0);
}

// 4. Month boundary — month=1, day=31
{
  const buf = makeGLogBuf({ year: 2025, month: 1, day: 31, hour: 0, minute: 0, second: 0 });
  const recs = parseGLogRecords(buf);
  check('month boundary Jan 31', recs.length, 1);
  check('month boundary punchDate', recs[0].punchDate, '2025-01-31');
}

// 5. Implausible date — month=0: should be skipped
{
  const buf = makeGLogBuf({ year: 2026, month: 0, day: 1, hour: 8, minute: 0 });
  const recs = parseGLogRecords(buf);
  check('month=0 skipped', recs.length, 0);
}

// 6. year 2048 (yearOffset = 148)
{
  const buf = makeGLogBuf({ year: 2048, month: 6, day: 15, hour: 12, minute: 30, second: 0 });
  const recs = parseGLogRecords(buf);
  check('year 2048 works', recs.length, 1);
  check('year 2048 punchDate', recs[0].punchDate, '2048-06-15');
}

// 7. Empty buffer → empty array
{
  const recs = parseGLogRecords(Buffer.alloc(0));
  check('empty buffer', recs.length, 0);
}

// 8. Partial record (11 bytes) → empty array
{
  const recs = parseGLogRecords(Buffer.alloc(11));
  check('11-byte partial buffer', recs.length, 0);
}

// 9. Non-buffer input → empty array (no crash)
{
  const recs = parseGLogRecords(null);
  check('null input no crash', recs.length, 0);
}

// 10. Large userId (e.g. 100000)
{
  const buf = makeGLogBuf({ userId: 100000, year: 2026, month: 3, day: 5, hour: 7, minute: 45 });
  const recs = parseGLogRecords(buf);
  check('large userId', recs[0].userId, 100000);
}

// ── Tests: parseRequest ───────────────────────────────────────────────────────

console.log('\n=== parseRequest ===');

// 11. Binary mode (application/octet-stream)
{
  const headers = {
    'content-type': 'application/octet-stream',
    'dev_id': 'DEV001',
    'request_code': 'receive_cmd',
    'trans_id': 'TXN123',
    'blk_no': '0',
    'blk_len': '100',
  };
  const body = Buffer.from('hello');
  const r = parseRequest(headers, body);
  check('binary mode devId', r.devId, 'DEV001');
  check('binary mode requestCode', r.requestCode, 'receive_cmd');
  check('binary mode transId', r.transId, 'TXN123');
  check('binary mode blkNo', r.blkNo, 0);
  check('binary mode blkLen', r.blkLen, 100);
  check('binary mode bodyBuffer', r.bodyBuffer.toString(), 'hello');
  check('binary mode no error', r.error, null);
}

// 12. JSON mode (application/json;charset=utf-8)
{
  const payload = Buffer.from(JSON.stringify({
    dev_id: 'SIM001',
    request_code: 'realtime_glog',
    trans_id: 'TX999',
    blk_no: 0,
    blk_len: 5,
    block: Buffer.from('hello').toString('base64'),
  }));
  const headers = { 'content-type': 'application/json;charset=utf-8' };
  const r = parseRequest(headers, payload);
  check('json mode devId', r.devId, 'SIM001');
  check('json mode requestCode', r.requestCode, 'realtime_glog');
  check('json mode transId', r.transId, 'TX999');
  check('json mode bodyBuffer decoded', r.bodyBuffer.toString(), 'hello');
  check('json mode no error', r.error, null);
}

// 13. JSON mode without charset (application/json)
{
  const payload = Buffer.from(JSON.stringify({
    dev_id: 'X', request_code: 'receive_cmd', trans_id: 'T', blk_no: 0, blk_len: 0,
  }));
  const headers = { 'content-type': 'application/json' };
  const r = parseRequest(headers, payload);
  check('json no-charset no error', r.error, null);
  check('json no-charset devId', r.devId, 'X');
}

// 14. Unknown content-type → error
{
  const r = parseRequest({ 'content-type': 'text/plain' }, Buffer.alloc(0));
  checkTruthy('unknown content-type → error', r.error);
}

// 15. Malformed JSON body → error
{
  const headers = { 'content-type': 'application/json;charset=utf-8' };
  const r = parseRequest(headers, Buffer.from('not json'));
  checkTruthy('malformed JSON → error', r.error);
}

// 16. encrypt header 'yes' → 'aes'
{
  const headers = { 'content-type': 'application/octet-stream', 'dev_id': 'X', 'request_code': 'rc', 'blk_no': '0', 'blk_len': '0', 'encrypt': 'yes' };
  const r = parseRequest(headers, Buffer.alloc(0));
  check('encrypt yes → aes', r.encrypt, 'aes');
}

// 17. encrypt header 'base64only'
{
  const headers = { 'content-type': 'application/octet-stream', 'dev_id': 'X', 'request_code': 'rc', 'blk_no': '0', 'blk_len': '0', 'encrypt': 'base64only' };
  const r = parseRequest(headers, Buffer.alloc(0));
  check('encrypt base64only', r.encrypt, 'base64only');
}

// ── Tests: parseRealtimeGLog ──────────────────────────────────────────────────

console.log('\n=== parseRealtimeGLog ===');

// 18. Valid realtime_glog BSComm body
{
  const jsonObj = {
    user_id: '42',
    io_mode: '1',
    verify_mode: '20',
    io_time: '20260713093045',
    fk_bin_data_lib: 'FKDataHS100',
    temperature: '0',
  };
  const body = buildJsonBlock(JSON.stringify(jsonObj));
  const r = parseRealtimeGLog(body);
  check('realtime_glog userId', r.userId, '42');
  check('realtime_glog ioMode', r.ioMode, '1');
  check('realtime_glog punchDate', r.punchDate, '2026-07-13');
  check('realtime_glog punchTime', r.punchTime, '09:30:45');
  check('realtime_glog at', r.at, '2026-07-13T09:30:45');
  check('realtime_glog no error', r.error, null);
}

// 19. Empty BSComm body → error
{
  const r = parseRealtimeGLog(Buffer.alloc(0));
  checkTruthy('empty body → error', r.error);
}

// 20. io_time missing/short → no punchDate
{
  const jsonObj = { user_id: '5', io_mode: '0', verify_mode: '1', io_time: '', fk_bin_data_lib: 'FKDataHS100' };
  const body = buildJsonBlock(JSON.stringify(jsonObj));
  const r = parseRealtimeGLog(body);
  check('empty io_time → empty punchDate', r.punchDate, '');
}

// ── Tests: response builders ──────────────────────────────────────────────────

console.log('\n=== Response builders ===');

// 21. buildReceiveCmdResponse with SET_TIME param
{
  const cmdParam = JSON.stringify({ time: '20260713093000' });
  const r = buildReceiveCmdResponse('TX001', 'SET_TIME', cmdParam);
  check('receive_cmd responseCode', r.responseCode, 'OK');
  check('receive_cmd transId', r.transId, 'TX001');
  check('receive_cmd cmdCode', r.cmdCode, 'SET_TIME');
  checkTruthy('receive_cmd body non-empty', r.body.length > 0);
  // Verify the body decodes back to the JSON
  const decoded = getJsonBlock(r.body);
  const obj = JSON.parse(decoded);
  check('receive_cmd body time field', obj.time, '20260713093000');
}

// 22. buildReceiveCmdResponse with no param (empty body)
{
  const r = buildReceiveCmdResponse('TX002', 'GET_DEVICE_STATUS', '');
  check('no-param body empty', r.body.length, 0);
}

// 23. buildSimpleResponse OK
{
  const r = buildSimpleResponse('OK');
  check('simple OK responseCode', r.responseCode, 'OK');
  check('simple OK body empty', r.body.length, 0);
}

// 24. buildSimpleResponse ERROR_NO_CMD with transId
{
  const r = buildSimpleResponse('ERROR_NO_CMD', 'TX123');
  check('ERROR_NO_CMD responseCode', r.responseCode, 'ERROR_NO_CMD');
  check('ERROR_NO_CMD transId', r.transId, 'TX123');
}

// 25. sendResponse writes correct headers (fake http.ServerResponse)
{
  const headers = {};
  let endCalled = false;
  const fakeRes = {
    setHeader: (k, v) => { headers[k.toLowerCase()] = v; },
    end: () => { endCalled = true; },
  };
  const r = buildSimpleResponse('OK', 'TX-test');
  sendResponse(fakeRes, r);
  check('sendResponse response_code header', headers['response_code'], 'OK');
  check('sendResponse trans_id header', headers['trans_id'], 'TX-test');
  check('sendResponse content-type', headers['content-type'], 'application/octet-stream');
  check('sendResponse content-length', headers['content-length'], '0');
  check('sendResponse end called', endCalled, true);
}

// 26. sendResponse with body
{
  const headers = {};
  let bodyWritten = null;
  const fakeRes = {
    setHeader: (k, v) => { headers[k.toLowerCase()] = v; },
    end: (data) => { bodyWritten = data; },
  };
  const cmdParam = JSON.stringify({ time: '20260713120000' });
  const r = buildReceiveCmdResponse('TX-cmd', 'SET_TIME', cmdParam);
  sendResponse(fakeRes, r);
  check('sendResponse with body: response_code', headers['response_code'], 'OK');
  check('sendResponse with body: cmd_code', headers['cmd_code'], 'SET_TIME');
  checkTruthy('sendResponse with body: body buffer sent', bodyWritten && bodyWritten.length > 0);
}

// ── Tests: fkTime14 ───────────────────────────────────────────────────────────

console.log('\n=== fkTime14 ===');

// 27. Known date
{
  const d = new Date(2026, 6, 13, 9, 30, 45); // month is 0-indexed
  const s = fkTime14(d);
  check('fkTime14 2026-07-13 09:30:45', s, '20260713093045');
}

// 28. Zero-padded month/day/hour/minute/second
{
  const d = new Date(2025, 0, 5, 3, 7, 9); // 2025-01-05 03:07:09
  const s = fkTime14(d);
  check('fkTime14 padding', s, '20250105030709');
}

// 29. fkTime14 length is always 14
{
  checkTruthy('fkTime14 length=14', fkTime14(new Date()).length === 14);
}

// ── Tests: BSComm buffer helpers ──────────────────────────────────────────────

console.log('\n=== BSComm buffer helpers ===');

// 30. buildJsonBlock / getJsonBlock round-trip
{
  const text = '{"hello":"world","num":42}';
  const buf = buildJsonBlock(text);
  const decoded = getJsonBlock(buf);
  check('buildJsonBlock/getJsonBlock round-trip', decoded, text);
}

// 31. getJsonBlock from too-short buffer returns ''
{
  check('getJsonBlock empty buffer', getJsonBlock(Buffer.alloc(0)), '');
  check('getJsonBlock 3-byte buffer', getJsonBlock(Buffer.alloc(3)), '');
}

// 32. getJsonBlock strips NUL terminator
{
  const text = 'test';
  const buf = buildJsonBlock(text); // builds: [5 LE] [t e s t \0]
  const decoded = getJsonBlock(buf);
  check('getJsonBlock no trailing NUL in output', decoded, 'test');
}

// ── Summary ───────────────────────────────────────────────────────────────────

const total = passed + failed;
console.log(`\n${passed}/${total} tests passed`);
if (failed > 0) {
  console.log(`${failed} FAILED`);
  process.exit(1);
} else {
  process.exit(0);
}
