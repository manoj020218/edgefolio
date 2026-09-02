'use strict';
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { getDb } = require('../config/database');
const { UPLOADS_DIR } = require('../config/app');
const { sendOk, createHttpError } = require('../utils/http');

function requireEmpId(req) {
  const empId = req.user?.empId;
  if (!empId) throw createHttpError(401, 'Not authenticated as APK employee');
  return empId;
}

function mapRow(row) {
  return {
    id: row.id,
    customerName: row.customer_name,
    location: row.location,
    contactPerson: row.contact_person,
    purpose: row.purpose,
    status: row.status,
    scheduledFor: row.scheduled_for,
    checkInAt: row.check_in_at,
    remarks: row.remarks,
    hasPhoto: Boolean(row.photo_path),
    hasSignature: Boolean(row.signature_data),
    completedAt: row.completed_at,
    createdAt: row.created_at,
  };
}

// POST /visits — body: { customerName, location, contactPerson, purpose, scheduledFor }
function createVisitHandler(req, res, next) {
  try {
    const empId = requireEmpId(req);
    const { customerName, location, contactPerson, purpose, scheduledFor } = req.body || {};
    if (!customerName || !String(customerName).trim()) throw createHttpError(400, 'customerName is required');

    const id = randomUUID();
    const db = getDb();
    db.prepare(
      `INSERT INTO employee_visits (id, employee_id, customer_name, location, contact_person, purpose, scheduled_for)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, empId, String(customerName).trim(), location || null, contactPerson || null, purpose || null, scheduledFor || null);

    const row = db.prepare('SELECT * FROM employee_visits WHERE id = ?').get(id);
    return sendOk(res, mapRow(row));
  } catch (err) {
    return next(err);
  }
}

// GET /visits/today
function listTodayVisitsHandler(req, res, next) {
  try {
    const empId = requireEmpId(req);
    const today = new Date().toISOString().slice(0, 10);
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT * FROM employee_visits
         WHERE employee_id = ? AND (scheduled_for IS NULL OR scheduled_for = ? OR date(created_at) = ?)
         ORDER BY status = 'completed' ASC, created_at ASC`,
      )
      .all(empId, today, today);
    return sendOk(res, rows.map(mapRow));
  } catch (err) {
    return next(err);
  }
}

// POST /visits/:id/check-in — body: { lat, lon }
function checkInVisitHandler(req, res, next) {
  try {
    const empId = requireEmpId(req);
    const { lat, lon } = req.body || {};
    const db = getDb();
    const visit = db.prepare('SELECT id FROM employee_visits WHERE id = ? AND employee_id = ?').get(req.params.id, empId);
    if (!visit) throw createHttpError(404, 'Visit not found');

    db.prepare(
      `UPDATE employee_visits
       SET status = 'checked_in', check_in_at = CURRENT_TIMESTAMP, check_in_lat = ?, check_in_lon = ?
       WHERE id = ?`,
    ).run(lat ?? null, lon ?? null, req.params.id);

    const row = db.prepare('SELECT * FROM employee_visits WHERE id = ?').get(req.params.id);
    return sendOk(res, mapRow(row));
  } catch (err) {
    return next(err);
  }
}

// POST /visits/:id/complete — body: { remarks, photoBase64, signatureBase64 }
function completeVisitHandler(req, res, next) {
  try {
    const empId = requireEmpId(req);
    const { remarks, photoBase64, signatureBase64 } = req.body || {};
    const db = getDb();
    const visit = db.prepare('SELECT id FROM employee_visits WHERE id = ? AND employee_id = ?').get(req.params.id, empId);
    if (!visit) throw createHttpError(404, 'Visit not found');

    let photoPath = null;
    if (photoBase64) {
      const dir = path.join(UPLOADS_DIR, 'visits', empId);
      fs.mkdirSync(dir, { recursive: true });
      const fileName = `${req.params.id}-photo.jpg`;
      const buffer = Buffer.from(photoBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
      fs.writeFileSync(path.join(dir, fileName), buffer);
      photoPath = path.join('visits', empId, fileName);
    }

    db.prepare(
      `UPDATE employee_visits
       SET status = 'completed', remarks = ?, photo_path = COALESCE(?, photo_path),
           signature_data = COALESCE(?, signature_data), completed_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).run(remarks || null, photoPath, signatureBase64 || null, req.params.id);

    const row = db.prepare('SELECT * FROM employee_visits WHERE id = ?').get(req.params.id);
    return sendOk(res, mapRow(row));
  } catch (err) {
    return next(err);
  }
}

module.exports = { createVisitHandler, listTodayVisitsHandler, checkInVisitHandler, completeVisitHandler };
