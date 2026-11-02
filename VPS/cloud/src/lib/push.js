'use strict';
/**
 * Firebase Cloud Messaging for the app (same payloads as EDGE/backend/services/fcmService.js).
 * Enabled only when FIREBASE_SERVICE_ACCOUNT_PATH points at a service-account JSON on the server
 * (never in git). Without it every send is a silent no-op, so dev/tests need no Firebase.
 * Tests swap the transport with setTransport().
 */
const fs = require('fs');
const path = require('path');

let transport;          // async ({ tokens, title, body, data }) => void
let initialised = false;

function init() {
  initialised = true;
  const p = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (!p || !fs.existsSync(p)) { transport = null; return; }
  try {
    const admin = require('firebase-admin');
    if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(p))) });
    const messaging = admin.messaging();
    transport = async ({ tokens, title, body, data }) => {
      await messaging.sendEachForMulticast({
        tokens, notification: { title, body }, android: { priority: 'high' },
        data: Object.fromEntries(Object.entries(data || {}).map(([k, v]) => [k, String(v ?? '')])),
      });
    };
    console.log('[push] FCM enabled');
  } catch (e) {
    transport = null;
    console.warn('[push] FCM unavailable:', e.message);
  }
}

/** Best-effort: never throws. */
async function sendToTokens(tokens, title, body, data = {}) {
  if (!initialised) init();
  const valid = [...new Set((tokens || []).filter(Boolean))];
  if (!transport || !valid.length) return;
  try { await transport({ tokens: valid, title, body, data }); }
  catch (e) { console.warn('[push] send failed:', e.message); }
}

function setTransport(fn) { initialised = true; transport = fn; }

module.exports = { sendToTokens, setTransport };
