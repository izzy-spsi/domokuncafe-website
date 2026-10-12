const fs = require('fs');
const path = require('path');
const { getPool } = require('./db');

async function migrate() {
  const pool = getPool();
  if (!pool) {
    console.log('Survey migrate skipped: DATABASE_URL is not set.');
    return false;
  }
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const dir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(dir).filter((file) => file.endsWith('.sql')).sort();
  for (const file of files) {
    const seen = await pool.query('SELECT 1 FROM schema_migrations WHERE id = $1', [file]);
    if (seen.rowCount) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`Applied survey migration ${file}`);
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch (_) { /* already closed */ }
      throw error;
    } finally {
      client.release();
    }
  }
  return true;
}

if (require.main === module) {
  migrate().then(() => process.exit(0)).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { migrate };
