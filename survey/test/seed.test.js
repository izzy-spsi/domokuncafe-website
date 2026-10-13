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
  const published = await query(
    `SELECT v.id, v.schema
     FROM surveys s JOIN survey_versions v ON v.id = s.current_version_id
     WHERE s.slug = 'guest-visit'`
  );
  const location = published.rows[0].schema.questions.find((question) => question.id === 'q_live');
  assert.equal(published.rows[0].id, '22222222-2222-4222-8222-222222222222');
  assert.equal(location.options, undefined);
  assert.equal(published.rows[0].schema.questions.some((question) => question.help), false);
  await closePool();
});

test('seed publishes a new test survey version when the stored one still asks for a country radio', async () => {
  await query(`TRUNCATE TABLE
    response_subscriber_links, consent_events, subscribers,
    analytics_events, audit_events, operation_log, reward_events, redemptions, rewards,
    survey_responses, survey_attempts, campaigns, capacity_ledger,
    promotion_versions, promotions, survey_versions, surveys,
    staff_sessions, staff_users
    RESTART IDENTITY CASCADE`);
  await query(
    `INSERT INTO surveys (id, slug, status, allow_no_reward)
     VALUES ('11111111-1111-4111-8111-111111111111', 'guest-visit', 'published', false)`
  );
  await query(
    `INSERT INTO survey_versions (id, survey_id, version_number, state, title, intro, schema, published_at)
     VALUES ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 1, 'published', 'Old', 'Old intro', $1::jsonb, now())`,
    [JSON.stringify({
      steps: [{ id: 'step_visit', title: 'About your visit', questionIds: ['q_live'] }],
      questions: [{
        id: 'q_live', type: 'location', label: 'Where do you live?', help: 'Answer about yourself.',
        options: [{ id: 'us', label: 'United States' }, { id: 'prefer_not', label: 'Prefer not to say' }]
      }]
    })]
  );
  await query(
    `UPDATE surveys SET current_version_id = '22222222-2222-4222-8222-222222222222'
     WHERE id = '11111111-1111-4111-8111-111111111111'`
  );
  await seed();
  const current = await query(
    `SELECT v.id, v.schema, v.version_number
     FROM surveys s JOIN survey_versions v ON v.id = s.current_version_id
     WHERE s.id = '11111111-1111-4111-8111-111111111111'`
  );
  assert.equal(current.rows[0].id, '22222222-2222-4222-8222-222222222223');
  assert.equal(current.rows[0].version_number, 2);
  const location = current.rows[0].schema.questions.find((question) => question.id === 'q_live');
  assert.equal(location.options, undefined);
  const kept = await query(`SELECT schema->'questions'->0->>'help' AS help FROM survey_versions WHERE id = '22222222-2222-4222-8222-222222222222'`);
  assert.equal(kept.rows[0].help, 'Answer about yourself.');
  await closePool();
});
