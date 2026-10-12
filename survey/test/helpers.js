process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://survey:survey@127.0.0.1:5432/domo_survey_test';
process.env.NODE_ENV = 'test';
process.env.SURVEY_RATE_SUBMIT = '10000';
process.env.SURVEY_RATE_ATTEMPT = '10000';
process.env.SURVEY_RATE_LOGIN = '10000';
process.env.SURVEY_RATE_CONTEXT = '10000';
process.env.SURVEY_RATE_REWARD = '10000';
process.env.SURVEY_RATE_SIGNUP = '10000';
process.env.SURVEY_RATE_EVENTS = '10000';
process.env.SURVEY_RATE_UNSUBSCRIBE = '10000';

const crypto = require('crypto');
const { query, closePool } = require('../db');
const { migrate } = require('../migrate');
const { defaultSurvey } = require('../data/default-survey');
const { hashPassword } = require('../passwords');
const { createApp } = require('../../server');

let passwordHash;

function answers(overrides = {}) {
  return Object.assign({
    q_live: { choice: 'prefer_not' },
    q_party: 3,
    q_first: { optionId: 'first_time' },
    q_discovery: { optionId: 'tiktok' },
    q_familiar: { optionId: 'fan' },
    q_visit: { optionId: 'main_destination' },
    q_outing: { optionIds: ['knotts'] },
    q_excited: { optionIds: ['food'] }
  }, overrides);
}

async function reset() {
  await query(`TRUNCATE TABLE
    response_subscriber_links, consent_events, subscribers,
    analytics_events, audit_events, operation_log, reward_events, redemptions, rewards,
    survey_responses, survey_attempts, campaigns, capacity_ledger,
    promotion_versions, promotions, survey_versions, surveys,
    staff_sessions, staff_users, zip_reference
    RESTART IDENTITY CASCADE`);
  await query(`INSERT INTO zip_reference (zip, city, region, state) VALUES
    ('90620', 'Buena Park', 'Orange County', 'CA'),
    ('02108', 'Boston', 'Suffolk County', 'MA')`);
}

async function makeSurvey() {
  const id = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  await query(`INSERT INTO surveys (id, slug, status) VALUES ($1, $2, 'published')`, [id, `guest-${id.slice(0, 8)}`]);
  await query(
    `INSERT INTO survey_versions (id, survey_id, version_number, state, title, intro, schema, published_at)
     VALUES ($1,$2,1,'published',$3,$4,$5, now())`,
    [versionId, id, defaultSurvey.title, defaultSurvey.intro, defaultSurvey.schema]
  );
  await query('UPDATE surveys SET current_version_id = $2 WHERE id = $1', [id, versionId]);
  return { id, versionId };
}

async function makePromo(opts = {}) {
  const id = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  await query(
    `INSERT INTO promotions (id, slug, lifecycle, is_default, test_data) VALUES ($1,$2,$3,$4,$5)`,
    [id, opts.slug || `promo-${id.slice(0, 8)}`, opts.lifecycle || 'active', Boolean(opts.isDefault), Boolean(opts.testData)]
  );
  await query(
    `INSERT INTO promotion_versions (
      id, promotion_id, version_number, state, name, description, reward_type, reward_details, eligibility,
      guest_terms, staff_instructions, starts_at, ends_at, expiry_rule, total_cap, daily_cap, physical_supply,
      redemption_rules, test_data, published_at
    ) VALUES ($1,$2,1,'published',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17, now())`,
    [
      versionId, id, opts.name || 'Test offer', opts.description || 'A rehearsal offer.',
      opts.rewardType || 'percent_off',
      opts.rewardDetails || { percent: 10, quantity: 1, eligibleItems: 'TEST check' },
      { dineIn: true, minimumCents: null, excludedCategories: [], stacking: 'none' },
      opts.guestTerms || 'Ten percent off a dine-in check during this rehearsal. One per party per visit.',
      opts.staffInstructions || 'SECRET-STAFF-NOTE Apply nothing in Toast.',
      opts.starts || new Date('2026-01-01T08:00:00Z'),
      opts.ends || new Date('2027-06-01T07:00:00Z'),
      opts.expiryRule || { type: 'duration', hours: 24, minutes: 0 },
      opts.totalCap === undefined ? null : opts.totalCap,
      opts.dailyCap === undefined ? null : opts.dailyCap,
      opts.physicalSupply === undefined ? null : opts.physicalSupply,
      { onePerPartyPerVisit: true, stacking: 'none' },
      Boolean(opts.testData)
    ]
  );
  await query('UPDATE promotions SET current_version_id = $2 WHERE id = $1', [id, versionId]);
  await query(
    `INSERT INTO capacity_ledger (promotion_id, total_cap, daily_cap, physical_supply) VALUES ($1,$2,$3,$4)`,
    [id, opts.totalCap === undefined ? null : opts.totalCap, opts.dailyCap === undefined ? null : opts.dailyCap, opts.physicalSupply === undefined ? null : opts.physicalSupply]
  );
  return { id, versionId };
}

async function makeCampaign(promo, surveyVersionId, slug, extra = {}) {
  const id = crypto.randomUUID();
  await query(
    `INSERT INTO campaigns (id, slug, name, promotion_id, promotion_version_id, survey_version_id, channel, placement, test_data)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [id, slug, extra.name || slug, promo.id, promo.versionId, surveyVersionId, extra.channel || 'instagram', extra.placement || 'instagram_bio', Boolean(extra.testData)]
  );
  return { id, slug };
}

async function makeUser(role) {
  if (!passwordHash) passwordHash = await hashPassword('rehearsal-password-1');
  const email = `${role}.${crypto.randomUUID()}@example.test`;
  const row = await query(
    `INSERT INTO staff_users (email, name, password_hash, role) VALUES ($1,$2,$3,$4) RETURNING id`,
    [email, role, passwordHash, role]
  );
  return { id: row.rows[0].id, email, password: 'rehearsal-password-1', role };
}

async function startServer() {
  await migrate();
  const app = createApp();
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  const { port } = server.address();
  return { server, base: `http://127.0.0.1:${port}` };
}

async function stopServer(server) {
  if (server) await new Promise((resolve) => server.close(resolve));
  await closePool();
}

async function http(base, path, options = {}) {
  const response = await fetch(base + path, {
    method: options.method || 'GET',
    headers: Object.assign(
      { 'Content-Type': 'application/json' },
      options.cookie ? { cookie: options.cookie } : {}
    ),
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = { raw: text }; }
  return { status: response.status, data, text };
}

async function login(base, user) {
  const response = await fetch(base + '/api/staff/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: user.email, password: user.password })
  });
  const set = response.headers.getSetCookie ? response.headers.getSetCookie() : [response.headers.get('set-cookie')];
  const cookie = set.filter(Boolean).map((item) => item.split(';')[0]).join('; ');
  return { cookie, status: response.status, data: await response.json() };
}

async function submitGuest(base, { campaign, body, key, decision, acceptedVersionId } = {}) {
  const attempt = await http(base, '/api/survey-attempts', {
    method: 'POST',
    body: { campaignSlug: campaign || null }
  });
  const submitted = await http(base, '/api/survey-responses', {
    method: 'POST',
    body: Object.assign({
      attemptId: attempt.data && attempt.data.attemptId,
      idempotencyKey: key || crypto.randomUUID(),
      answers: body || answers()
    }, decision ? { decision, acceptedVersionId } : {})
  });
  return { attempt, submitted };
}

module.exports = {
  answers, reset, makeSurvey, makePromo, makeCampaign, makeUser, startServer, stopServer, http, login, submitGuest, query
};
