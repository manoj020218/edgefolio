const fs = require('fs');
const path = require('path');
const { getDb } = require('../config/database');
const { FACES_DIR } = require('../config/app');
const { sendOk, createHttpError } = require('../utils/http');

const VALID_ANGLES = ['front', 'right', 'left'];

function ensureFaceDir(empId) {
  const dir = path.join(FACES_DIR, empId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function computeEnrollmentStatus(row) {
  if (!row) return 'pending';
  const done = [row.angle_front, row.angle_right, row.angle_left].filter(Boolean).length;
  if (done === 3) return 'complete';
  if (done > 0) return 'partial';
  return 'pending';
}

function getFaceStatusHandler(req, res, next) {
  const db = getDb();
  const emp = db.prepare('SELECT id FROM employees WHERE id = ?').get(req.params.id);
  if (!emp) return next(createHttpError(404, 'Employee not found'));

  const row = db.prepare('SELECT * FROM face_enrollments WHERE emp_id = ?').get(req.params.id);
  const status = computeEnrollmentStatus(row);

  return sendOk(res, {
    empId: req.params.id,
    angleFront: Boolean(row?.angle_front),
    angleRight: Boolean(row?.angle_right),
    angleLeft: Boolean(row?.angle_left),
    status,
    enrolledBy: row?.enrolled_by || null,
    updatedAt: row?.updated_at || null,
  });
}

function enrollFaceHandler(req, res, next) {
  try {
    const { angle, imageBase64 } = req.body || {};

    if (!VALID_ANGLES.includes(angle)) {
      throw createHttpError(400, `angle must be one of: ${VALID_ANGLES.join(', ')}`);
    }
    if (!imageBase64) throw createHttpError(400, 'imageBase64 is required');

    const db = getDb();
    const emp = db.prepare('SELECT id FROM employees WHERE id = ?').get(req.params.id);
    if (!emp) throw createHttpError(404, 'Employee not found');

    // Strip data URI prefix if present
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    if (buffer.length < 1000) throw createHttpError(400, 'Image too small — invalid photo');
    if (buffer.length > 5 * 1024 * 1024) throw createHttpError(400, 'Image too large (max 5MB)');

    const dir = ensureFaceDir(req.params.id);
    const filePath = path.join(dir, `${angle}.jpg`);
    fs.writeFileSync(filePath, buffer);

    const angleCol = `angle_${angle}`;
    const existing = db.prepare('SELECT * FROM face_enrollments WHERE emp_id = ?').get(req.params.id);
    const enrolledBy = req.user?.email || 'admin';

    if (!existing) {
      db.prepare(
        `INSERT INTO face_enrollments (emp_id, ${angleCol}, enrolled_by, status, updated_at)
         VALUES (?, 1, ?, 'partial', CURRENT_TIMESTAMP)`,
      ).run(req.params.id, enrolledBy);
    } else {
      db.prepare(
        `UPDATE face_enrollments
         SET ${angleCol} = 1, enrolled_by = ?, status = ?, updated_at = CURRENT_TIMESTAMP
         WHERE emp_id = ?`,
      ).run(
        enrolledBy,
        computeEnrollmentStatus({ ...existing, [angleCol]: 1 }),
        req.params.id,
      );
    }

    const updated = db.prepare('SELECT * FROM face_enrollments WHERE emp_id = ?').get(req.params.id);

    return sendOk(res, {
      empId: req.params.id,
      angle,
      saved: true,
      status: computeEnrollmentStatus(updated),
      angleFront: Boolean(updated?.angle_front),
      angleRight: Boolean(updated?.angle_right),
      angleLeft: Boolean(updated?.angle_left),
    });
  } catch (err) {
    return next(err);
  }
}

function deleteEnrollmentHandler(req, res, next) {
  try {
    const db = getDb();
    const emp = db.prepare('SELECT id FROM employees WHERE id = ?').get(req.params.id);
    if (!emp) return next(createHttpError(404, 'Employee not found'));

    db.prepare('DELETE FROM face_enrollments WHERE emp_id = ?').run(req.params.id);

    const faceDir = path.join(FACES_DIR, req.params.id);
    if (fs.existsSync(faceDir)) {
      fs.rmSync(faceDir, { recursive: true, force: true });
    }

    return sendOk(res, { empId: req.params.id, deleted: true });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getFaceStatusHandler,
  enrollFaceHandler,
  deleteEnrollmentHandler,
};
