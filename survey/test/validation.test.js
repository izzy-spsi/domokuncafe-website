const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { validateAnswers, stabilizeSchema, validatePromotionDraft } = require('../validate');
const { toggleMulti } = require('../public/logic');
const { defaultSurvey } = require('../data/default-survey');
const { reset, makeUser, startServer, stopServer, http, login } = require('./helpers');

const schema = defaultSurvey.schema;

test('party size, exclusive choices, and the three-interest limit are rejected', () => {
  const zero = validateAnswers(schema, base({ q_party: 0 }));
  assert.equal(zero.ok, false);
  assert.match(zero.fields.q_party, /whole number/);
  const both = validateAnswers(schema, base({ q_outing: { optionIds: ['knotts', 'no_other'] } }));
  assert.equal(both.ok, false);
  const four = validateAnswers(schema, base({ q_excited: { optionIds: ['food', 'drinks', 'desserts', 'merch'] } }));
  assert.equal(four.ok, false);
  assert.match(four.fields.q_excited, /up to 3/);
});

test('other text is plain and limited to 200 characters', () => {
  const dirty = validateAnswers(schema, base({ q_discovery: { optionId: 'other', text: '<script>alert(1)</script>hello' } }));
  assert.equal(dirty.ok, true);
  assert.equal(dirty.answers.q_discovery.text, 'alert(1)hello');
  const long = validateAnswers(schema, base({ q_discovery: { optionId: 'other', text: 'a'.repeat(201) } }));
  assert.equal(long.ok, false);
});

test('location can be skipped, and a ZIP stays text', () => {
  const skipped = validateAnswers(schema, base({ q_live: { choice: 'skipped' } }));
  assert.equal(skipped.ok, true);
  const blank = validateAnswers(schema, base({ q_live: { choice: 'us', zip: '' } }));
  assert.equal(blank.ok, true);
  assert.equal(blank.answers.q_live.choice, 'skipped');
  const missing = validateAnswers(schema, base({ q_live: null }));
  assert.equal(missing.ok, true);
  assert.equal(missing.answers.q_live.choice, 'skipped');
  const zip = validateAnswers(schema, base({ q_live: { choice: 'us', zip: '02108' } }));
  assert.equal(zip.answers.q_live.zip, '02108');
  assert.equal(typeof zip.answers.q_live.zip, 'string');
  const bad = validateAnswers(schema, base({ q_live: { choice: 'us', zip: '2108' } }));
  assert.equal(bad.ok, false);
  const outside = validateAnswers(schema, base({ q_live: { choice: 'outside_us', city: 'Lyon', countryCode: 'fr' } }));
  assert.equal(outside.ok, true);
  assert.equal(outside.answers.q_live.countryCode, 'FR');
  const usCountry = validateAnswers(schema, base({ q_live: { choice: 'outside_us', city: 'Boston', countryCode: 'US' } }));
  assert.equal(usCountry.ok, false);
  const prefer = validateAnswers(schema, base({ q_live: { choice: 'prefer_not' } }));
  assert.equal(prefer.ok, true);
  assert.equal(prefer.answers.q_live.choice, 'prefer_not');
  const location = schema.questions.find((question) => question.id === 'q_live');
  assert.equal(location.help, undefined);
  assert.equal(location.options, undefined);
});

test('exclusive client choices clear the other selections', () => {
  const options = schema.questions.find((question) => question.id === 'q_outing').options;
  assert.deepEqual(toggleMulti(['knotts', 'disneyland'], options.find((option) => option.id === 'no_other'), options, 0), ['no_other']);
  assert.deepEqual(toggleMulti(['no_other'], options.find((option) => option.id === 'knotts'), options, 0), ['knotts']);
  const interests = schema.questions.find((question) => question.id === 'q_excited').options;
  const limited = toggleMulti(['food', 'drinks', 'desserts'], interests.find((option) => option.id === 'merch'), interests, 3);
  assert.equal(limited.error, 'Choose up to 3.');
});

