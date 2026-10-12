const test = require('node:test');
const assert = require('node:assert/strict');
const { validateAnswers, stabilizeSchema, validatePromotionDraft } = require('../validate');
const { toggleMulti } = require('../public/logic');
const { defaultSurvey } = require('../data/default-survey');

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
  const zip = validateAnswers(schema, base({ q_live: { choice: 'us', zip: '02108' } }));
  assert.equal(zip.answers.q_live.zip, '02108');
  const bad = validateAnswers(schema, base({ q_live: { choice: 'us', zip: '2108' } }));
  assert.equal(bad.ok, false);
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
