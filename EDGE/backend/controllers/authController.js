const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');
const { getDb } = require('../config/database');
const { sendOk, createHttpError } = require('../utils/http');
const { getJwtSecret } = require('../config/secrets');

function verifyPassword(input, stored) {
  const [salt, hash] = stored.split(':');
  const derived = crypto.scryptSync(input, salt, 64);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), derived);
}

function loginHandler(req, res, next) {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) throw createHttpError(400, 'Email and password required');

    const db = getDb();
    const user = db
      .prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE')
      .get(String(email).trim());

    if (!user || !verifyPassword(String(password), user.password_hash)) {
      throw createHttpError(401, 'Invalid email or password');
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      getJwtSecret(),
      { expiresIn: '24h' },
    );

    return sendOk(res, { token, user: { id: user.id, email: user.email, role: user.role } });
  } catch (err) {
    return next(err);
  }
}

// Accepts empId as the employee's internal id (legacy/desktop callers), OR — since
// a mobile employee only ever knows their Employee ID or email, never the internal
// id — as an emp_code or email, matched the same way apkController's login does.
function forgotPasswordHandler(req, res, next) {
  try {
    const { empId, companyId } = req.body || {};
    if (!empId) throw createHttpError(400, 'empId is required');

    const identifier = String(empId).trim();
    const db = getDb();
    const employee = db
      .prepare(
        `SELECT * FROM employees
         WHERE id = ? COLLATE NOCASE OR emp_code = ? COLLATE NOCASE OR email = ? COLLATE NOCASE`,
      )
      .get(identifier, identifier, identifier);
    if (!employee) throw createHttpError(404, 'Employee not found');

    const id = randomUUID();
    db.prepare(
      `INSERT INTO password_reset_requests (id, emp_id, status, requested_at)
       VALUES (?, ?, 'pending', CURRENT_TIMESTAMP)`,
    ).run(id, employee.id);

    return sendOk(res, {
      requestId: id,
      message: 'Password reset request sent to admin. You will receive a temporary password.',
    });
  } catch (err) {
    return next(err);
  }
}

function listResetRequestsHandler(_req, res) {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT r.*, e.name AS emp_name, e.phone AS emp_phone
       FROM password_reset_requests r
       JOIN employees e ON e.id = r.emp_id
       WHERE r.status = 'pending'
       ORDER BY r.requested_at DESC`,
    )
    .all();
  sendOk(res, rows, { count: rows.length });
}

function approveResetRequestHandler(req, res, next) {
  try {
    const db = getDb();
    const request = db
      .prepare("SELECT * FROM password_reset_requests WHERE id = ? AND status = 'pending'")
      .get(req.params.id);
    if (!request) throw createHttpError(404, 'Reset request not found or already processed');

    const tempPassword = `TMP#${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(tempPassword, salt, 64).toString('hex');
    const tempHash = `${salt}:${hash}`;

    db.prepare(
      `UPDATE password_reset_requests
       SET status = 'approved', temp_password_hash = ?, approved_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).run(tempHash, request.id);

    const user = db.prepare('SELECT * FROM users WHERE email IN (SELECT email FROM employees WHERE id = ?)').get(request.emp_id);
    if (user) {
      db.prepare(
        `UPDATE users SET temp_password_hash = ?, password_must_change = 1, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      ).run(tempHash, user.id);
    }

    return sendOk(res, {
      tempPassword,
      empId: request.emp_id,
      message: 'Temporary password set. Share this with the employee via SMS.',
    });
  } catch (err) {
    return next(err);
  }
}

function changePasswordHandler(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      throw createHttpError(400, 'currentPassword and newPassword are required');
    }
    if (String(newPassword).length < 6) {
      throw createHttpError(400, 'New password must be at least 6 characters');
    }

    const db = getDb();
    const userEmail = req.user?.email;
    if (!userEmail) throw createHttpError(401, 'Not authenticated');

    const user = db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE').get(userEmail);
    if (!user) throw createHttpError(404, 'User not found');

    const hashToCheck = user.temp_password_hash || user.password_hash;
    if (!verifyPassword(String(currentPassword), hashToCheck)) {
      throw createHttpError(401, 'Current password is incorrect');
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const newHash = `${salt}:${crypto.scryptSync(newPassword, salt, 64).toString('hex')}`;

    db.prepare(
      `UPDATE users
       SET password_hash = ?, temp_password_hash = NULL, password_must_change = 0, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).run(newHash, user.id);

    if (user.temp_password_hash) {
      db.prepare(
        `UPDATE password_reset_requests SET status = 'used', used_at = CURRENT_TIMESTAMP
         WHERE emp_id IN (SELECT id FROM employees WHERE email = ?) AND status = 'approved'`,
      ).run(userEmail);
    }

    return sendOk(res, { message: 'Password changed successfully' });
  } catch (err) {
    return next(err);
  }
}

// GET /auth/status — public; tells the frontend whether first-admin setup is needed
function statusHandler(_req, res, next) {
  try {
    const db = getDb();
    const count = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
    return sendOk(res, { setupRequired: count === 0 });
  } catch (err) {
    return next(err);
  }
}

// POST /auth/setup — public; one-time first-admin creation
function setupHandler(req, res, next) {
  try {
    const { email, password } = req.body || {};

    // Basic validation
    if (!email || !password) {
      throw createHttpError(400, 'email and password are required');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) {
      throw createHttpError(400, 'Invalid email format');
    }
    if (String(password).length < 8) {
      throw createHttpError(400, 'Password must be at least 8 characters');
    }

    const db = getDb();

    // Race-safe: count + insert in one transaction
    const result = db.transaction(() => {
      const count = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
      if (count > 0) return null; // setup already done

      const salt = crypto.randomBytes(16).toString('hex');
      const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
      const passwordHash = `${salt}:${hash}`;
      const id = randomUUID();

      db.prepare(
        'INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, ?, ?)',
      ).run(id, String(email).trim().toLowerCase(), passwordHash, 'admin');

      return { id, email: String(email).trim().toLowerCase(), role: 'admin' };
    })();

    if (!result) {
      throw createHttpError(409, 'Admin account already exists. Please sign in instead.');
    }

    const token = jwt.sign(
      { userId: result.id, email: result.email, role: result.role },
      getJwtSecret(),
      { expiresIn: '24h' },
    );

    return sendOk(res, { token, user: { id: result.id, email: result.email, role: result.role } });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  loginHandler,
  forgotPasswordHandler,
  listResetRequestsHandler,
  approveResetRequestHandler,
  changePasswordHandler,
  statusHandler,
  setupHandler,
};