test('a changed option label gets a new id and an unchanged label does not', () => {
  const changed = stabilizeSchema(schema, {
    steps: schema.steps,
    questions: schema.questions.map((question) => question.id === 'q_discovery'
      ? { ...question, options: question.options.map((option) => option.id === 'tiktok' ? { ...option, label: 'Short video app' } : option) }
      : question)
  });
  const discovery = changed.questions.find((question) => question.label.startsWith('Where did you first hear'));
  assert.notEqual(discovery.options.find((option) => option.label === 'Short video app').id, 'tiktok');
  assert.equal(discovery.options.find((option) => option.label === 'Instagram').id, 'instagram');
});

test('promotion percentages and currency are constrained', () => {
  const bad = validatePromotionDraft({
    name: 'Too much', description: 'A discount', rewardType: 'percent_off',
    rewardDetails: { percent: 140, quantity: 1, eligibleItems: 'check' },
    guestTerms: 'Terms that are long enough.', staffInstructions: 'Tell the server what to do.',
    startsAtLocal: '2026-01-01T00:00', endsAtLocal: '2026-02-01T00:00',
    expiryRule: { type: 'duration', hours: 1, minutes: 0 }, eligibility: { dineIn: true, stacking: 'none' }
  });
  assert.equal(bad.ok, false);
  const bogo = validatePromotionDraft({
    name: 'BOGO', description: 'A drink deal', rewardType: 'bogo',
    rewardDetails: { quantity: 1, purchasedItem: '', rewardItem: '' },
    guestTerms: 'Terms that are long enough.', staffInstructions: 'Tell the server what to do.',
    expiryRule: { type: 'duration', hours: 1, minutes: 0 }, eligibility: { dineIn: true }
  });
  assert.equal(bogo.ok, false);
});

test('an 8-character staff password succeeds and a 7-character one returns 400', async () => {
  const started = await startServer();
  try {
    await reset();
    const admin = await makeUser('admin');
    const session = await login(started.base, admin);
    const email = `eight.${crypto.randomUUID()}@example.test`;
    const created = await http(started.base, '/api/admin/staff', {
      method: 'POST',
      cookie: session.cookie,
      body: { name: 'Eight Char', email, role: 'staff', password: 'abcd1234' }
    });
    assert.equal(created.status, 201);
    const signedIn = await login(started.base, { email, password: 'abcd1234' });
    assert.equal(signedIn.status, 200);

    const rejected = await http(started.base, '/api/admin/staff', {
      method: 'POST',
      cookie: session.cookie,
      body: { name: 'Seven Char', email: `seven.${crypto.randomUUID()}@example.test`, role: 'staff', password: 'abcd123' }
    });
    assert.equal(rejected.status, 400);
    assert.match(rejected.data.message, /at least 8 characters/);
    assert.match(rejected.data.fields.password, /at least 8 characters/);

    const resetShort = await http(started.base, '/api/admin/staff/' + created.data.id, {
      method: 'PATCH',
      cookie: session.cookie,
      body: { password: 'short12' }
    });
    assert.equal(resetShort.status, 400);
    assert.match(resetShort.data.message, /at least 8 characters/);

    const resetOk = await http(started.base, '/api/admin/staff/' + created.data.id, {
      method: 'PATCH',
      cookie: session.cookie,
      body: { password: 'reset123' }
    });
    assert.equal(resetOk.status, 200);
    const signedInReset = await login(started.base, { email, password: 'reset123' });
    assert.equal(signedInReset.status, 200);
  } finally {
    await stopServer(started.server);
  }
});

function base(overrides) {
  return Object.assign({
    q_live: { choice: 'prefer_not' },
    q_party: 2,
    q_first: { optionId: 'first_time' },
    q_discovery: { optionId: 'tiktok' },
    q_familiar: { optionId: 'new' },
    q_visit: { optionId: 'nearby' },
    q_outing: { optionIds: ['no_other'] },
    q_excited: { optionIds: ['no_preference'] }
  }, overrides);
}
