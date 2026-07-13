'use strict';
/**
 * m68-protocol-test.js — Unit tests for m68Protocol.js pure functions.
 * No DB imports. Run with: node scripts/m68-protocol-test.js
 */

const path = require('path');
const {
  fkTime14,
  parseRequest,
  parseGLogRecords,
  parseRealtimeGLog,
  buildReceiveCmdResponse,
  buildSimpleResponse,
  sendResponse,
  getJsonBlock,
  buildJsonBlock,
  ioModeToDirection,
} = require(path.resolve(__dirname, '../services/m68Protocol.js'));

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.error(`  FAIL  ${label}`);
    failed++;
  }
}

function assertEqual(actual, expected, label) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.error(`  FAIL  ${label}`);
    console.error(`        expected: ${JSON.stringify(expected)}`);
    console.error(`        actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}

// ── Helper: build a 12-byte GLog record ────────────────────────────────────
//
// Layout (from FKDataHS100.cs):
//   [0]    Valid
//   [1-2]  tmMode LE: bits 0-5=VerifyMode, bits 6-7=InOut
//   [3]    Second
//   [4-7]  UserId uint32 LE
//   [8-11] tmLog int32 LE: bits 0-11=Year(+1900), 12-15=Month, 16-20=Day, 21-25=Hour, 26-31=Minute
//
function buildGLogRecord({ valid, verifyMode, inOut, second, userId, year, month, day, hour, minute }) {
  const buf = Buffer.alloc(12);

  // [0] Valid
  buf[0] = valid !== undefined ? valid : 1;

  // [1-2] tmMode: bits 0-5=verifyMode, bits 6-7=inOut
  const tmMode = ((inOut || 0) & 0x03) << 6 | ((verifyMode || 0) & 0x3F);
  buf.writeUInt16LE(tmMode, 1);

  // [3] Second
  buf[3] = second || 0;

  // [4-7] UserId
  buf.writeUInt32LE(userId || 0, 4);

  // [8-11] tmLog
  const yearOffset = (year || 2000) - 1900;
  let tmLog = 0;
  tmLog |= (yearOffset & 0xFFF);          // bits 0-11
  tmLog |= ((month || 1) & 0x0F) << 12;  // bits 12-15
  tmLog |= ((day   || 1) & 0x1F) << 16;  // bits 16-20
  tmLog |= ((hour  || 0) & 0x1F) << 21;  // bits 21-25
  tmLog |= ((minute|| 0) & 0x3F) << 26;  // bits 26-31
  buf.writeInt32LE(tmLog, 8);

  return buf;
}

// ── Test: fkTime14 ────────────────────────────────────────────────────────────
console.log('\n--- fkTime14 ---');
{
  const d = new Date(2026, 6, 13, 10, 30, 45); // local time
  const s = fkTime14(d);
  assert(s.length === 14, 'length is 14');
  assert(/^\d{14}$/.test(s), 'all digits');
  assert(s.startsWith('2026'), 'starts with 2026');
  assert(s.slice(4, 6) === '07', 'month 07');
  assert(s.slice(6, 8) === '13', 'day 13');
  assert(s.slice(8, 10) === '10', 'hour 10');
  assert(s.slice(10, 12) === '30', 'minute 30');
  assert(s.slice(12, 14) === '45', 'second 45');
}

// ── Test: parseGLogRecords — empty / short buffer ─────────────────────────────
console.log('\n--- parseGLogRecords: edge cases ---');
{
  const r0 = parseGLogRecords(Buffer.alloc(0));
  assertEqual(r0, [], 'empty buffer → empty array');

  const r1 = parseGLogRecords(Buffer.alloc(11)); // one byte short
  assertEqual(r1, [], '11-byte buffer (too short) → empty array');

  const r2 = parseGLogRecords(null);
  assertEqual(r2, [], 'null buffer → empty array');
}

// ── Test: parseGLogRecords — Valid=0 skip ─────────────────────────────────────
console.log('\n--- parseGLogRecords: Valid=0 skip ---');
{
  const rec = buildGLogRecord({ valid: 0, userId: 42, year: 2026, month: 7, day: 13, hour: 9, minute: 0, second: 0, inOut: 1 });
  const r = parseGLogRecords(rec);
  assertEqual(r, [], 'Valid=0 record is skipped');
}

// ── Test: parseGLogRecords — normal punch ─────────────────────────────────────
console.log('\n--- parseGLogRecords: normal punch ---');
{
  const rec = buildGLogRecord({ valid: 1, userId: 42, year: 2026, month: 7, day: 13, hour: 9, minute: 5, second: 30, inOut: 1, verifyMode: 20 });
  const r = parseGLogRecords(rec);
  assertEqual(r.length, 1, 'one record parsed');
  assertEqual(r[0].userId, 42, 'userId=42');
  assertEqual(r[0].punchDate, '2026-07-13', 'punchDate=2026-07-13');
  assertEqual(r[0].punchTime, '09:05:30', 'punchTime=09:05:30');
  assertEqual(r[0].at, '2026-07-13T09:05:30', 'at ISO string');
  assertEqual(r[0].inOut, 1, 'inOut=1');
  assertEqual(r[0].verifyMode, 20, 'verifyMode=20');
}

// ── Test: parseGLogRecords — multiple records ──────────────────────────────────
console.log('\n--- parseGLogRecords: multiple records ---');
{
  const rec1 = buildGLogRecord({ valid: 1, userId: 10, year: 2026, month: 1, day: 1, hour: 8, minute: 0, second: 0, inOut: 1 });
  const rec2 = buildGLogRecord({ valid: 0, userId: 99, year: 2026, month: 1, day: 1, hour: 8, minute: 1, second: 0, inOut: 1 }); // invalid
  const rec3 = buildGLogRecord({ valid: 1, userId: 20, year: 2026, month: 12, day: 31, hour: 23, minute: 59, second: 59, inOut: 0 });
  const buf = Buffer.concat([rec1, rec2, rec3]);
  const r = parseGLogRecords(buf);
  assertEqual(r.length, 2, 'two valid records (invalid one skipped)');
  assertEqual(r[0].userId, 10, 'first record userId=10');
  assertEqual(r[0].punchDate, '2026-01-01', 'first record date boundary');
  assertEqual(r[1].userId, 20, 'second record userId=20');
  assertEqual(r[1].punchDate, '2026-12-31', 'second record month/day boundary');
  assertEqual(r[1].punchTime, '23:59:59', 'second record time boundary');
  assertEqual(r[1].inOut, 0, 'second record inOut=0');
}

// ── Test: parseGLogRecords — year boundary (Year field stores year-1900) ──────
console.log('\n--- parseGLogRecords: year 2048 boundary ---');
{
  // year=2048 → yearOffset=148 → fits in 8 bits (within 10-bit field)
  const rec = buildGLogRecord({ valid: 1, userId: 1, year: 2048, month: 6, day: 15, hour: 12, minute: 30, second: 0, inOut: 1 });
  const r = parseGLogRecords(rec);
  assertEqual(r.length, 1, 'year 2048 parsed');
  assertEqual(r[0].punchDate, '2048-06-15', 'year 2048 date correct');
}

// ── Test: parseGLogRecords — implausible date skipped ─────────────────────────
console.log('\n--- parseGLogRecords: implausible date skip ---');
{
  // month=13 → implausible
  const rec = buildGLogRecord({ valid: 1, userId: 5, year: 2026, month: 13, day: 1, hour: 0, minute: 0, second: 0, inOut: 1 });
  const r = parseGLogRecords(rec);
  assertEqual(r, [], 'month=13 record skipped');
}

// ── Test: parseRequest — binary (octet-stream) ────────────────────────────────
console.log('\n--- parseRequest: application/octet-stream ---');
{
  const headers = {
    'content-type': 'application/octet-stream',
    'dev_id': 'DEV001',
    'request_code': 'receive_cmd',
    'trans_id': 'TX123',
    'blk_no': '0',
    'blk_len': '20',
  };
  const body = Buffer.from('hello binary');
  const r = parseRequest(headers, body);
  assertEqual(r.devId, 'DEV001', 'octet-stream devId');
  assertEqual(r.requestCode, 'receive_cmd', 'octet-stream requestCode');
  assertEqual(r.transId, 'TX123', 'octet-stream transId');
  assertEqual(r.blkNo, 0, 'octet-stream blkNo');
  assertEqual(r.blkLen, 20, 'octet-stream blkLen');
  assert(r.bodyBuffer.equals(body), 'octet-stream bodyBuffer matches raw');
  assertEqual(r.error, null, 'no error');
}

// ── Test: parseRequest — JSON mode ───────────────────────────────────────────
console.log('\n--- parseRequest: application/json (with charset) ---');
{
  const payloadBin = Buffer.from('test binary data');
  const jsonBody = JSON.stringify({
    dev_id: 'SIM001',
    request_code: 'realtime_glog',
    trans_id: 'TX456',
    blk_no: 0,
    blk_len: payloadBin.length,
    block: payloadBin.toString('base64'),
  });
  const headers = { 'content-type': 'application/json;charset=utf-8' };
  const r = parseRequest(headers, Buffer.from(jsonBody));
  assertEqual(r.devId, 'SIM001', 'JSON devId');
  assertEqual(r.requestCode, 'realtime_glog', 'JSON requestCode');
  assertEqual(r.blkNo, 0, 'JSON blkNo');
  assert(r.bodyBuffer.equals(payloadBin), 'JSON base64 block decoded correctly');
  assertEqual(r.error, null, 'no error');
}

// ── Test: parseRequest — JSON without charset ─────────────────────────────────
console.log('\n--- parseRequest: application/json (no charset) ---');
{
  const headers = { 'content-type': 'application/json' };
  const jsonBody = Buffer.from(JSON.stringify({ dev_id: 'X', request_code: 'receive_cmd', blk_no: 0, blk_len: 0 }));
  const r = parseRequest(headers, jsonBody);
  assertEqual(r.devId, 'X', 'JSON no-charset devId');
  assertEqual(r.error, null, 'no error');
}

// ── Test: parseRequest — unsupported content-type ────────────────────────────
console.log('\n--- parseRequest: unsupported content-type ---');
{
  const headers = { 'content-type': 'text/html' };
  const r = parseRequest(headers, Buffer.alloc(0));
  assert(r.error !== null, 'unsupported content-type returns error');
}

// ── Test: buildJsonBlock / getJsonBlock round-trip ────────────────────────────
console.log('\n--- BSComm JSON block round-trip ---');
{
  const original = '{"time":"20260713103045"}';
  const buf = buildJsonBlock(original);
  assert(Buffer.isBuffer(buf), 'buildJsonBlock returns Buffer');
  // 4-byte length + text + NUL
  assertEqual(buf.length, 4 + original.length + 1, 'buffer length correct');
  const back = getJsonBlock(buf);
  assertEqual(back, original, 'getJsonBlock recovers original string');
}

// ── Test: parseRealtimeGLog ───────────────────────────────────────────────────
console.log('\n--- parseRealtimeGLog ---');
{
  const innerJson = JSON.stringify({
    user_id: '42',
    io_mode: '1',
    verify_mode: '20',
    io_time: '20260713093000',
    fk_bin_data_lib: 'FKDataHS100',
    temperature: '365',
  });
  const bodyBuf = buildJsonBlock(innerJson);
  const r = parseRealtimeGLog(bodyBuf);
  assertEqual(r.error, null, 'no error');
  assertEqual(r.userId, '42', 'userId');
  assertEqual(r.ioMode, '1', 'ioMode');
  assertEqual(r.punchDate, '2026-07-13', 'punchDate');
  assertEqual(r.punchTime, '09:30:00', 'punchTime');
  assertEqual(r.at, '2026-07-13T09:30:00', 'at');
}

// ── Test: buildReceiveCmdResponse ─────────────────────────────────────────────
console.log('\n--- buildReceiveCmdResponse ---');
{
  const r = buildReceiveCmdResponse('TX-001', 'SET_TIME', '{"time":"20260713103045"}');
  assertEqual(r.responseCode, 'OK', 'responseCode=OK');
  assertEqual(r.transId, 'TX-001', 'transId');
  assertEqual(r.cmdCode, 'SET_TIME', 'cmdCode');
  assert(Buffer.isBuffer(r.body), 'body is Buffer');
  assert(r.body.length > 0, 'body has content');
  // The body should be a valid BSComm block containing the JSON
  const recovered = getJsonBlock(r.body);
  assertEqual(recovered, '{"time":"20260713103045"}', 'body JSON block recoverable');
}

// ── Test: buildSimpleResponse ─────────────────────────────────────────────────
console.log('\n--- buildSimpleResponse ---');
{
  const r = buildSimpleResponse('OK');
  assertEqual(r.responseCode, 'OK', 'responseCode=OK');
  assert(r.body.length === 0, 'empty body');

  const r2 = buildSimpleResponse('ERROR_NO_CMD', 'TX-002');
  assertEqual(r2.responseCode, 'ERROR_NO_CMD', 'ERROR_NO_CMD responseCode');
  assertEqual(r2.transId, 'TX-002', 'transId preserved');
}

// ── Test: sendResponse sets headers and body ──────────────────────────────────
console.log('\n--- sendResponse ---');
{
  // Mock http.ServerResponse
  const capturedHeaders = {};
  let capturedBody = null;
  const mockRes = {
    setHeader: (k, v) => { capturedHeaders[k.toLowerCase()] = v; },
    end: (body) => { capturedBody = body || Buffer.alloc(0); },
  };

  const r = buildReceiveCmdResponse('TX-999', 'SET_TIME', '{"time":"20260713000000"}');
  sendResponse(mockRes, r);

  assertEqual(capturedHeaders['response_code'], 'OK', 'response_code header set');
  assertEqual(capturedHeaders['trans_id'], 'TX-999', 'trans_id header set');
  assertEqual(capturedHeaders['cmd_code'], 'SET_TIME', 'cmd_code header set');
  assertEqual(capturedHeaders['content-type'], 'application/octet-stream', 'Content-Type header');
  assert(capturedBody !== null && capturedBody.length > 0, 'body sent');
}

// ── Test: ioModeToDirection ───────────────────────────────────────────────────
console.log('\n--- ioModeToDirection ---');
{
  assertEqual(ioModeToDirection(1), 'in',  'ioMode 1 → in');
  assertEqual(ioModeToDirection('1'), 'in', 'ioMode "1" string → in');
  assertEqual(ioModeToDirection(0), 'out', 'ioMode 0 → out');
  assertEqual(ioModeToDirection(2), 'out', 'ioMode 2 (CHKOUT) → out');
  assertEqual(ioModeToDirection(3), null,  'ioMode 3 (BRKIN) → null');
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${'='.repeat(50)}`);
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log('All tests passed.');
}
