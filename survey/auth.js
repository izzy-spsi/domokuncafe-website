const { query, withTransaction } = require('./db');
const { HttpError } = require('./errors');
const { sha256, randomToken } = require('./codes');
const { verifyPassword } = require('./passwords');

const COOKIE = 'domo_survey_session';

function cookieOptions() {
  const secure = process.env.SURVEY_COOKIE_SECURE === '1' || Boolean(process.env.RAILWAY_ENVIRONMENT);
  return { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: 12 * 60 * 60 * 1000 };
}

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  const parts = header.split(';');
  for (const part of parts) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return '';
}

async function login(email, password) {
  const result = await query('SELECT * FROM staff_users WHERE email = $1', [String(email || '').trim().toLowerCase()]);
  const user = result.rows[0];
  if (!user || !user.active) throw new HttpError(401, 'unauthorized', 'Those sign-in details were not accepted.');
  const match = await verifyPassword(password || '', user.password_hash);
  if (!match) throw new HttpError(401, 'unauthorized', 'Those sign-in details were not accepted.');
  const token = randomToken();
  const expires = new Date(Date.now() + 12 * 60 * 60 * 1000);
  await query('INSERT INTO staff_sessions (staff_id, token_hash, expires_at) VALUES ($1,$2,$3)', [user.id, sha256(token), expires]);
  return { token, user: publicUser(user) };
}

async function logout(req) {
  const raw = readCookie(req, COOKIE);
  if (!raw) return;
  await query('DELETE FROM staff_sessions WHERE token_hash = $1', [sha256(raw)]);
}

async function currentUser(req) {
  const raw = readCookie(req, COOKIE);
  if (!raw) return null;
  const result = await query(
    `SELECT u.* FROM staff_sessions s JOIN staff_users u ON u.id = s.staff_id
     WHERE s.token_hash = $1 AND s.expires_at > now() AND u.active = true`,
    [sha256(raw)]
  );
  return result.rows[0] ? publicUser(result.rows[0]) : null;
}

function publicUser(user) {
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

function requireRole(...roles) {
  return async function guard(req, res, next) {
    try {
      const user = await currentUser(req);
      if (!user) return res.status(401).json({ error: 'unauthorized', message: 'Sign in required.' });
      if (!roles.includes(user.role)) return res.status(403).json({ error: 'forbidden', message: 'You do not have access to that.' });
      req.staff = user;
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

function assertSameOrigin(req) {
  const origin = req.get('origin');
  if (!origin) return;
  let host;
  try { host = new URL(origin).host; } catch (_) { host = ''; }
  if (host !== req.get('host')) throw new HttpError(403, 'forbidden', 'The request origin was rejected.');
}

module.exports = { COOKIE, cookieOptions, login, logout, currentUser, requireRole, assertSameOrigin, publicUser };
