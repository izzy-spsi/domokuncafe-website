const crypto = require('crypto');

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function randomChar() {
  const limit = 256 - (256 % ALPHABET.length);
  let value;
  do {
    value = crypto.randomBytes(1)[0];
  } while (value >= limit);
  return ALPHABET[value % ALPHABET.length];
}

function rewardCode() {
  let raw = '';
  for (let i = 0; i < 8; i += 1) raw += randomChar();
  return `DM-${raw.slice(0, 4)}-${raw.slice(4)}`;
}

function normalizeCode(input) {
  return String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function formatCode(normalized) {
  if (normalized.startsWith('DM') && normalized.length === 10) {
    return `DM-${normalized.slice(2, 6)}-${normalized.slice(6)}`;
  }
  return normalized;
}

module.exports = { sha256, randomToken, rewardCode, normalizeCode, formatCode };
