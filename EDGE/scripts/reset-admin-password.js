'use strict';
// Fallback recovery tool — for use during a support session when a client
// has lost BOTH their password and their recovery code (the normal
// self-service path is the "Forgot password?" link on the login screen,
// which only needs the recovery code shown once at setup).
//
// Must run under the client's own installed EDGEFOLIO.exe with
// ELECTRON_RUN_AS_NODE=1 — that's what guarantees the bundled better-sqlite3
// native module matches the exact Electron ABI it was built against; a
// separately-distributed Node build would almost certainly mismatch and
// fail to load the database at all. RESET-ADMIN-PASSWORD.bat (same folder)
// wraps this for a non-technical user to double-click.
//
// Usage (support runs this over a remote/screen-share session with the
// client, or talks them through double-clicking the .bat):
//   RESET-ADMIN-PASSWORD.bat
//   (prompts for the admin's email, generates a new random password, prints it)
//
// Or directly:
//   set ELECTRON_RUN_AS_NODE=1
//   "C:\Program Files\EDGEFOLIO\EDGEFOLIO.exe" "C:\Program Files\EDGEFOLIO\resources\recovery\reset-admin-password.js" --email admin@company.com

const path = require('path');
const crypto = require('crypto');

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
      out[key] = val;
    }
  }
  return out;
}

function hashSecret(value) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(value, salt, 64).toString('hex')}`;
}

function generatePassword() {
  return `Reset#${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.email) {
    console.error('Usage: reset-admin-password.js --email <admin-email> [--storage-path <path>]');
    process.exit(1);
  }

  // Electron's default userData path for this app (package.json "name":
  // "edgefolio") — matches what electron/main.js resolves via
  // app.getPath('userData') at runtime, reproduced here manually since this
  // script runs under ELECTRON_RUN_AS_NODE, which disables the `app` module.
  const storagePath = args['storage-path']
    || path.join(process.env.APPDATA || '', 'edgefolio', 'storage');
  const dbPath = path.join(storagePath, 'database', 'edgefolio.db');

  console.log('Using database:', dbPath);

  let Database;
  try {
    Database = require('better-sqlite3');
  } catch (e) {
    console.error('Could not load better-sqlite3 — this script must be run via');
    console.error('EDGEFOLIO.exe with ELECTRON_RUN_AS_NODE=1, not plain Node.');
    console.error(e.message);
    process.exit(1);
  }

  const db = new Database(dbPath, { fileMustExist: true });
  db.pragma('journal_mode = WAL');

  const user = db.prepare('SELECT id, email, role FROM users WHERE email = ? COLLATE NOCASE').get(String(args.email).trim());
  if (!user) {
    const all = db.prepare('SELECT email, role FROM users').all();
    console.error(`No user found with email "${args.email}".`);
    console.error('Accounts on this install:', all.map((u) => `${u.email} (${u.role})`).join(', ') || '(none)');
    db.close();
    process.exit(1);
  }

  const newPassword = typeof args.password === 'string' ? args.password : generatePassword();
  if (newPassword.length < 8) {
    console.error('Password must be at least 8 characters.');
    db.close();
    process.exit(1);
  }

  db.prepare(
    `UPDATE users SET password_hash = ?, temp_password_hash = NULL, password_must_change = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
  ).run(hashSecret(newPassword), user.id);

  db.close();

  console.log('');
  console.log('=================================================');
  console.log(`Password reset for: ${user.email}`);
  console.log(`New password:       ${newPassword}`);
  console.log('=================================================');
  console.log('Share this with the client and have them sign in, then');
  console.log('change it to something they choose from within the app.');
}

main();
