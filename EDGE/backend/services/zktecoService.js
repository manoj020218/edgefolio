'use strict';
/**
 * ZK Teco Native Node.js Client — UDP Protocol
 *
 * Pure Node.js implementation of the ZK Teco attendance machine protocol.
 * Uses only Node.js built-in modules (dgram, crypto) — zero extra dependencies.
 *
 * Compatible with: ZK100, ZK200, ZK300, K40, K20, F18, F22, F6, F7,
 *                  MB10, MA300, iClock Series, and most ZKSoftware-based devices.
 *
 * Protocol reference: https://github.com/adrobinoga/zk-protocol
 */

const dgram = require('dgram');

// ─── Protocol Constants ────────────────────────────────────────────────────────
const MAGIC = Buffer.from([0x50, 0x50, 0x82, 0x7d]);
const CMD = {
  CONNECT:        1000,
  EXIT:           1001,
  ENABLEDEVICE:   1002,
  DISABLEDEVICE:  1003,
  ACK_OK:         2000,
  ACK_ERROR:      2001,
  ACK_DATA:       2002,
  PREPARE_DATA:   1500,
  DATA:           1501,
  FREE_DATA:      1502,
  DATA_WRRQ:      1503,
};
const RECORD_SIZE = 40;

// ─── ZK Timestamp Decode ──────────────────────────────────────────────────────
// ZK encodes time as: second + minute*60 + hour*3600 + (day-1)*86400
// + (month-1)*2678400 + (year-2000)*32140800
function decodeTime(t) {
  const sec = t % 60;        t = (t - sec) / 60;
  const min = t % 60;        t = (t - min) / 60;
  const hr  = t % 24;        t = (t - hr)  / 24;
  const day = (t % 31) + 1;  t = (t - day + 1) / 31;
  const mo  = (t % 12) + 1;  t = (t - mo  + 1) / 12;
  return new Date(t + 2000, mo - 1, day, hr, min, sec);
}

// ─── Packet Helpers ───────────────────────────────────────────────────────────
function checksum(buf) {
  let s = 0;
  for (let i = 0; i < buf.length - 1; i += 2) s += buf.readUInt16LE(i);
  if (buf.length % 2) s += buf[buf.length - 1];
  return (~s) & 0xffff;
}

function buildPacket(cmd, data, sid, ctr) {
  const p = Buffer.alloc(8 + (data ? data.length : 0));
  p.writeUInt16LE(cmd, 0);
  p.writeUInt16LE(0,   2); // checksum placeholder
  p.writeUInt16LE(sid, 4);
  p.writeUInt16LE(ctr, 6);
  if (data) data.copy(p, 8);
  p.writeUInt16LE(checksum(p), 2);
  return Buffer.concat([MAGIC, p]);
}

function parsePacket(msg) {
  if (msg.length < 12) return null;
  if (msg.readUInt32BE(0) !== 0x5050827d) return null;
  return {
    cmd:  msg.readUInt16LE(4),
    sid:  msg.readUInt16LE(8),
    ctr:  msg.readUInt16LE(10),
    data: msg.slice(12),
  };
}

// ─── ZKTeco Client ────────────────────────────────────────────────────────────
class ZKTeco {
  constructor(ip, port = 4370, timeout = 15000, password = 0) {
    this.ip      = ip;
    this.port    = port;
    this.timeout = timeout;
    this.password = password;
    this.sid = 0;
    this.ctr = -1;
    this.sock = null;
  }

  // ── Connection ──────────────────────────────────────────────────────────────
  async connect() {
    await this._bind();
    const r = await this._sendRecv(CMD.CONNECT);
    if (r.cmd !== CMD.ACK_OK) throw new Error(`Device refused connection (response cmd=${r.cmd})`);
    this.sid = r.sid;
  }

  async disconnect() {
    try { await this._sendRecv(CMD.EXIT); } catch {}
    if (this.sock) { try { this.sock.close(); } catch {} this.sock = null; }
  }

