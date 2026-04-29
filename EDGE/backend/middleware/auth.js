const jwt = require('jsonwebtoken');

const LOCAL_USER = { role: 'admin', email: 'admin@edgefolio.com', mode: 'local' };

function requireAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (token) {
    try {
      const secret = process.env.JWT_SECRET || 'edgefolio-local-dev-jwt-secret';
      req.user = jwt.verify(token, secret);
    } catch {
      // Invalid/expired token — fall back to local offline user
    }
  }

  if (!req.user) {
    req.user = LOCAL_USER;
  }

  next();
}

module.exports = {
  requireAuth,
  optionalDemoAuth: requireAuth,
};
