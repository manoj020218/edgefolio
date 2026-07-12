const path = require('path');
const logger = require('../utils/logger');

let messaging = null;

function init() {
  const accountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (!accountPath) return;
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

async function sendToToken(token, title, body, data = {}) {
  if (!messaging || !token) return;
  try {
    await messaging.send({
      token,
      notification: { title, body },
      data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
      android: { priority: 'high' },
    });
  } catch (err) {
    logger.warn('FCM send failed', { token: token.slice(0, 20), reason: err.message });
  }
}

async function sendToTokens(tokens, title, body, data = {}) {
  if (!messaging) return;
  const valid = (tokens || []).filter(Boolean);
  if (!valid.length) return;
  try {
    await messaging.sendEachForMulticast({
      tokens: valid,
      notification: { title, body },
      data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
      android: { priority: 'high' },
    });
  } catch (err) {
    logger.warn('FCM multicast failed', { count: valid.length, reason: err.message });
  }
}

init();

module.exports = { sendToToken, sendToTokens };
