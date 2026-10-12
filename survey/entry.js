const { expiryPreview } = require('./time');
const { eligibilityLines: lines } = require('./validate');

function quantityNote(version) {
  const notes = [];
  if (version.physical_supply) notes.push(`Physical supply committed: ${version.physical_supply}.`);
  if (version.total_cap) notes.push(`Total rewards that can be issued: ${version.total_cap}.`);
  if (version.daily_cap) notes.push(`Daily issuance limit: ${version.daily_cap}.`);
  if (!notes.length) notes.push('No issuance cap is configured.');
  return notes.join(' ');
}

function guestOffer(version, promotion, now) {
  return {
    versionId: version.id,
    promotionId: promotion.id,
    name: version.name,
    description: version.description,
    rewardType: version.reward_type,
    guestTerms: version.guest_terms,
    eligibility: lines(version.eligibility),
    expiryPreview: expiryPreview(version.expiry_rule, now),
    testData: Boolean(promotion.test_data || version.test_data),
    quantityNote: quantityNote(version),
    imageUrl: safeImage(version.image_url),
    windowStartsAt: version.starts_at,
    windowEndsAt: version.ends_at
  };
}

function safeImage(url) {
  if (!url) return null;
  if (/^https:\/\/|^\/survey-assets\//.test(url)) return url;
  return null;
}

function renderIntro(intro, rewardName) {
  const name = rewardName || 'the current survey reward';
  return String(intro || '').replaceAll('{{current_reward}}', name);
}

async function loadPublishedSurvey(client, surveyVersionId) {
  if (surveyVersionId) {
    const pinned = await client.query(
      `SELECT s.*, v.id AS version_id, v.title, v.intro, v.schema, v.state, v.version_number
       FROM survey_versions v JOIN surveys s ON s.id = v.survey_id
       WHERE v.id = $1 AND v.state = 'published' AND s.status <> 'archived'`,
      [surveyVersionId]
    );
    return pinned.rows[0] || null;
  }
  const result = await client.query(
    `SELECT s.*, v.id AS version_id, v.title, v.intro, v.schema, v.state, v.version_number
     FROM surveys s JOIN survey_versions v ON v.id = s.current_version_id
     WHERE s.status = 'published' AND v.state = 'published'
     ORDER BY v.published_at DESC NULLS LAST LIMIT 1`
  );
  return result.rows[0] || null;
}

async function loadPromotionBundle(client, versionId) {
  const result = await client.query(
    `SELECT v.*, p.lifecycle, p.is_default, p.slug AS promotion_slug, p.test_data AS promotion_test_data
     FROM promotion_versions v JOIN promotions p ON p.id = v.promotion_id
     WHERE v.id = $1`,
    [versionId]
  );
  if (!result.rowCount) return null;
  const row = result.rows[0];
  return {
    version: row,
    promotion: {
      id: row.promotion_id,
      lifecycle: row.lifecycle,
      is_default: row.is_default,
      slug: row.promotion_slug,
      test_data: row.promotion_test_data
    }
  };
}

async function ledgerRemaining(client, promotionId, now) {
  const { pacificDate } = require('./time');
  const day = pacificDate(now);
  const result = await client.query(
    `SELECT total_issued, to_char(daily_date, 'YYYY-MM-DD') AS daily_date, daily_issued, total_cap, daily_cap, physical_supply
     FROM capacity_ledger WHERE promotion_id = $1`,
    [promotionId]
  );
  if (!result.rowCount) return { exhausted: true, remaining: 0 };
  const row = result.rows[0];
  const dailyUsed = row.daily_date === day ? Number(row.daily_issued) : 0;
  const limits = [];
  if (row.total_cap != null) limits.push(Number(row.total_cap) - Number(row.total_issued));
  if (row.physical_supply != null) limits.push(Number(row.physical_supply) - Number(row.total_issued));
  if (row.daily_cap != null) limits.push(Number(row.daily_cap) - dailyUsed);
  const remaining = limits.length ? Math.min(...limits) : null;
  return { exhausted: remaining != null && remaining <= 0, remaining, ledger: row };
}

function windowOpen(version, now) {
  const start = new Date(version.starts_at);
  const end = new Date(version.ends_at);
  return now >= start && now < end;
}

async function assessBundle(client, bundle, now) {
  if (!bundle) return { issuable: false, reason: 'missing', label: 'This offer is not available.' };
  const { promotion, version } = bundle;
  if (promotion.lifecycle === 'draft') return { issuable: false, reason: 'draft', label: 'This offer is not published.' };
  if (promotion.lifecycle === 'paused') return { issuable: false, reason: 'paused', label: 'This offer is paused.' };
  if (promotion.lifecycle === 'ended') return { issuable: false, reason: 'ended', label: 'This offer has ended.' };
  if (!version.starts_at || !version.ends_at) return { issuable: false, reason: 'unscheduled', label: 'This offer has no issuance window.' };
  if (now < new Date(version.starts_at)) return { issuable: false, reason: 'scheduled', label: 'This offer has not started.' };
  if (now >= new Date(version.ends_at)) return { issuable: false, reason: 'ended', label: 'This offer has ended.' };
  if (version.state !== 'published') return { issuable: false, reason: 'draft', label: 'This offer is not published.' };
  const capacity = await ledgerRemaining(client, promotion.id, now);
  if (capacity.exhausted) return { issuable: false, reason: 'exhausted', label: 'This offer is sold out.', capacity };
  return { issuable: true, reason: 'active', label: 'Available', capacity, windowOpen: windowOpen(version, now) };
}

async function resolveEntry(client, { campaignSlug, now }) {
  let campaign = null;
  if (campaignSlug) {
    const found = await client.query('SELECT * FROM campaigns WHERE slug = $1', [campaignSlug]);
    campaign = found.rows[0] || null;
    if (!campaign) {
      return { survey: null, offer: null, campaign: null, availability: { issuable: false, reason: 'unknown_campaign', label: 'This survey link was not found.' }, canStart: false };
    }
  }
  const survey = await loadPublishedSurvey(client, campaign ? campaign.survey_version_id : null);
  if (!survey) {
    return { survey: null, offer: null, campaign, availability: { issuable: false, reason: 'no_survey', label: 'The guest survey is not open.' }, canStart: false };
  }
  let bundle = null;
  if (campaign) {
    if (!campaign.active) {
      return { survey, offer: null, campaign, availability: { issuable: false, reason: 'inactive', label: 'This campaign link is inactive.' }, canStart: Boolean(survey.allow_no_reward), currentOfferPath: '/survey' };
    }
    const versionId = campaign.promotion_version_id;
    bundle = versionId ? await loadPromotionBundle(client, versionId) : null;
  } else {
    const def = await client.query(
      `SELECT current_version_id FROM promotions WHERE is_default = true LIMIT 1`
    );
    if (def.rowCount && def.rows[0].current_version_id) {
      bundle = await loadPromotionBundle(client, def.rows[0].current_version_id);
    }
  }
  const assessment = await assessBundle(client, bundle, now);
  const offer = bundle ? guestOffer(bundle.version, bundle.promotion, now) : null;
  const currentOfferPath = campaign && !assessment.issuable ? '/survey' : null;
  return {
    survey,
    offer,
    bundle,
    campaign,
    availability: { issuable: assessment.issuable, reason: bundle ? assessment.reason : 'no_offer', label: bundle ? assessment.label : 'There is no current offer.' },
    canStart: assessment.issuable || Boolean(survey.allow_no_reward),
    currentOfferPath,
    testData: Boolean(bundle && (bundle.promotion.test_data || bundle.version.test_data))
  };
}

module.exports = {
  guestOffer,
  renderIntro,
  resolveEntry,
  assessBundle,
  loadPromotionBundle,
  ledgerRemaining,
  safeImage
};
