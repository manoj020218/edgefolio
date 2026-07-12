const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../config/secrets');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ ok: false, error: 'Authentication required' });
  }

  try {
    req.user = jwt.verify(token, getJwtSecret());
    return next();
  } catch {
    return res.status(401).json({ ok: false, error: 'Invalid or expired session. Please sign in again.' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ ok: false, error: 'Insufficient permissions' });
    }
    return next();
  };
}

module.exports = { requireAuth, requireRole };
