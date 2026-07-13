'use strict';
/**
 * m68-protocol-test.js — Unit tests for m68Protocol.js pure functions.
 *
 * Tests:
 *   - parseGLogRecords: 12-byte CIF11 structs (valid, invalid Valid flag, edge cases)
 *   - parseGetLogDataResult: BSComm buffer → punches
 *   - parseGetUserIdListResult: BSComm buffer → users
 *   - parseRealtimeGLog: BSComm JSON body
 *   - buildJsonBlock / getJsonBlock round-trip
 *   - buildBinaryBlock / getBinaryBlock round-trip
 *   - fkTime14
 *
 * Run: node scripts/m68-protocol-test.js
 */

const path = require('path');
const {
  parseGLogRecords,
  parseGetLogDataResult,
  parseGetUserIdListResult,
  parseRealtimeGLog,
  buildJsonBlock,
  getJsonBlock,
  getBinaryBlock,
  fkTime14,
} = require(path.join(__dirname, '..', 'EDGE', 'backend', 'services', 'm68Protocol'));

let passed = 0, failed = 0;
function check(label, actual, expected, detail) {
  const ok = actual === expected;
  if (ok) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.log(`  FAIL  ${label}: got ${JSON.stringify(actual)} expected ${JSON.stringify(expected)}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}
function checkTrue(label, val, detail) { check(label, !!val, true, detail); }
function checkEq(label, actual, expected) { check(label, JSON.stringify(actual), JSON.stringify(expected)); }

// ── helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a 12-byte GLog record (same helper as in the sim).
 * Layout: [0]=Valid, [1-2]=tmMode LE, [3]=Second, [4-7]=UserId LE, [8-11]=tmLog LE
 */
function buildGLogRecord({ userId, year, month, day, hour, minute, second = 0, inOut = 1, verifyMode = 0, valid = 1 }) {
  const buf = Buffer.alloc(12);
  buf[0] = valid;
  const tmMode = (verifyMode & 0x3F) | ((inOut & 0x03) << 6);
  buf.writeUInt16LE(tmMode, 1);
  buf[3] = second & 0xFF;
  buf.writeUInt32LE(userId >>> 0, 4);
  const yearOffset = (year - 1900) & 0xFFF;
  const tmLog = yearOffset | ((month & 0x0F) << 12) | ((day & 0x1F) << 16) | ((hour & 0x1F) << 21) | ((minute & 0x3F) << 26);
  buf.writeInt32LE(tmLog, 8);
  return buf;
}

/**
 * Build an 8-byte UserIdInfo record.
 * [0]=Enabled, [1]=Privilege, [2]=BackupNumber, [3]=padding, [4-7]=UserId LE
 */
function buildUserIdRecord({ userId, enabled = 1, privilege = 0, backupNumber = 0 }) {
  const buf = Buffer.alloc(8);
  buf[0] = enabled;
  buf[1] = privilege;
  buf[2] = backupNumber;
  buf[3] = 0;
  buf.writeUInt32LE(userId >>> 0, 4);
  return buf;
}

/**
 * Build a BSComm buffer with JSON block + optional binary block (BIN_1).
 */
function buildBSCommBuffer(jsonText, binBuffer) {
  const jsonBytes = Buffer.from(jsonText, 'utf8');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32LE(jsonBytes.length + 1, 0);
  const parts = [lenBuf, jsonBytes, Buffer.alloc(1)];
  if (binBuffer && binBuffer.length > 0) {
    const binLen = Buffer.alloc(4);
    binLen.writeUInt32LE(binBuffer.length, 0);
    parts.push(binLen, binBuffer);
  }
  return Buffer.concat(parts);
}

// ── buildJsonBlock / getJsonBlock round-trip ──────────────────────────────────

console.log('\n=== buildJsonBlock / getJsonBlock ===');
{
  const text = '{"log_count":5,"one_log_size":12}';
  const buf = buildJsonBlock(text);
  const back = getJsonBlock(buf);
  check('round-trip simple JSON', back, text);
}
{
  // Empty string
  const buf = buildJsonBlock('');
  const back = getJsonBlock(buf);
  check('empty JSON block → empty string back', back, '');
}

// ── getBinaryBlock ────────────────────────────────────────────────────────────

console.log('\n=== getBinaryBlock ===');
{
  const jsonText = '{"n":3}';
  const binData  = Buffer.from([0xDE, 0xAD, 0xBE, 0xEF]);
  const buf = buildBSCommBuffer(jsonText, binData);
  const extracted = getBinaryBlock(1, buf);
  checkEq('getBinaryBlock(1) matches original', Array.from(extracted), Array.from(binData));
}
{
  // No binary block
  const buf = buildBSCommBuffer('{}', null);
  const extracted = getBinaryBlock(1, buf);
  check('getBinaryBlock no binary → empty', extracted.length, 0);
}

// ── parseGLogRecords ──────────────────────────────────────────────────────────

console.log('\n=== parseGLogRecords (individual records) ===');
{
  // Valid record: user 101, 2026-07-10 09:05:12, in
  const rec = buildGLogRecord({ userId: 101, year: 2026, month: 7, day: 10, hour: 9, minute: 5, second: 12, inOut: 1 });
  const results = parseGLogRecords(rec);
  check('valid record: count', results.length, 1);
  check('valid record: userId', results[0]?.userId, 101);
  check('valid record: punchDate', results[0]?.punchDate, '2026-07-10');
  check('valid record: punchTime', results[0]?.punchTime, '09:05:12');
  check('valid record: inOut', results[0]?.inOut, 1);
  check('valid record: verifyMode', results[0]?.verifyMode, 0);
}
{
  // Invalid Valid flag (=0) — should be skipped
  const rec = buildGLogRecord({ userId: 999, year: 2026, month: 7, day: 1, hour: 8, minute: 0, valid: 0 });
  const results = parseGLogRecords(rec);
  check('invalid Valid=0: skipped', results.length, 0);
}
{
  // Edge case: year 2048 (yearOffset=148)
  const rec = buildGLogRecord({ userId: 5, year: 2048, month: 12, day: 31, hour: 23, minute: 59, second: 59 });
  const results = parseGLogRecords(rec);
  check('edge year 2048: count', results.length, 1);
  check('edge year 2048: punchDate', results[0]?.punchDate, '2048-12-31');
}
{
  // Invalid month (month=0) — should be skipped
  const rec = buildGLogRecord({ userId: 50, year: 2026, month: 0, day: 1, hour: 8, minute: 0 });
  const results = parseGLogRecords(rec);
  check('invalid month=0: skipped', results.length, 0);
}
{
  // Multiple records (mixed valid/invalid)
  const r1 = buildGLogRecord({ userId: 101, year: 2026, month: 7, day: 10, hour: 9,  minute: 5,  inOut: 1, valid: 1 });
  const r2 = buildGLogRecord({ userId: 999, year: 2026, month: 7, day: 10, hour: 10, minute: 0,  inOut: 0, valid: 0 }); // skip
  const r3 = buildGLogRecord({ userId: 202, year: 2026, month: 7, day: 11, hour: 8,  minute: 55, inOut: 1, valid: 1 });
  const results = parseGLogRecords(Buffer.concat([r1, r2, r3]));
  check('3 records (1 invalid): count', results.length, 2);
  check('3 records: first userId', results[0]?.userId, 101);
  check('3 records: second userId', results[1]?.userId, 202);
}

// ── parseGetLogDataResult ─────────────────────────────────────────────────────

console.log('\n=== parseGetLogDataResult ===');
{
  const punches = [
    { userId: 101, year: 2026, month: 7, day: 10, hour: 9,  minute: 5,  second: 12, inOut: 1 },
    { userId: 101, year: 2026, month: 7, day: 10, hour: 18, minute: 2,  second: 45, inOut: 0 },
    { userId: 202, year: 2026, month: 7, day: 11, hour: 8,  minute: 55, second: 30, inOut: 1 },
    { userId: 202, year: 2026, month: 7, day: 11, hour: 13, minute: 0,  second: 0,  inOut: 0 },
    { userId: 202, year: 2026, month: 7, day: 11, hour: 17, minute: 59, second: 0,  inOut: 0 },
  ];
  const binRecords = Buffer.concat(punches.map(buildGLogRecord));
  const jsonMeta = JSON.stringify({ log_count: punches.length, one_log_size: 12 });
  const buf = buildBSCommBuffer(jsonMeta, binRecords);

  const result = parseGetLogDataResult(buf);
  check('parseGetLogDataResult: no error', result.error, null);
  check('parseGetLogDataResult: logCount', result.logCount, 5);
  check('parseGetLogDataResult: punches count', result.punches.length, 5);
  check('parseGetLogDataResult: first userId', result.punches[0]?.userId, 101);
  check('parseGetLogDataResult: last userId', result.punches[4]?.userId, 202);
  check('parseGetLogDataResult: first punchDate', result.punches[0]?.punchDate, '2026-07-10');
}
{
  // Wrong one_log_size
  const buf = buildBSCommBuffer(JSON.stringify({ log_count: 1, one_log_size: 24 }), Buffer.alloc(24));
  const result = parseGetLogDataResult(buf);
  checkTrue('wrong one_log_size → error', result.error);
}
{
  // Empty (log_count=0)
  const buf = buildBSCommBuffer(JSON.stringify({ log_count: 0, one_log_size: 12 }), null);
  const result = parseGetLogDataResult(buf);
  check('empty log → no error', result.error, null);
  check('empty log → 0 punches', result.punches.length, 0);
}
{
  // Missing JSON block
  const result = parseGetLogDataResult(Buffer.alloc(2));
  checkTrue('too-short buffer → error', result.error);
}

// ── parseGetUserIdListResult ──────────────────────────────────────────────────

console.log('\n=== parseGetUserIdListResult ===');
{
  const users = [
    { userId: 101, enabled: 1, privilege: 0, backupNumber: 1 },
    { userId: 202, enabled: 1, privilege: 0, backupNumber: 1 },
    { userId: 303, enabled: 1, privilege: 1, backupNumber: 0 },
  ];
  const binRecords = Buffer.concat(users.map(buildUserIdRecord));
  const jsonMeta = JSON.stringify({ user_id_count: users.length, one_user_id_size: 8 });
  const buf = buildBSCommBuffer(jsonMeta, binRecords);

  const result = parseGetUserIdListResult(buf);
  check('parseGetUserIdListResult: no error', result.error, null);
  check('parseGetUserIdListResult: userCount', result.userCount, 3);
  check('parseGetUserIdListResult: users count', result.users.length, 3);
  check('parseGetUserIdListResult: first userId', result.users[0]?.userId, 101);
  check('parseGetUserIdListResult: third userId', result.users[2]?.userId, 303);
  check('parseGetUserIdListResult: admin privilege', result.users[2]?.privilege, 1);
  check('parseGetUserIdListResult: enabled', result.users[0]?.enabled, 1);
  check('parseGetUserIdListResult: backupNumber', result.users[0]?.backupNumber, 1);
}
{
  // Wrong one_user_id_size
  const buf = buildBSCommBuffer(JSON.stringify({ user_id_count: 1, one_user_id_size: 12 }), Buffer.alloc(12));
  const result = parseGetUserIdListResult(buf);
  checkTrue('wrong one_user_id_size → error', result.error);
}
{
  // Empty user list
  const buf = buildBSCommBuffer(JSON.stringify({ user_id_count: 0, one_user_id_size: 8 }), null);
  const result = parseGetUserIdListResult(buf);
  check('empty user list → no error', result.error, null);
  check('empty user list → 0 users', result.users.length, 0);
}

// ── parseRealtimeGLog ─────────────────────────────────────────────────────────

console.log('\n=== parseRealtimeGLog ===');
{
  const jsonPayload = JSON.stringify({
    user_id: '101',
    io_mode: '1',
    verify_mode: '0',
    io_time: '20260710090512',
    fk_bin_data_lib: 'FKDataHS100',
    temperature: '0',
  });
  const buf = buildJsonBlock(jsonPayload);
  const result = parseRealtimeGLog(buf);
  check('parseRealtimeGLog: no error', result.error, null);
  check('parseRealtimeGLog: userId', result.userId, '101');
  check('parseRealtimeGLog: punchDate', result.punchDate, '2026-07-10');
  check('parseRealtimeGLog: punchTime', result.punchTime, '09:05:12');
  check('parseRealtimeGLog: at', result.at, '2026-07-10T09:05:12');
}

// ── fkTime14 ─────────────────────────────────────────────────────────────────

console.log('\n=== fkTime14 ===');
{
  const d = new Date('2026-07-13T10:30:00');
  const s = fkTime14(d);
  checkTrue('fkTime14 length 14', s.length === 14);
  check('fkTime14 format', s.slice(0, 8), '20260713');
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
