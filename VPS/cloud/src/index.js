'use strict';
/**
 * Entry point: load .env, connect MongoDB, start HTTP. Kept small on purpose — the shared VPS has
 * little free memory, so: one process, small Mongo pool, PM2 restarts it above 200 MB
 * (deploy/ecosystem.config.cjs).
 */
const path = require('path');
const mongoose = require('mongoose');
const { loadConfig } = require('./config');
const { createApp } = require('./app');
const { loadDotEnv } = require('./lib/dotenv');
const pkg = require('../package.json');

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