  // ── Attendance Pull ─────────────────────────────────────────────────────────
  async getAttendance(fromDate, toDate) {
    // Disable device so no new records arrive during read
    await this._sendRecv(CMD.DISABLEDEVICE).catch(() => {});

    // Clear any leftover data from previous sessions
    await this._sendRecv(CMD.FREE_DATA).catch(() => {});

    // Request attendance log table (table ID 13)
    // Format: pack('<bhii', 1, 13, 0, 0) — matches pyzk
    const req = Buffer.alloc(11);
    req[0] = 0x01;
    req.writeInt16LE(13, 1);
    // remaining 8 bytes stay 0

    const resp = await this._sendRecv(CMD.DATA_WRRQ, req);

    let raw = Buffer.alloc(0);

    if (resp.cmd === CMD.PREPARE_DATA) {
      // Large dataset — server will stream DATA packets
      // Total size is at offset 1 in data (4 bytes LE)
      const total = resp.data.length >= 5 ? resp.data.readUInt32LE(1) : 0;
      raw = await this._collectDataPackets(total);
    } else if (resp.cmd === CMD.ACK_OK && resp.data.length > 0) {
      // Small dataset — data already in the ACK_OK response
      raw = resp.data;
    }
    // cmd === ACK_ERROR or no data → empty raw (no records)

    // Re-enable device
    await this._sendRecv(CMD.FREE_DATA).catch(() => {});
    await this._sendRecv(CMD.ENABLEDEVICE).catch(() => {});

    return this._parseRecords(raw, fromDate, toDate);
  }

  // ── Receive bulk data sent as multiple CMD_DATA packets ──────────────────────
  async _collectDataPackets(totalExpected) {
    const chunks = [];
    let received = 0;

    while (received < totalExpected) {
      const pkt = await this._recvPacket(4000); // 4 s per chunk
      if (!pkt) break;                           // timeout → done
      if (pkt.cmd === CMD.DATA) {
        chunks.push(pkt.data);
        received += pkt.data.length;
      } else if (pkt.cmd === CMD.ACK_OK) {
        break;                                   // server says done
      }
    }

    return Buffer.concat(chunks);
  }

  // ── Parse 40-byte attendance records ────────────────────────────────────────
  _parseRecords(raw, fromDate, toDate) {
    const byKey = {};

    for (let i = 0; i + RECORD_SIZE <= raw.length; i += RECORD_SIZE) {
      const r  = raw.slice(i, i + RECORD_SIZE);
      const id = r.slice(0, 9).toString('ascii').replace(/\0/g, '').trim();
      if (!id) continue;

      const ts = r.readUInt32LE(24);
      if (!ts)  continue;

      const dt = decodeTime(ts);
      const d  = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
      const t  = `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;

      if (fromDate && d < fromDate) continue;
      if (toDate   && d > toDate)   continue;

      const k = `${id}_${d}`;
      if (!byKey[k]) byKey[k] = { memberId: id, date: d, punches: [] };
      byKey[k].punches.push(t);
    }

    return Object.values(byKey).map((g) => {
      const ps = [...new Set(g.punches)].sort();
      return {
        memberId: g.memberId,
        date:     g.date,
        checkIn:  ps[0]                             || null,
        checkOut: ps.length > 1 ? ps[ps.length - 1] : null,
      };
    }).sort((a, b) => (a.date + a.memberId).localeCompare(b.date + b.memberId));
  }

  // ── Low-level UDP helpers ────────────────────────────────────────────────────
  _bind() {
    return new Promise((resolve, reject) => {
      this.sock = dgram.createSocket('udp4');
      this.sock.once('error', reject);
      this.sock.bind(0, resolve); // bind to any available port
    });
  }

  _sendRecv(cmd, data) {
    return new Promise((resolve, reject) => {
      this.ctr++;
      const pkt   = buildPacket(cmd, data, this.sid, this.ctr);
      const timer = setTimeout(() => {
        this.sock.removeListener('message', handler);
        reject(new Error(`Timeout: no response for command ${cmd} from ${this.ip}`));
      }, this.timeout);

      const handler = (msg) => {
        clearTimeout(timer);
        this.sock.removeListener('message', handler);
        const p = parsePacket(msg);
        if (p) resolve(p); else reject(new Error('Malformed response from device'));
      };

      this.sock.on('message', handler);
      this.sock.send(pkt, this.port, this.ip, (err) => {
        if (err) { clearTimeout(timer); this.sock.removeListener('message', handler); reject(err); }
      });
    });
  }

  _recvPacket(ms) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.sock.removeListener('message', handler);
        resolve(null); // timeout = done collecting
      }, ms);

      const handler = (msg) => {
        clearTimeout(timer);
        this.sock.removeListener('message', handler);
        resolve(parsePacket(msg));
      };

      this.sock.once('message', handler);
    });
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────
async function getAttendance({ ip, port = 4370, password = 0, fromDate, toDate }) {
  const zk = new ZKTeco(ip, port, 15000, password);
  try {
    await zk.connect();
    return await zk.getAttendance(fromDate, toDate);
  } finally {
    await zk.disconnect();
  }
}

async function testConnection({ ip, port = 4370, password = 0 }) {
  const zk = new ZKTeco(ip, port, 10000, password);
  try {
    await zk.connect();
    return { connected: true, firmware: 'ZK Protocol', message: `Connected to ${ip}:${port}` };
  } finally {
    await zk.disconnect();
  }
}

module.exports = { getAttendance, testConnection };
