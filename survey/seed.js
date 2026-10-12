const { query, withTransaction } = require('./db');
const { migrate } = require('./migrate');
const { defaultSurvey } = require('./data/default-survey');
const { hashPassword } = require('./passwords');
const { parsePacificLocal } = require('./time');

const SURVEY_ID = '11111111-1111-4111-8111-111111111111';
const SURVEY_VERSION_ID = '22222222-2222-4222-8222-222222222222';

const PROMOS = [
  {
    id: '33333333-3333-4333-8333-333333333331',
    versionId: '33333333-3333-4333-8333-333333333332',
    slug: 'test-welcome-10',
    isDefault: true,
    lifecycle: 'active',
    name: 'TEST 10% off your visit',
    description: 'TEST PROMOTION. A sample 10% dine-in discount for rehearsal. This is not a live Domo Cafe offer and does not use real inventory.',
    rewardType: 'percent_off',
    rewardDetails: { percent: 10, quantity: 1, eligibleItems: 'TEST dine-in check (do not apply in Toast)' },
    expiryRule: { type: 'duration', hours: 24, minutes: 0 },
    totalCap: null,
    dailyCap: null,
    physicalSupply: null,
    starts: '2026-01-01T00:00',
    ends: '2027-01-01T00:00',
    guestTerms: 'TEST ONLY. 10% off one dine-in check. Not valid with other offers. Not a live promotion and not redeemable for real inventory or a real discount. Show this rehearsal code to a manager only during a test.',
    staffInstructions: 'TEST ONLY. Do not apply a Toast discount and do not give an item. Tell the guest this is a rehearsal code. Record redemption in this tool, then mark fulfillment complete without ringing a discount.'
  },
  {
    id: '44444444-4444-4444-8444-444444444441',
    versionId: '44444444-4444-4444-8444-444444444442',
    slug: 'test-dessert',
    isDefault: false,
    lifecycle: 'active',
    name: 'TEST dessert gift',
    description: 'TEST PROMOTION. A sample free dessert for rehearsal. No desserts are committed from live inventory.',
    rewardType: 'free_food_drink',
    rewardDetails: { quantity: 1, eligibleItems: 'TEST cookie (not real inventory)' },
    expiryRule: { type: 'same_business_day', cutoffLocal: '23:59:59' },
    totalCap: 25,
    dailyCap: null,
    physicalSupply: 25,
    starts: '2026-01-01T00:00',
    ends: '2027-01-01T00:00',
    guestTerms: 'TEST ONLY. One sample dessert reward per party per visit. This does not entitle the guest to a real dessert. It expires at the end of the Pacific business day.',
    staffInstructions: 'TEST ONLY. Do not take a dessert from live inventory. Mark the rehearsal redeemed and fulfillment complete with no item given.',
    campaign: { slug: 'test-dessert', name: 'TEST dessert table tent', channel: 'in_cafe', placement: 'table_tent' }
  },
  {
    id: '55555555-5555-4555-8555-555555555551',
    versionId: '55555555-5555-4555-8555-555555555552',
    slug: 'test-paused-bogo',
    isDefault: false,
    lifecycle: 'paused',
    name: 'TEST paused BOGO',
    description: 'TEST PROMOTION. Paused on purpose so the unavailable state can be rehearsed.',
    rewardType: 'bogo',
    rewardDetails: { quantity: 1, purchasedItem: 'TEST drink', rewardItem: 'TEST drink', eligibleItems: 'TEST drink' },
    expiryRule: { type: 'duration', hours: 4, minutes: 0 },
    totalCap: 10,
    dailyCap: 10,
    physicalSupply: null,
    starts: '2026-01-01T00:00',
    ends: '2027-01-01T00:00',
    guestTerms: 'TEST ONLY. Buy one TEST drink, get one TEST drink. This offer is paused and is not a live promotion.',
    staffInstructions: 'TEST ONLY. This promotion is paused. Do not prepare a drink. New rewards must not be issued.',
    campaign: { slug: 'test-paused', name: 'TEST paused campaign', channel: 'instagram', placement: 'instagram' }
  },
  {
    id: '66666666-6666-4666-8666-666666666661',
    versionId: '66666666-6666-4666-8666-666666666662',
    slug: 'test-ended',
    isDefault: false,
    lifecycle: 'ended',
    name: 'TEST ended $5 off',
    description: 'TEST PROMOTION. Ended on purpose. Existing rehearsal rewards would keep their original terms.',
    rewardType: 'fixed_amount',
    rewardDetails: { amountCents: 500, quantity: 1, eligibleItems: 'TEST dine-in check' },
    expiryRule: { type: 'fixed', at: '2026-06-01T06:59:59.000Z' },
    totalCap: 5,
    dailyCap: null,
    physicalSupply: null,
    starts: '2026-01-01T00:00',
    ends: '2026-02-01T00:00',
    guestTerms: 'TEST ONLY. $5 off a dine-in check. This sample offer has ended and is not a live promotion.',
    staffInstructions: 'TEST ONLY. Do not apply five dollars in Toast. This ended promotion must not issue new rewards.',
    campaign: { slug: 'test-ended', name: 'TEST ended campaign', channel: 'receipt', placement: 'receipt' }
  },
  {
    id: '77777777-7777-4777-8777-777777777771',
    versionId: '77777777-7777-4777-8777-777777777772',
    slug: 'test-pin',
    isDefault: false,
    lifecycle: 'active',
    name: 'TEST pin gift',
    description: 'TEST PROMOTION. A second active offer that is not the default, used to prove campaign links keep their own reward.',
    rewardType: 'merchandise',
    rewardDetails: { quantity: 1, eligibleItems: 'TEST pin (not real inventory)' },
    expiryRule: { type: 'duration', hours: 12, minutes: 0 },
    totalCap: 20,
    dailyCap: 5,
    physicalSupply: 20,
    starts: '2026-01-01T00:00',
    ends: '2027-01-01T00:00',
    guestTerms: 'TEST ONLY. One sample pin per party per visit. No real merchandise is reserved. Not the default table offer.',
    staffInstructions: 'TEST ONLY. Do not take a pin from retail stock. This campaign is separate from the default test discount.',
    campaign: { slug: 'test-pin', name: 'TEST pin campaign', channel: 'tiktok', placement: 'tiktok' }
  }
];

