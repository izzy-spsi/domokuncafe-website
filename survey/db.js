const { Pool } = require('pg');

let pool;

function getPool() {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.SURVEY_PG_POOL_MAX || 10),
      idleTimeoutMillis: 30000
    });
    pool.on('error', (err) => {
      console.error('Survey database pool error:', err.message);
    });
  }
  return pool;
}

async function query(text, params) {
  const active = getPool();
  if (!active) {
    const error = new Error('DATABASE_URL is not configured');
    error.code = 'no_database';
    throw error;
  }
  return active.query(text, params);
}

async function withTransaction(fn) {
  const active = getPool();
  if (!active) {
    const error = new Error('DATABASE_URL is not configured');
    error.code = 'no_database';
    throw error;
  }
  const client = await active.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) { /* connection already failed */ }
    throw error;
  } finally {
    client.release();
  }
}

async function closePool() {
  if (pool) {
    const current = pool;
    pool = null;
    await current.end();
  }
}

module.exports = { getPool, query, withTransaction, closePool };
