const { query } = require('./db');
const { migrate } = require('./migrate');
const { hashPassword } = require('./passwords');

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? '' : process.argv[index + 1];
}

async function main() {
  const email = String(arg('email') || '').trim().toLowerCase();
  const name = arg('name');
  const role = arg('role');
  const password = process.env.SURVEY_STAFF_PASSWORD || '';
  if (!email || !name || !['staff', 'manager', 'admin'].includes(role) || password.length < 8) {
    console.error('Usage: SURVEY_STAFF_PASSWORD="…" node survey/create-staff.js --email you@domokuncafe.com --name "Name" --role admin');
    console.error('Roles: staff, manager, admin. The password is read from SURVEY_STAFF_PASSWORD and is not stored in the repo.');
    process.exit(1);
  }
  await migrate();
  const passwordHash = await hashPassword(password);
  const existing = await query('SELECT id FROM staff_users WHERE email = $1', [email]);
  if (existing.rowCount) {
    await query('UPDATE staff_users SET name = $2, role = $3, password_hash = $4, active = true WHERE email = $1', [email, name, role, passwordHash]);
    console.log(`Updated ${role} login for ${email}.`);
  } else {
    await query('INSERT INTO staff_users (email, name, password_hash, role) VALUES ($1,$2,$3,$4)', [email, name, passwordHash, role]);
    console.log(`Created ${role} login for ${email}.`);
  }
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
