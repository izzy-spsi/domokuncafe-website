const crypto = require('crypto');

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 32, { N: 16384, r: 8, p: 1 }, (error, key) => {
      if (error) reject(error);
      else resolve(`scrypt$16384$8$1$${salt}$${key.toString('hex')}`);
    });
  });
}

function verifyPassword(password, stored) {
  return new Promise((resolve) => {
    const parts = String(stored || '').split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') {
      resolve(false);
      return;
    }
    const n = Number(parts[1]);
    const r = Number(parts[2]);
    const p = Number(parts[3]);
    const salt = parts[4];
    const expected = Buffer.from(parts[5], 'hex');
    crypto.scrypt(password, salt, expected.length, { N: n, r, p }, (error, key) => {
      if (error || key.length !== expected.length) {
        resolve(false);
        return;
      }
      resolve(crypto.timingSafeEqual(key, expected));
    });
  });
}

module.exports = { hashPassword, verifyPassword };
