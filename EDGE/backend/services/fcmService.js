const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const { FIREBASE_SERVICE_ACCOUNT_PATH } = require('../config/app');

let messaging = null;

function init() {
  const accountPath = FIREBASE_SERVICE_ACCOUNT_PATH;
  if (!accountPath || !fs.existsSync(accountPath)) {
    logger.info('Firebase service account not found — push notifications disabled', { accountPath });
    return;
  }
  try {
    // firebase-admin is an optional dep — only installed when FCM is needed
    const admin = require('firebase-admin');
    if (admin.apps.length === 0) {
      const serviceAccount = require(path.resolve(accountPath));
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    }
    messaging = admin.messaging();
    logger.info('FCM service initialised');
  } catch (err) {
    logger.warn('FCM unavailable — push notifications disabled', { reason: err.message });
  }
}

function buildPayload(title, body, data, opts) {
  const d = { ...(data || {}) };
  let android = { priority: 'high' };
  if (opts && opts.channel) {
    d.channel = opts.channel;
    android = {
      priority: 'high',
      notification: { channelId: opts.channel, sound: 'default', defaultVibrateTimings: false },
    };
  }
  return {
    notification: { title, body },
    data: Object.fromEntries(Object.entries(d).map(([k, v]) => [k, String(v)])),
    android,
  };
}

async function sendToToken(token, title, body, data = {}, opts = {}) {
  if (!messaging || !token) return;
  try {
    await messaging.send({
      token,
      ...buildPayload(title, body, data, opts),
    });
  } catch (err) {
    logger.warn('FCM send failed', { token: token.slice(0, 20), reason: err.message });
  }
}

async function sendToTokens(tokens, title, body, data = {}, opts = {}) {
  if (!messaging) return;
  const valid = (tokens || []).filter(Boolean);
  if (!valid.length) return;
  try {
    await messaging.sendEachForMulticast({
      tokens: valid,
      ...buildPayload(title, body, data, opts),
    });
  } catch (err) {
    logger.warn('FCM multicast failed', { count: valid.length, reason: err.message });
  }
}

init();

module.exports = { sendToToken, sendToTokens };
