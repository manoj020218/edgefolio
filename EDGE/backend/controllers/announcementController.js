const { randomUUID } = require('crypto');
const { getDb } = require('../config/database');
const { sendOk, createHttpError } = require('../utils/http');

function serializeAnnouncement(row) {
  if (!row) return null;
  return {
    id: row.id,
    type: row.type,
    message: row.message,
    announcedByEmpId: row.announced_by_emp_id,
    announcedByName: row.announced_by_name,
    announcedByDesignation: row.announced_by_designation,
    target: row.target,
    sendSms: Boolean(row.send_sms),
    createdAt: row.created_at,
  };
}

function listAnnouncementsHandler(req, res) {
  const db = getDb();
  const since = req.query.since || '1970-01-01T00:00:00Z';
  const target = req.query.target;

  let query = `SELECT * FROM announcements WHERE created_at >= ?`;
  const params = [since];

  if (target && target !== 'all') {
    query += ` AND (target = 'all' OR target = ?)`;
    params.push(target);
  }
  query += ` ORDER BY created_at DESC LIMIT 100`;

  const rows = db.prepare(query).all(...params).map(serializeAnnouncement);
  sendOk(res, rows, { count: rows.length });
}

function createAnnouncementHandler(req, res, next) {
  try {
    const b = req.body || {};
    if (!b.message) throw createHttpError(400, 'message is required');
    if (!b.announcedByName && !b.announced_by_name) {
      throw createHttpError(400, 'announcedByName is required');
    }

    const db = getDb();
    const id = randomUUID();

    db.prepare(
      `INSERT INTO announcements
         (id, type, message, announced_by_emp_id, announced_by_name, announced_by_designation, target, send_sms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      b.type || 'general',
      b.message,
      b.announcedByEmpId || b.announced_by_emp_id || null,
      b.announcedByName || b.announced_by_name,
      b.announcedByDesignation || b.announced_by_designation || null,
      b.target || 'all',
      b.sendSms || b.send_sms ? 1 : 0,
    );

    const row = serializeAnnouncement(db.prepare('SELECT * FROM announcements WHERE id = ?').get(id));
    res.status(201);
    return sendOk(res, row);
  } catch (err) {
    return next(err);
  }
}

function deleteAnnouncementHandler(req, res, next) {
  const db = getDb();
  const result = db.prepare('DELETE FROM announcements WHERE id = ?').run(req.params.id);
  if (!result.changes) return next(createHttpError(404, 'Announcement not found'));
  return sendOk(res, { id: req.params.id, deleted: true });
}

module.exports = {
  listAnnouncementsHandler,
  createAnnouncementHandler,
  deleteAnnouncementHandler,
};