async function seed() {
  await migrate();
  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO surveys (id, slug, status, allow_no_reward)
       VALUES ($1, 'guest-visit', 'published', false)
       ON CONFLICT (id) DO NOTHING`,
      [SURVEY_ID]
    );
    await client.query(
      `INSERT INTO survey_versions (id, survey_id, version_number, state, title, intro, schema, published_at)
       VALUES ($1,$2,1,'published',$3,$4,$5, now())
       ON CONFLICT (id) DO NOTHING`,
      [SURVEY_VERSION_ID, SURVEY_ID, defaultSurvey.title, defaultSurvey.intro, defaultSurvey.schema]
    );
    await client.query(
      `UPDATE surveys SET current_version_id = $2, status = 'published'
       WHERE id = $1 AND current_version_id IS NULL`,
      [SURVEY_ID, SURVEY_VERSION_ID]
    );

    for (const promo of PROMOS) {
      await client.query(
        `INSERT INTO promotions (id, slug, lifecycle, is_default, test_data)
         VALUES ($1,$2,$3,$4,true)
         ON CONFLICT (id) DO NOTHING`,
        [promo.id, promo.slug, promo.lifecycle, promo.isDefault]
      );
      await client.query(
        `INSERT INTO promotion_versions (
          id, promotion_id, version_number, state, name, description, reward_type, reward_details, eligibility,
          guest_terms, staff_instructions, starts_at, ends_at, expiry_rule, total_cap, daily_cap, physical_supply,
          redemption_rules, survey_id, test_data, published_at
        ) VALUES (
          $1,$2,1,'published',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,true, now()
        ) ON CONFLICT (id) DO NOTHING`,
        [
          promo.versionId, promo.id, promo.name, promo.description, promo.rewardType, promo.rewardDetails,
          { dineIn: true, minimumCents: null, excludedCategories: [], stacking: 'none' },
          promo.guestTerms, promo.staffInstructions, parsePacificLocal(promo.starts), parsePacificLocal(promo.ends),
          promo.expiryRule, promo.totalCap, promo.dailyCap, promo.physicalSupply,
          { onePerPartyPerVisit: true, stacking: 'none' }, SURVEY_ID
        ]
      );
      await client.query(
        `UPDATE promotions SET current_version_id = $2 WHERE id = $1 AND current_version_id IS NULL`,
        [promo.id, promo.versionId]
      );
      await client.query(
        `INSERT INTO capacity_ledger (promotion_id, total_cap, daily_cap, physical_supply)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (promotion_id) DO NOTHING`,
        [promo.id, promo.totalCap, promo.dailyCap, promo.physicalSupply]
      );
      if (promo.campaign) {
        await client.query(
          `INSERT INTO campaigns (slug, name, promotion_id, promotion_version_id, survey_version_id, channel, placement, utm, test_data)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'{}'::jsonb,true)
           ON CONFLICT (slug) DO NOTHING`,
          [promo.campaign.slug, promo.campaign.name, promo.id, promo.versionId, SURVEY_VERSION_ID, promo.campaign.channel, promo.campaign.placement]
        );
      }
    }
  });

  if (process.env.SURVEY_SEED_PASSWORD) {
    const passwordHash = await hashPassword(process.env.SURVEY_SEED_PASSWORD);
    const users = [
      ['staff.rehearsal@survey.test.domokuncafe.local', 'Rehearsal server', 'staff'],
      ['manager.rehearsal@survey.test.domokuncafe.local', 'Rehearsal manager', 'manager'],
      ['admin.rehearsal@survey.test.domokuncafe.local', 'Rehearsal admin', 'admin']
    ];
    for (const [email, name, role] of users) {
      await query(
        `INSERT INTO staff_users (email, name, password_hash, role) VALUES ($1,$2,$3,$4)
         ON CONFLICT (email) DO NOTHING`,
        [email, name, passwordHash, role]
      );
    }
    console.log('Seeded rehearsal staff accounts. They share SURVEY_SEED_PASSWORD and are not production logins.');
  } else {
    console.log('No SURVEY_SEED_PASSWORD set, so no staff accounts were created. Use npm run create-staff.');
  }
  console.log('Seeded TEST promotions only. No live offer was activated.');
}

if (require.main === module) {
  seed().then(() => process.exit(0)).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { seed, SURVEY_ID, SURVEY_VERSION_ID };
