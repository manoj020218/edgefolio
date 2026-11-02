const { randomUUID } = require('crypto');
const logger = require('../utils/logger');
const fcm = require('./fcmService');

const CHANNELS = {
  ATTENDANCE_ALERT: 'ef_alerts_v2',
  FACE_RECAPTURE_REQUEST: 'ef_requests_v2',
  FACE_RECAPTURE_DECISION: 'ef_requests_v2',
};
// Announcements get their own sound per kind: SOS = gong, holiday = happy chime, others = strong buzz.
const ANNOUNCE_CHANNEL = { sos: 'ef_sos_v2', holiday: 'ef_holiday_v2' };
const channelFor = (type, data = {}) =>
  type === 'ANNOUNCEMENT' ? (ANNOUNCE_CHANNEL[data && data.announcementType] || 'ef_announce') : (CHANNELS[type] || 'ef_general');

/**
 * Store one inbox row per recipient, then push to their FCM tokens.
 * Never throws; the returned promise always resolves.
 */
async function notifyEmployees(db, empIds, { type, title, body, data, channel } = {}) {
  try {
    const ids = [...new Set((empIds || []).filter(Boolean).map(String))];
    if (!ids.length) return;
    const ch = channel || channelFor(type, data);
    const dataObj = data && typeof data === 'object' ? data : {};
    const dataJson = JSON.stringify(dataObj);

    const ins = db.prepare(
      'INSERT INTO app_notifications (id, emp_id, type, title, body, data_json, created_at) VALUES (?,?,?,?,?,?,?)',
    );
    const prune = db.prepare('DELETE FROM app_notifications WHERE emp_id = ? AND created_at < ?');
    const cutoff = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();
    const now = new Date().toISOString();
    db.transaction(() => {
      for (const id of ids) {
        prune.run(id, cutoff);
        ins.run(randomUUID(), id, type, title, body ?? null, dataJson, now);
      }
    })();

    const sel = db.prepare('SELECT fcm_token FROM employees WHERE id = ?');
    const tokens = ids.map((id) => sel.get(id)?.fcm_token).filter(Boolean);
    if (tokens.length) {
      await fcm.sendToTokens(tokens, title, body, dataObj, { channel: ch });
    }
  } catch (err) {
    logger.warn('notifyEmployees failed', { reason: err.message });
  }
}

module.exports = { notifyEmployees, channelFor };
