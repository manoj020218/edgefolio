'use strict';
/**
 * All configuration comes from environment variables — no IP, hostname or absolute path is
 * written anywhere in the code. That is what lets the cloud start on the shared VPS and move to
 * another server later with only a new .env (CLOUD_ATTENDANCE_PLAN.md §10).
 *
 * On the VPS the variables live in VPS/cloud/.env (git-ignored), loaded by src/index.js.
 */

function required(env, name) {
  const v = env[name];
  if (!v || !String(v).trim()) throw new Error(`Missing required environment variable ${name} (see .env.example)`);
  return String(v).trim();
}

function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || 'development';
  const cfg = {
    nodeEnv,
    port: Number(env.PORT || 3090),
    host: env.HOST || '127.0.0.1',                 // behind nginx; never exposed directly
    // Public address the app and EDGE use, e.g. https://edgefolio.iotsoft.in/cloud
    publicBaseUrl: required(env, 'PUBLIC_BASE_URL').replace(/\/+$/, ''),
    mongoUrl: required(env, 'MONGO_URL'),
    mongoPoolSize: Number(env.MONGO_POOL_SIZE || 5),   // small: the shared VPS has ~600 MB free
    jwtSecret: required(env, 'JWT_SECRET'),
    billingApiUrl: (env.BILLING_API_URL || '').replace(/\/+$/, ''),
    billingApiKey: env.BILLING_API_KEY || '',
    fileStoreDir: env.FILE_STORE_DIR || '',           // only if punch photos are ever enabled
    slowRequestMs: Number(env.SLOW_REQUEST_MS || 500), // the "move to another VPS" trigger watches this
    corsOrigins: String(env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
    // Google OAuth client IDs whose ID tokens we accept (the web client ID the app requests tokens for).
    googleClientIds: String(env.GOOGLE_CLIENT_IDS || '').split(',').map((s) => s.trim()).filter(Boolean),
    // Shared on the owner's Company screen.
    pcDownloadUrl: env.PC_DOWNLOAD_URL || 'https://edgefolio.iotsoft.in/download',
    appDownloadUrl: env.APP_DOWNLOAD_URL || 'https://play.google.com/store/apps/details?id=in.iotsoft.edgefolio',
  };
  if (nodeEnv === 'production' && cfg.jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters in production');
  }
  return cfg;
}

module.exports = { loadConfig };
