'use strict';
/**
 * Entry point: load .env, connect MongoDB, start HTTP. Kept small on purpose — the shared VPS has
 * little free memory, so: one process, small Mongo pool, PM2 restarts it above 200 MB
 * (deploy/ecosystem.config.cjs).
 */
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const { loadConfig } = require('./config');
const { createApp } = require('./app');
const pkg = require('../package.json');

// Minimal .env loader (no extra dependency): KEY=value lines, # comments. Existing env wins.
function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    const value = m[2].replace(/^(['"])(.*)\1$/, '$2');
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

async function main() {
  loadDotEnv(path.join(__dirname, '..', '.env'));
  const config = loadConfig();

  mongoose.set('strictQuery', true);
  mongoose.connection.on('disconnected', () => console.warn('[db] disconnected'));
  mongoose.connection.on('reconnected', () => console.log('[db] reconnected'));
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  const getDbState = () => states[mongoose.connection.readyState] || 'unknown';

  const app = createApp({ config, getDbState, version: pkg.version });
  const server = app.listen(config.port, config.host, () => {
    console.log(`[edgefolio-cloud] v${pkg.version} listening on ${config.host}:${config.port}, public ${config.publicBaseUrl}`);
  });

  // Start serving /health even while Mongo connects, so a DB problem shows as 503, not a dead port.
  try {
    await mongoose.connect(config.mongoUrl, { maxPoolSize: config.mongoPoolSize, serverSelectionTimeoutMS: 10000 });
    console.log('[db] connected');
  } catch (err) {
    console.error('[db] initial connection failed:', err.message, '— retrying in the background');
    setTimeout(() => mongoose.connect(config.mongoUrl, { maxPoolSize: config.mongoPoolSize }).catch(() => {}), 15000);
  }

  const shutdown = (sig) => {
    console.log(`[edgefolio-cloud] ${sig}, shutting down`);
    server.close(() => mongoose.disconnect().finally(() => process.exit(0)));
    setTimeout(() => process.exit(1), 8000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => { console.error('[edgefolio-cloud] fatal:', err.message); process.exit(1); });
