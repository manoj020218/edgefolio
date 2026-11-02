'use strict';
/**
 * One way to tell employees something: store it in their in-app inbox (AppNotification) AND push
 * it to their phones on the matching Android channel (own sound/vibration, see the app's
 * NotificationChannels). Never throws — a failed push or insert must not break the caller.
 */
const push = require('./push');

const CHANNEL_BY_TYPE = {
  ATTENDANCE_ALERT: 'ef_alerts',
  FACE_RECAPTURE_REQUEST: 'ef_requests',
  FACE_RECAPTURE_DECISION: 'ef_requests',
  ANNOUNCEMENT: 'ef_general',
};
const channelFor = (type) => CHANNEL_BY_TYPE[type] || 'ef_general';
const KEEP_DAYS = 90;

async function notifyEmployees(db, empIds, { type, title, body = null, data = {} }) {
  try {
    const ids = [...new Set((empIds || []).map(String).filter(Boolean))];
    if (!ids.length) return;
    await db.AppNotification.create(ids.map((empId) => ({ empId, type, title, body, data: { ...data, type } })));
    await db.AppNotification.deleteMany({ empId: { $in: ids }, createdAt: { $lt: new Date(Date.now() - KEEP_DAYS * 86400000) } });
    const rows = await db.Employee.find({ empId: { $in: ids }, status: 'active', fcmToken: { $ne: null } }, { fcmToken: 1 }).lean();
    await push.sendToTokens(rows.map((r) => r.fcmToken), title, body || '', { ...data, type }, { channel: channelFor(type) });
  } catch (e) {
    console.warn('[notify] failed:', e.message);
  }
}

module.exports = { notifyEmployees, channelFor };
