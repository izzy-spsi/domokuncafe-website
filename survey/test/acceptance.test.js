const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { answers, reset, makeSurvey, makePromo, makeCampaign, makeUser, startServer, stopServer, http, login, submitGuest, query } = require('./helpers');
const { reserveCapacity } = require('../capacity');
const { withTransaction } = require('../db');

let server;
let base;
let staff;
let manager;
let admin;

test.before(async () => {
  const started = await startServer();
  server = started.server;
  base = started.base;
});

test.after(async () => {
  await stopServer(server);
});

test.beforeEach(async () => {
  await reset();
  await makeSurvey();
  staff = await makeUser('staff');
  manager = await makeUser('manager');
  admin = await makeUser('admin');
});

test('A01 A02 A03 A05 first-time, returning, location, and idempotent submit', async () => {
  await makePromo({ isDefault: true, name: 'Ten percent rehearsal' });
  const first = await submitGuest(base, { body: answers({ q_live: { choice: 'us', zip: '02108' }, q_first: { optionId: 'first_time' } }) });
  assert.equal(first.submitted.status, 200);
  assert.equal(first.submitted.data.reward.status, 'issued');
  assert.ok(first.submitted.data.signupToken);
  const row = await query('SELECT postal_code, first_visit, locality FROM survey_responses WHERE id = $1', [first.submitted.data.responseId]);
  assert.equal(row.rows[0].postal_code, '02108');
  assert.equal(row.rows[0].locality, 'Boston');
  assert.equal(row.rows[0].first_visit, 'first_time');

  const again = await http(base, '/api/survey-responses', {
    method: 'POST',
    body: {
      attemptId: first.attempt.data.attemptId,
      idempotencyKey: first.submitted.data && first.attempt.data.attemptId,
      answers: answers()
    }
  });
  const sameKey = await http(base, '/api/survey-responses', {
    method: 'POST',
    body: {
      attemptId: first.attempt.data.attemptId,
      idempotencyKey: JSON.parse(JSON.stringify(first.submitted.status)) && (await query('SELECT idempotency_key FROM survey_responses WHERE id = $1', [first.submitted.data.responseId])).rows[0].idempotency_key,
      answers: answers()
    }
  });
  assert.equal(sameKey.data.responseId, first.submitted.data.responseId);
  assert.equal(sameKey.data.reward.code, first.submitted.data.reward.code);
  const rewardCount = await query('SELECT count(*)::int AS count FROM rewards');
  assert.equal(rewardCount.rows[0].count, 1);
  assert.equal(again.status === 200 || again.status === 404 || again.status === 400 || again.status === 409, true);

  const returning = await submitGuest(base, { body: answers({ q_first: { optionId: 'returning' }, q_live: { choice: 'outside_us', city: 'Lyon', countryCode: 'FR' } }) });
  assert.equal(returning.submitted.status, 200);
  assert.equal(returning.submitted.data.reward.status, 'issued');
  const second = await query('SELECT first_visit, locality, country_code FROM survey_responses WHERE id = $1', [returning.submitted.data.responseId]);
  assert.equal(second.rows[0].first_visit, 'returning');
  assert.equal(second.rows[0].locality, 'Lyon');
  assert.equal(second.rows[0].country_code, 'FR');

  const skipped = await submitGuest(base, { body: answers({ q_live: { choice: 'skipped' } }) });
  assert.equal(skipped.submitted.status, 200);
  const unmapped = await submitGuest(base, { body: answers({ q_live: { choice: 'us', zip: '99950' } }) });
  assert.equal(unmapped.submitted.status, 200);
  const zipRow = await query('SELECT postal_code, location_unmapped FROM survey_responses WHERE id = $1', [unmapped.submitted.data.responseId]);
  assert.equal(zipRow.rows[0].postal_code, '99950');
  assert.equal(zipRow.rows[0].location_unmapped, true);
});

