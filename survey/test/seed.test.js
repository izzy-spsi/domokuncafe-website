process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://survey:survey@127.0.0.1:5432/domo_survey_test';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { query, closePool } = require('../db');
const { seed } = require('../seed');

test('seed loads only test promotions and can run twice', async () => {
  await query(`TRUNCATE TABLE
    response_subscriber_links, consent_events, subscribers,
    analytics_events, audit_events, operation_log, reward_events, redemptions, rewards,
    survey_responses, survey_attempts, campaigns, capacity_ledger,
    promotion_versions, promotions, survey_versions, surveys,
    staff_sessions, staff_users
    RESTART IDENTITY CASCADE`);
  delete process.env.SURVEY_SEED_PASSWORD;
  await seed();
  await seed();
  const rows = await query('SELECT slug, test_data, is_default, current_version_id FROM promotions ORDER BY slug');
  assert.deepEqual(rows.rows.map((row) => row.slug), ['test-dessert', 'test-ended', 'test-paused-bogo', 'test-pin', 'test-welcome-10']);
  assert.ok(rows.rows.every((row) => row.test_data === true && row.current_version_id));
  const defaults = rows.rows.filter((row) => row.is_default);
  assert.equal(defaults.length, 1);
  assert.equal(defaults[0].slug, 'test-welcome-10');
  const live = await query('SELECT count(*)::int AS count FROM promotions WHERE test_data = false');
  assert.equal(live.rows[0].count, 0);
  await closePool();
});
