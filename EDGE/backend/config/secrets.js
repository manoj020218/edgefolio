const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { STORAGE_DIR } = require('./app');

const PLACEHOLDER = 'change-me-in-production';
const SECRET_FILE = path.join(STORAGE_DIR, 'jwt-secret.key');

let _cachedSecret = null;

function getJwtSecret() {
  if (_cachedSecret) return _cachedSecret;

  // 1. Prefer a real env variable (min 32 chars, not the placeholder)
  const envSecret = process.env.JWT_SECRET;
  if (envSecret && envSecret.length >= 32 && envSecret !== PLACEHOLDER) {
    _cachedSecret = envSecret;
    return _cachedSecret;
  }

  // 2. Read from persisted file
  try {
    const stored = fs.readFileSync(SECRET_FILE, 'utf8').trim();
    if (stored && stored.length >= 32) {
      _cachedSecret = stored;
      return _cachedSecret;
    }
  } catch {
    // File does not exist yet — fall through to generate
  }

  // 3. Generate a new random secret, persist it
  const generated = crypto.randomBytes(48).toString('hex');
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
  fs.writeFileSync(SECRET_FILE, generated, { mode: 0o600, encoding: 'utf8' });
  _cachedSecret = generated;
  return _cachedSecret;
}

module.exports = { getJwtSecret };