test('A04 invalid party size and multi-select rules do not save a response', async () => {
  await makePromo({ isDefault: true });
  const bad = await submitGuest(base, { body: answers({ q_party: 0, q_outing: { optionIds: ['knotts', 'no_other'] }, q_excited: { optionIds: ['food', 'drinks', 'desserts', 'merch'] } }) });
  assert.equal(bad.submitted.status, 400);
  assert.ok(bad.submitted.data.fields.q_party);
  const count = await query('SELECT count(*)::int AS count FROM survey_responses');
  assert.equal(count.rows[0].count, 0);
});

test('A05 parallel retry with one idempotency key issues one reward', async () => {
  await makePromo({ isDefault: true });
  const attempt = await http(base, '/api/survey-attempts', { method: 'POST', body: {} });
  const key = crypto.randomUUID();
  const body = { attemptId: attempt.data.attemptId, idempotencyKey: key, answers: answers() };
  const [a, b] = await Promise.all([
    http(base, '/api/survey-responses', { method: 'POST', body }),
    http(base, '/api/survey-responses', { method: 'POST', body })
  ]);
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.equal(a.data.responseId, b.data.responseId);
  assert.equal(a.data.reward.code, b.data.reward.code);
  const rewards = await query('SELECT count(*)::int AS count FROM rewards');
  assert.equal(rewards.rows[0].count, 1);
});

