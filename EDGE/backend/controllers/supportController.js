'use strict';
const { randomUUID } = require('crypto');
const { getDb } = require('../config/database');
const { sendOk, createHttpError } = require('../utils/http');

const VALID_CATEGORIES = ['hr', 'complaint', 'it', 'payroll', 'grievance'];

function mapRow(row) {
  return {
    id: row.id,
    category: row.category,
    subject: row.subject,
    message: row.is_anonymous ? undefined : row.message,
    isAnonymous: Boolean(row.is_anonymous),
    status: row.status,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  };
}

// POST /support-tickets — body: { category, subject, message, anonymous }
function createTicketHandler(req, res, next) {
  try {
    const empId = req.user?.empId;
    if (!empId) throw createHttpError(401, 'Not authenticated as APK employee');

    const { category, subject, message, anonymous } = req.body || {};
    if (!category || !VALID_CATEGORIES.includes(category)) {
      throw createHttpError(400, `category must be one of: ${VALID_CATEGORIES.join(', ')}`);
    }
    if (!subject || !String(subject).trim()) throw createHttpError(400, 'subject is required');
    if (!message || !String(message).trim()) throw createHttpError(400, 'message is required');

    const isAnonymous = category === 'grievance' && Boolean(anonymous);
    const id = randomUUID();
    const db = getDb();
    db.prepare(
      `INSERT INTO support_tickets (id, employee_id, is_anonymous, category, subject, message)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(id, isAnonymous ? null : empId, isAnonymous ? 1 : 0, category, String(subject).trim(), String(message).trim());

    const row = db.prepare('SELECT * FROM support_tickets WHERE id = ?').get(id);
    return sendOk(res, mapRow(row));
  } catch (err) {
    return next(err);
  }
}

// GET /support-tickets — own tickets only (anonymous ones aren't retrievable, by design)
function listTicketsHandler(req, res, next) {
  try {
    const empId = req.user?.empId;
    if (!empId) throw createHttpError(401, 'Not authenticated as APK employee');

    const rows = getDb()
      .prepare('SELECT * FROM support_tickets WHERE employee_id = ? ORDER BY created_at DESC')
      .all(empId);
    return sendOk(res, rows.map(mapRow));
  } catch (err) {
    return next(err);
  }
}

module.exports = { createTicketHandler, listTicketsHandler };
