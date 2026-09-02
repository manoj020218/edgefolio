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
    source: row.source,
    category: row.category,
    title: row.title,
    createdAt: row.created_at,
  };
}

// GET /documents — own documents + company-wide ones (employee_id IS NULL)
function listDocumentsHandler(req, res, next) {
  try {
    const empId = requireEmpId(req);
    const rows = getDb()
      .prepare(
        `SELECT * FROM employee_documents
         WHERE employee_id = ? OR employee_id IS NULL
         ORDER BY source ASC, created_at DESC`,
      )
      .all(empId);
    return sendOk(res, rows.map(mapRow));
  } catch (err) {
    return next(err);
  }
}

// POST /documents — self-upload only. body: { category, title, fileBase64 }
// Company-wide docs (policies, appointment letters) are HR-side work — not built yet.
function uploadDocumentHandler(req, res, next) {
  try {
    const empId = requireEmpId(req);
    const { category, title, fileBase64 } = req.body || {};
    if (!title || !String(title).trim()) throw createHttpError(400, 'title is required');
    if (!fileBase64) throw createHttpError(400, 'fileBase64 is required');

    const id = randomUUID();
    const dir = path.join(UPLOADS_DIR, 'documents', empId);
    fs.mkdirSync(dir, { recursive: true });
    const match = /^data:(.+);base64,/.exec(fileBase64);
    const ext = match?.[1]?.split('/')[1]?.split('+')[0] || 'bin';
    const fileName = `${id}.${ext}`;
    const buffer = Buffer.from(fileBase64.replace(/^data:.+;base64,/, ''), 'base64');
    fs.writeFileSync(path.join(dir, fileName), buffer);

    const db = getDb();
    db.prepare(
      `INSERT INTO employee_documents (id, employee_id, source, category, title, file_path, uploaded_by)
       VALUES (?, ?, 'self', ?, ?, ?, ?)`,
    ).run(id, empId, category || 'personal', String(title).trim(), path.join('documents', empId, fileName), empId);

    const row = db.prepare('SELECT * FROM employee_documents WHERE id = ?').get(id);
    return sendOk(res, mapRow(row));
  } catch (err) {
    return next(err);
  }
}

module.exports = { listDocumentsHandler, uploadDocumentHandler };