test('A06 two guests cannot both take the last capped unit', async () => {
  await makePromo({ isDefault: true, totalCap: 1, physicalSupply: 1 });
  const firstAttempt = await http(base, '/api/survey-attempts', { method: 'POST', body: {} });
  const secondAttempt = await http(base, '/api/survey-attempts', { method: 'POST', body: {} });
  const [a, b] = await Promise.all([
    http(base, '/api/survey-responses', { method: 'POST', body: { attemptId: firstAttempt.data.attemptId, idempotencyKey: crypto.randomUUID(), answers: answers() } }),
    http(base, '/api/survey-responses', { method: 'POST', body: { attemptId: secondAttempt.data.attemptId, idempotencyKey: crypto.randomUUID(), answers: answers({ q_party: 4 }) } })
  ]);
  const statuses = [a.status, b.status].sort();
  assert.deepEqual(statuses, [200, 409]);
  const winner = a.status === 200 ? a : b;
  const loser = a.status === 409 ? a : b;
  assert.equal(winner.data.reward.status, 'issued');
  assert.equal(loser.data.error, 'offer_changed');
  assert.equal(loser.data.canSubmitWithoutReward, true);
  const rewards = await query('SELECT count(*)::int AS count FROM rewards');
  const responses = await query('SELECT count(*)::int AS count FROM survey_responses');
  assert.equal(rewards.rows[0].count, 1);
  assert.equal(responses.rows[0].count, 1);
  const saved = await http(base, '/api/survey-responses', {
    method: 'POST',
    body: { attemptId: (a.status === 409 ? firstAttempt : secondAttempt).data.attemptId, idempotencyKey: crypto.randomUUID(), answers: answers(), decision: 'submit_without_reward' }
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.data.reward, null);
});

test('A07 A08 A19 A20 offer changes, pauses, defaults, and ended campaigns', async () => {
  const first = await makePromo({ isDefault: true, name: 'Original offer', slug: 'original' });
  const replacement = await makePromo({ name: 'Replacement offer', slug: 'replacement' });
  const campaign = await makeCampaign(first, (await query('SELECT current_version_id FROM surveys LIMIT 1')).rows[0].current_version_id, 'cafe-table');
  const context = await http(base, '/api/survey-context');
  assert.equal(context.data.offer.name, 'Original offer');
  const campaignContext = await http(base, '/api/survey-context?campaign=cafe-table');
  assert.equal(campaignContext.data.offer.versionId, first.versionId);

  const attempt = await http(base, '/api/survey-attempts', { method: 'POST', body: {} });
  await query(`UPDATE promotions SET lifecycle = 'ended' WHERE id = $1`, [first.id]);
  await query('UPDATE promotions SET is_default = false WHERE id = $1', [first.id]);
  await query('UPDATE promotions SET is_default = true WHERE id = $1', [replacement.id]);
  const changed = await http(base, '/api/survey-responses', {
    method: 'POST',
    body: { attemptId: attempt.data.attemptId, idempotencyKey: crypto.randomUUID(), answers: answers() }
  });
  assert.equal(changed.status, 409);
  assert.equal(changed.data.replacementOffer.name, 'Replacement offer');
  const count = await query('SELECT count(*)::int AS count FROM survey_responses');
  assert.equal(count.rows[0].count, 0);
  const accepted = await http(base, '/api/survey-responses', {
    method: 'POST',
    body: { attemptId: attempt.data.attemptId, idempotencyKey: crypto.randomUUID(), answers: answers(), decision: 'accept_replacement', acceptedVersionId: replacement.versionId }
  });
  assert.equal(accepted.status, 200);
  assert.equal(accepted.data.reward.title, 'Replacement offer');

  const issued = accepted.data.reward.code;
  await query(`UPDATE promotions SET lifecycle = 'paused' WHERE id = $1`, [replacement.id]);
  const staffLogin = await login(base, staff);
  const redeemed = await http(base, '/api/staff/rewards/' + encodeURIComponent(issued) + '/redeem', {
    method: 'POST', cookie: staffLogin.cookie, body: { idempotencyKey: crypto.randomUUID() }
  });
  assert.equal(redeemed.status, 200);
  assert.equal(redeemed.data.reward.status, 'redeemed');
  const before = await query('SELECT count(*)::int AS count FROM rewards');
  const blocked = await submitGuest(base);
  assert.equal(blocked.attempt.status, 409);
  assert.equal(blocked.attempt.data.error, 'unavailable');
  const afterPause = await query('SELECT count(*)::int AS count FROM rewards');
  assert.equal(afterPause.rows[0].count, before.rows[0].count);

  const endedContext = await http(base, '/api/survey-context?campaign=' + campaign.slug);
  assert.equal(endedContext.data.availability.issuable, false);
  assert.equal(endedContext.data.offer.name, 'Original offer');
  assert.equal(endedContext.data.currentOfferPath, '/survey');
  assert.equal(endedContext.data.canStart, false);
  const endedAttempt = await http(base, '/api/survey-attempts', { method: 'POST', body: { campaignSlug: campaign.slug } });
  assert.equal(endedAttempt.status, 409);
  assert.equal(endedAttempt.data.error, 'unavailable');
  assert.equal(endedAttempt.data.currentOfferPath, '/survey');
  const afterEnded = await query('SELECT count(*)::int AS count FROM rewards');
  assert.equal(afterEnded.rows[0].count, before.rows[0].count);
});

test('A09 A10 A11 A12 redemption conflicts, expiry, fulfillment, and reversal', async () => {
  await makePromo({ isDefault: true });
  const submitted = await submitGuest(base);
  const code = submitted.submitted.data.reward.code;
  const staffLogin = await login(base, staff);
  const managerLogin = await login(base, manager);
  const secret = 'guest-secret@example.test';
  await query(`INSERT INTO subscribers (email, email_hash, status) VALUES ($1, 'hash', 'subscribed')`, [secret]);
  const [first, second] = await Promise.all([
    http(base, '/api/staff/rewards/' + encodeURIComponent(code) + '/redeem', { method: 'POST', cookie: staffLogin.cookie, body: { idempotencyKey: crypto.randomUUID(), checkReference: 'check-9' } }),
    http(base, '/api/staff/rewards/' + encodeURIComponent(code) + '/redeem', { method: 'POST', cookie: managerLogin.cookie, body: { idempotencyKey: crypto.randomUUID(), checkReference: 'check-9' } })
  ]);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal([first.data.duplicate, second.data.duplicate].filter(Boolean).length, 1);
  assert.doesNotMatch(JSON.stringify(first.data) + JSON.stringify(second.data), new RegExp(secret));
  const redemptions = await query('SELECT count(*)::int AS count FROM redemptions');
  assert.equal(redemptions.rows[0].count, 1);
  const pending = await http(base, '/api/staff/rewards/' + encodeURIComponent(code), { cookie: staffLogin.cookie });
  assert.equal(pending.data.redemption.needsFulfillment, true);
  assert.match(pending.data.staffInstructions, /SECRET-STAFF-NOTE/);
  const failed = await http(base, '/api/staff/rewards/' + encodeURIComponent(code) + '/fulfill', { method: 'POST', cookie: staffLogin.cookie, body: { state: 'failed', note: 'Item unavailable' } });
  assert.equal(failed.data.reward.redemption.fulfillmentState, 'failed');
  const resolved = await http(base, '/api/staff/rewards/' + encodeURIComponent(code) + '/fulfill', { method: 'POST', cookie: managerLogin.cookie, body: { state: 'completed' } });
  assert.equal(resolved.data.reward.redemption.fulfillmentState, 'completed');
  const audit = await query(`SELECT count(*)::int AS count FROM audit_events WHERE action LIKE 'fulfillment_%'`);
  assert.ok(audit.rows[0].count >= 1);

  const issuedBefore = await query('SELECT total_issued FROM capacity_ledger');
  const reversed = await http(base, '/api/staff/rewards/' + encodeURIComponent(code) + '/reverse', {
    method: 'POST', cookie: managerLogin.cookie, body: { reason: 'Redeemed the wrong check', confirmNoBenefit: true }
  });
  assert.equal(reversed.status, 200);
  assert.equal(reversed.data.reward.status, 'issued');
  const issuedAfter = await query('SELECT total_issued FROM capacity_ledger');
  assert.equal(issuedAfter.rows[0].total_issued, issuedBefore.rows[0].total_issued);
  const events = await query(`SELECT event_type FROM reward_events WHERE reward_id = (SELECT id FROM rewards WHERE code = $1) ORDER BY created_at`, [code]);
  assert.ok(events.rows.some((row) => row.event_type === 'redeemed'));
  assert.ok(events.rows.some((row) => row.event_type === 'redemption_reversed'));

  const expired = await submitGuest(base);
  await query(`UPDATE rewards SET expires_at = now() - interval '1 minute' WHERE code = $1`, [expired.submitted.data.reward.code]);
  const denyExpired = await http(base, '/api/staff/rewards/' + encodeURIComponent(expired.submitted.data.reward.code) + '/redeem', { method: 'POST', cookie: staffLogin.cookie, body: { idempotencyKey: crypto.randomUUID() } });
  assert.equal(denyExpired.status, 409);
  assert.equal(denyExpired.data.error, 'expired');
  const unknown = await http(base, '/api/staff/rewards/DM-ZZZZ-ZZZZ', { cookie: staffLogin.cookie });
  assert.equal(unknown.status, 404);
  assert.doesNotMatch(unknown.text, new RegExp(secret));
  const anon = await http(base, '/api/staff/rewards/' + encodeURIComponent(code) + '/redeem', { method: 'POST', body: { status: 'redeemed' } });
  assert.equal(anon.status, 401);
});

test('A13 A14 A22 signup failure, consent history, and suppression', async () => {
  await makePromo({ isDefault: true });
  const submitted = await submitGuest(base);
  const rewardId = (await query('SELECT id, status FROM rewards WHERE code = $1', [submitted.submitted.data.reward.code])).rows[0];
  const bad = await http(base, '/api/survey-signups', { method: 'POST', body: { signupToken: submitted.submitted.data.signupToken, email: 'not-an-email', consentVersion: 'survey-email-v1' } });
  assert.equal(bad.status, 400);
  const still = await query('SELECT status FROM rewards WHERE id = $1', [rewardId.id]);
  assert.equal(still.rows[0].status, 'issued');
  const signed = await http(base, '/api/survey-signups', { method: 'POST', body: { signupToken: submitted.submitted.data.signupToken, email: '  Ada@Example.com ', firstName: 'Ada', consentVersion: 'survey-email-v1' } });
  assert.equal(signed.status, 200);
  const secondVisit = await submitGuest(base);
  await query(`UPDATE subscribers SET status = 'unsubscribed' WHERE email = 'ada@example.com'`);
  await query(`INSERT INTO consent_events (subscriber_id, action, source) SELECT id, 'opt_out', 'unsubscribe_link' FROM subscribers WHERE email = 'ada@example.com'`);
  const again = await http(base, '/api/survey-signups', { method: 'POST', body: { signupToken: secondVisit.submitted.data.signupToken, email: 'ada@example.com', consentVersion: 'survey-email-v1' } });
  assert.equal(again.status, 200);
  const subscribers = await query(`SELECT count(*)::int AS count FROM subscribers`);
  const events = await query(`SELECT action FROM consent_events ORDER BY created_at`);
  assert.equal(subscribers.rows[0].count, 1);
  assert.deepEqual(events.rows.map((row) => row.action), ['opt_in', 'opt_out', 'opt_in']);
  const adminLogin = await login(base, admin);
  const token = (await query('SELECT unsubscribe_token FROM subscribers')).rows[0].unsubscribe_token;
  const removed = await http(base, '/api/unsubscribe', { method: 'POST', body: { token } });
  assert.equal(removed.status, 200);
  const repeat = await http(base, '/api/unsubscribe', { method: 'POST', body: { token } });
  assert.equal(repeat.data.duplicate, true);
  const csv = await http(base, '/api/reports/export/subscribers.csv', { cookie: adminLogin.cookie });
  assert.equal(csv.status, 200);
  assert.doesNotMatch(csv.text, /ada@example.com/);
  const rewardStill = await query('SELECT status FROM rewards WHERE id = $1', [rewardId.id]);
  assert.equal(rewardStill.rows[0].status, 'issued');
});

test('A15 A16 attribution stays distinct and published survey versions stay immutable', async () => {
  const promo = await makePromo({ isDefault: true });
  const version = (await query('SELECT current_version_id FROM surveys')).rows[0].current_version_id;
  await makeCampaign(promo, version, 'tiktok-bio', { channel: 'tiktok', placement: 'tiktok_bio' });
  const submitted = await submitGuest(base, { campaign: 'tiktok-bio', body: answers({ q_discovery: { optionId: 'instagram' } }) });
  assert.equal(submitted.submitted.status, 200);
  const stored = await query('SELECT entry_source, discovery_option, campaign_id FROM survey_responses WHERE id = $1', [submitted.submitted.data.responseId]);
  assert.equal(stored.rows[0].entry_source, 'tiktok');
  assert.equal(stored.rows[0].discovery_option, 'instagram');
  assert.notEqual(stored.rows[0].entry_source, stored.rows[0].discovery_option);

  const managerLogin = await login(base, manager);
  const survey = await query('SELECT id FROM surveys');
  const current = await http(base, '/api/admin/surveys/' + survey.rows[0].id, { cookie: managerLogin.cookie });
  const schema = JSON.parse(JSON.stringify(current.data.versions[0].schema));
  schema.questions.find((question) => question.id === 'q_discovery').options.find((option) => option.id === 'tiktok').label = 'Short video app';
  const draft = await http(base, '/api/admin/surveys/' + survey.rows[0].id + '/draft', {
    method: 'PUT', cookie: managerLogin.cookie,
    body: { title: current.data.versions[0].title, intro: current.data.versions[0].intro, schema }
  });
  assert.equal(draft.status, 200);
  const published = await http(base, '/api/admin/surveys/' + survey.rows[0].id + '/publish', { method: 'POST', cookie: managerLogin.cookie, body: {} });
  assert.equal(published.status, 200);
  const oldLabel = await query(`SELECT schema FROM survey_versions WHERE id = $1`, [version]);
  assert.equal(oldLabel.rows[0].schema.questions.find((question) => question.id === 'q_discovery').options.find((option) => option.id === 'tiktok').label, 'TikTok');
  await assert.rejects(() => query(`UPDATE survey_versions SET title = 'Changed' WHERE id = $1`, [version]), /immutable/);
  const csv = await http(base, '/api/reports/export/responses.csv?from=2026-01-01&to=2026-12-31', { cookie: managerLogin.cookie });
  assert.match(csv.text, /Instagram/);
  assert.match(csv.text, /tiktok_bio|tiktok/);
});

test('A17 reports and subscriber export are denied without the right role', async () => {
  const secret = 'hidden.subscriber@example.test';
  await query(`INSERT INTO subscribers (email, email_hash, status, unsubscribe_token) VALUES ($1, 'h', 'subscribed', 'tok')`, [secret]);
  const staffLogin = await login(base, staff);
  const managerLogin = await login(base, manager);
  const adminLogin = await login(base, admin);
  const staffReport = await http(base, '/api/reports/overview', { cookie: staffLogin.cookie });
  const staffExport = await http(base, '/api/reports/export/subscribers.csv', { cookie: staffLogin.cookie });
  const managerExport = await http(base, '/api/reports/export/subscribers.csv', { cookie: managerLogin.cookie });
  const anon = await http(base, '/api/reports/export/responses.csv');
  assert.equal(staffReport.status, 403);
  assert.equal(staffExport.status, 403);
  assert.equal(managerExport.status, 403);
  assert.equal(anon.status, 401);
  assert.doesNotMatch(staffReport.text + staffExport.text + managerExport.text + anon.text, new RegExp(secret));
  const allowed = await http(base, '/api/reports/export/subscribers.csv', { cookie: adminLogin.cookie });
  assert.equal(allowed.status, 200);
  assert.match(allowed.text, new RegExp(secret));
});

test('A18 daily capacity uses the Pacific date and does not refill on void', async () => {
  const promo = await makePromo({ isDefault: true, dailyCap: 1, totalCap: 5 });
  await withTransaction(async (client) => {
    assert.equal(await reserveCapacity(client, promo.id, new Date('2026-06-15T06:30:00Z')), true);
    assert.equal(await reserveCapacity(client, promo.id, new Date('2026-06-15T06:40:00Z')), false);
    assert.equal(await reserveCapacity(client, promo.id, new Date('2026-06-15T07:30:00Z')), true);
  });
  const submitted = await submitGuest(base);
  assert.equal(submitted.submitted.status, 200);
  const before = (await query('SELECT total_issued FROM capacity_ledger WHERE promotion_id = $1', [promo.id])).rows[0].total_issued;
  const managerLogin = await login(base, manager);
  const voided = await http(base, '/api/staff/rewards/' + encodeURIComponent(submitted.submitted.data.reward.code) + '/void', {
    method: 'POST', cookie: managerLogin.cookie, body: { reason: 'Issued during a bad rehearsal' }
  });
  assert.equal(voided.status, 200);
  const after = (await query('SELECT total_issued FROM capacity_ledger WHERE promotion_id = $1', [promo.id])).rows[0].total_issued;
  assert.equal(Number(after), Number(before));
});

test('A21 fixture counts reconcile and test data is excluded', async () => {
  const live = await makePromo({ isDefault: true, name: 'Counted offer', testData: false });
  const rehearsal = await makePromo({ name: 'Hidden rehearsal', testData: true });
  await query('UPDATE promotions SET is_default = false');
  await query('UPDATE promotions SET is_default = true WHERE id = $1', [live.id]);
  const real = await submitGuest(base, { body: answers({ q_party: 4, q_first: { optionId: 'returning' }, q_discovery: { optionId: 'facebook' } }) });
  assert.equal(real.submitted.status, 200);
  await query('UPDATE promotions SET is_default = false');
  await query('UPDATE promotions SET is_default = true WHERE id = $1', [rehearsal.id]);
  const hidden = await submitGuest(base, { body: answers({ q_party: 9 }) });
  assert.equal(hidden.submitted.status, 200);
  assert.equal(hidden.submitted.data.reward.testData, true);
  const managerLogin = await login(base, manager);
  const report = await http(base, '/api/reports/overview?from=2026-10-01&to=2026-10-31', { cookie: managerLogin.cookie });
  assert.equal(report.data.overview.surveyResponses, 1);
  assert.equal(report.data.overview.rewardsIssued, 1);
  assert.equal(report.data.rates.reportedPartyAttendance, 4);
  assert.equal(report.data.rates.returningNumerator, 1);
  assert.match(JSON.stringify(report.data.definitions), /Not unique customers/);
  assert.doesNotMatch(JSON.stringify(report.data), /unique customers were/i);
  const withTest = await http(base, '/api/reports/overview?from=2026-10-01&to=2026-10-31&includeTest=1', { cookie: managerLogin.cookie });
  assert.equal(withTest.data.overview.surveyResponses, 2);
  const csv = await http(base, '/api/reports/export/responses.csv?from=2026-10-01&to=2026-10-31', { cookie: managerLogin.cookie });
  assert.doesNotMatch(csv.text, /Hidden rehearsal/);
  assert.match(csv.text, /Counted offer|facebook|Facebook/);
});

test('guest reward links hide staff notes and the existing site still serves', async () => {
  await makePromo({ isDefault: true });
  const submitted = await submitGuest(base, { body: answers({ q_discovery: { optionId: 'other', text: '=1+1' } }) });
  const token = submitted.submitted.data.reward.token;
  const guest = await http(base, '/api/rewards/' + token);
  assert.equal(guest.status, 200);
  assert.equal(guest.data.reward.code, submitted.submitted.data.reward.code);
  assert.doesNotMatch(guest.text, /SECRET-STAFF-NOTE/);
  assert.equal(guest.data.reward.answers, undefined);
  const context = await http(base, '/api/survey-context');
  assert.doesNotMatch(context.text, /SECRET-STAFF-NOTE/);
  const managerLogin = await login(base, manager);
  const csv = await http(base, '/api/reports/export/responses.csv?from=2026-10-01&to=2026-10-31', { cookie: managerLogin.cookie });
  assert.match(csv.text, /'=1\+1/);
  const home = await http(base, '/');
  assert.equal(home.status, 200);
  assert.match(home.text, /Domo/);
  const staffPage = await http(base, '/staff');
  assert.match(staffPage.text, /Staff Portal/);
  const surveyPage = await http(base, '/survey');
  assert.match(surveyPage.text, /survey-main/);
  assert.doesNotMatch(surveyPage.text, /domoween/i);
  const leaked = await http(base, '/survey/issuance.js');
  assert.equal(leaked.status, 404);
});

test('analytics events do not store the email address', async () => {
  await makePromo({ isDefault: true });
  const submitted = await submitGuest(base);
  await http(base, '/api/survey-signups', { method: 'POST', body: { signupToken: submitted.submitted.data.signupToken, email: 'quiet.guest@example.test', consentVersion: 'survey-email-v1' } });
  const events = await query('SELECT event_type, attempt_id, response_id, reward_id, campaign_id, test_data FROM analytics_events');
  assert.ok(events.rows.some((row) => row.event_type === 'signup_opted_in'));
  assert.doesNotMatch(JSON.stringify(events.rows), /quiet\.guest@example\.test/);
});
