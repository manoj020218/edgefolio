'use strict';
// "salt:hash" scrypt — identical to EDGE (authController.hashSecret / apkController.verifyPassword),
// so password hashes can move between EDGE and the cloud during employee sync.
const crypto = require('crypto');

function hashSecret(value) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(String(value), salt, 64).toString('hex')}`;
}

function verifySecret(input, stored) {
  if (!stored || !String(stored).includes(':')) return false;
  const [salt, hash] = String(stored).split(':');
  const derived = crypto.scryptSync(String(input), salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return expected.length === derived.length && crypto.timingSafeEqual(expected, derived);
}

module.exports = { hashSecret, verifySecret };
