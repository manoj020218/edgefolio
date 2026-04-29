const crypto = require('crypto');

function getKey(secret = 'edgefolio-local-dev-key') {
  return crypto.createHash('sha256').update(secret).digest();
}

function encrypt(text, secret) {
  const iv = crypto.randomBytes(16);
  const key = getKey(secret);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

function decrypt(payload, secret) {
  const [ivHex, encryptedHex] = String(payload).split(':');
  if (!ivHex || !encryptedHex) return '';
  const iv = Buffer.from(ivHex, 'hex');
  const key = getKey(secret);
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

module.exports = {
  encrypt,
  decrypt,
};
