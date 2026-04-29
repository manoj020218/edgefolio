'use strict';
const { spawn } = require('child_process');
const path = require('path');
const zkService = require('../services/zktecoService');
const { sendOk, createHttpError } = require('../utils/http');

// ─── Python fallback (pyzk) ────────────────────────────────────────────────────
const SCRIPT = path.resolve(__dirname, '../../python/zkteco_pull.py');

function runPython(args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const bin = process.platform === 'win32' ? 'python' : 'python3';
    const proc = spawn(bin, [SCRIPT, ...args]);

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error('Machine connection timed out (Python fallback)'));
    }, timeoutMs);

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0 && !stdout) {
        return reject(new Error(stderr.trim() || 'Python pull failed'));
      }
      try {
        const result = JSON.parse(stdout.trim());
        if (!result.ok) return reject(new Error(result.error));
        resolve(result);
      } catch {
        reject(new Error(`Invalid Python response: ${stdout.slice(0, 200)}`));
      }
    });

    proc.on('error', (e) => {
      clearTimeout(timer);
      reject(e); // ENOENT or other — caller decides what to surface
    });
  });
}

// ─── Handlers ────────────────────────────────────────────────────────────────
async function testConnectionHandler(req, res, next) {
  try {
    const { ip, port = 4370, password = 0 } = req.body || {};
    if (!ip) throw createHttpError(400, 'Machine IP address is required');

    // Try pure Node.js ZK driver first (zero dependencies)
    const result = await zkService.testConnection({ ip, port: Number(port), password: Number(password) });
    sendOk(res, result);
  } catch (e) {
    next(e);
  }
}

async function pullFromMachineHandler(req, res, next) {
  try {
    const { ip, port = 4370, password = 0, fromDate, toDate } = req.body || {};
    if (!ip) throw createHttpError(400, 'Machine IP address is required');

    let records;

    // ── Primary: pure Node.js ZK UDP driver ──────────────────────────────────
    try {
      records = await zkService.getAttendance({
        ip,
        port:     Number(port),
        password: Number(password),
        fromDate,
        toDate,
      });
    } catch (zkErr) {
      // ── Fallback: Python pyzk (if Python is available) ────────────────────
      try {
        const args = [ip, '--port', String(port), '--password', String(password)];
        if (fromDate) args.push('--from', fromDate);
        if (toDate)   args.push('--to',   toDate);
        const result = await runPython(args, 120_000);
        records = result.records;
      } catch (pyErr) {
        // Both drivers failed — surface the original Node.js error
        throw createHttpError(500, `ZK pull failed: ${zkErr.message}`);
      }
    }

    sendOk(res, records, { total: records.length });
  } catch (e) {
    next(e);
  }
}

module.exports = { testConnectionHandler, pullFromMachineHandler };
