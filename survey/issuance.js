const crypto = require('crypto');
const { withTransaction, query } = require('./db');
const { HttpError } = require('./errors');
const { validateAnswers } = require('./validate');
const { randomToken, rewardCode, sha256 } = require('./codes');
const { computeExpiry, formatPacific } = require('./time');
const { resolveEntry, loadPromotionBundle, assessBundle, guestOffer } = require('./entry');
const { reserveCapacity } = require('./capacity');
const QRCode = require('qrcode');

const PARTY_NOTE = 'One reward per party, per visit. Returning guests are welcome to participate on a future visit.';

async function deriveLocation(client, location) {
  if (!location || location.choice === 'skipped' || location.choice === 'prefer_not') {
    return {
      location: location || { choice: 'skipped' },
      postalCode: null,
      locality: null,
      countryCode: null,
      unmapped: false
    };
  }
  if (location.choice === 'us') {
    const found = await client.query('SELECT city, region, state FROM zip_reference WHERE zip = $1', [location.zip]);
    const mapped = found.rows[0];
    return {
      location: {
        ...location,
        derivedCity: mapped ? mapped.city : null,
        derivedRegion: mapped ? mapped.region : null,
        derivedState: mapped ? mapped.state : null,
        unmapped: !mapped
      },
      postalCode: location.zip,
      locality: mapped ? mapped.city : null,
      countryCode: 'US',
      unmapped: !mapped
    };
  }
  return {
    location,
    postalCode: null,
    locality: location.city,
    countryCode: location.countryCode,
    unmapped: false
  };
}

function choiceBody(attempt, pinned, replacement, reason, label) {
  return {
    reason,
    message: label,
    canSubmitWithoutReward: true,
    previousOffer: pinned ? guestOffer(pinned.version, pinned.promotion, new Date()) : null,
    replacementOffer: replacement ? guestOffer(replacement.version, replacement.promotion, new Date()) : null,
    currentOfferPath: attempt.campaign_id ? '/survey' : null
  };
}

async function decideOffer(client, attempt, input, now) {
  const pinned = attempt.promotion_version_id ? await loadPromotionBundle(client, attempt.promotion_version_id) : null;
  const pinnedAssessment = pinned ? await assessBundle(client, pinned, now) : null;
  if (pinnedAssessment && pinnedAssessment.issuable) {
    return { kind: 'issue', bundle: pinned };
  }
  let replacement = null;
  if (!attempt.campaign_id) {
    const resolved = await resolveEntry(client, { now });
    if (resolved.bundle && resolved.availability.issuable && (!pinned || resolved.bundle.version.id !== pinned.version.id)) {
      replacement = resolved.bundle;
    }
  }
  const reason = pinnedAssessment ? pinnedAssessment.reason : 'no_offer';
  const label = pinnedAssessment ? pinnedAssessment.label : 'There is no reward available for this survey.';
  if (input.decision === 'accept_replacement') {
    if (!replacement || input.acceptedVersionId !== replacement.version.id) {
      return { kind: 'choice', ...choiceBody(attempt, pinned, replacement, reason, 'The offer changed. Accept the new terms or submit without a reward.') };
    }
    return { kind: 'issue', bundle: replacement, acceptedReplacement: true };
  }
  if (input.decision === 'submit_without_reward') return { kind: 'no_reward' };
  if (!pinned && !replacement) {
    const survey = await client.query('SELECT allow_no_reward FROM surveys s JOIN survey_versions v ON v.survey_id = s.id WHERE v.id = $1', [attempt.survey_version_id]);
    if (survey.rows[0] && survey.rows[0].allow_no_reward) return { kind: 'no_reward' };
  }
  return { kind: 'choice', ...choiceBody(attempt, pinned, replacement, reason, `${label} Your answers are still on this page. Accept a replacement offer if one is shown, or submit without a reward.`) };
}

async function insertReward(client, responseId, bundle, now, testData) {
  const expiresAt = computeExpiry(bundle.version.expiry_rule, now);
  const snapshot = {
    name: bundle.version.name,
    description: bundle.version.description,
    rewardType: bundle.version.reward_type,
    rewardDetails: bundle.version.reward_details,
    eligibility: bundle.version.eligibility,
    guestTerms: bundle.version.guest_terms,
    staffInstructions: bundle.version.staff_instructions,
    expiryRule: bundle.version.expiry_rule,
    redemptionRules: bundle.version.redemption_rules,
    promotionVersionId: bundle.version.id,
    promotionId: bundle.promotion.id,
    testData: Boolean(testData)
  };
  let inserted;
  let token = randomToken();
  let code = rewardCode();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await client.query('SAVEPOINT reward_code');
    try {
      inserted = await client.query(
        `INSERT INTO rewards (response_id, token_hash, code, code_normalized, promotion_version_id, terms_snapshot, issued_at, expires_at, status, test_data)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'issued',$9) RETURNING *`,
        [responseId, sha256(token), code, code.replace(/[^A-Z0-9]/g, ''), bundle.version.id, snapshot, now, expiresAt, testData]
      );
      await client.query('RELEASE SAVEPOINT reward_code');
      break;
    } catch (error) {
      await client.query('ROLLBACK TO SAVEPOINT reward_code');
      if (error.code === '23505' && /code/.test(error.constraint || '')) {
        token = randomToken();
        code = rewardCode();
        continue;
      }
      throw error;
    }
  }
  if (!inserted) throw new HttpError(500, 'server_error', 'Could not assign a reward code. Please retry.');
  await client.query(
    `INSERT INTO reward_events (reward_id, event_type, data) VALUES ($1, 'issued', $2)`,
    [inserted.rows[0].id, { expiresAt }]
  );
  await client.query(
    `INSERT INTO analytics_events (event_type, response_id, reward_id, test_data)
     VALUES ('reward_issued', $1, $2, $3)`,
    [responseId, inserted.rows[0].id, testData]
  );
  return { row: inserted.rows[0], token };
}

async function submitResponse(input) {
  const now = input.now || new Date();
  let outcome;
  try {
    outcome = await withTransaction(async (client) => {
      const prior = await client.query('SELECT id FROM survey_responses WHERE idempotency_key = $1', [input.idempotencyKey]);
      if (prior.rowCount) return { duplicate: true, responseId: prior.rows[0].id };
      const attemptRes = await client.query('SELECT * FROM survey_attempts WHERE id = $1 FOR UPDATE', [input.attemptId]);
      if (!attemptRes.rowCount) throw new HttpError(404, 'not_found', 'That survey session was not found. Start again from the offer page.');
      const attempt = attemptRes.rows[0];
      if (attempt.submitted_at) {
        const existing = await client.query('SELECT id FROM survey_responses WHERE attempt_id = $1', [attempt.id]);
        if (existing.rowCount) return { duplicate: true, responseId: existing.rows[0].id };
      }
      const versionRes = await client.query('SELECT * FROM survey_versions WHERE id = $1', [attempt.survey_version_id]);
      const validated = validateAnswers(versionRes.rows[0].schema, input.answers);
      if (!validated.ok) throw new HttpError(400, 'validation_error', 'Please correct the highlighted answers.', { fields: validated.fields });
      const located = await deriveLocation(client, validated.location);
      const decision = await decideOffer(client, attempt, input, now);
      if (decision.kind === 'choice') {
        throw new HttpError(409, 'offer_changed', decision.message, {
          reason: decision.reason,
          canSubmitWithoutReward: true,
          previousOffer: decision.previousOffer,
          replacementOffer: decision.replacementOffer,
          currentOfferPath: decision.currentOfferPath
        });
      }
      let bundle = null;
      let reserved = false;
      if (decision.kind === 'issue') {
        reserved = await reserveCapacity(client, decision.bundle.promotion.id, now);
        if (!reserved) {
          throw new HttpError(409, 'offer_changed', 'This offer just sold out. Your answers are still here. You can submit without a reward.', {
            reason: 'sold_out',
            canSubmitWithoutReward: true,
            previousOffer: guestOffer(decision.bundle.version, decision.bundle.promotion, now),
            replacementOffer: null,
            currentOfferPath: attempt.campaign_id ? '/survey' : null
          });
        }
        bundle = decision.bundle;
      }
      const testData = Boolean(attempt.test_data || (bundle && (bundle.promotion.test_data || bundle.version.test_data)));
      const signupToken = randomToken();
      const response = await client.query(
        `INSERT INTO survey_responses (
          idempotency_key, attempt_id, survey_version_id, promotion_version_id, answers, submitted_at,
          first_visit, party_size, discovery_option, location, postal_code, locality, country_code,
          location_unmapped, campaign_id, entry_source, placement, test_data, signup_token,
          accepted_replacement, no_reward
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
        RETURNING id`,
        [
          input.idempotencyKey, attempt.id, attempt.survey_version_id, bundle ? bundle.version.id : null,
          validated.answers, now, validated.firstVisit, validated.partySize, validated.discovery,
          located.location, located.postalCode, located.locality, located.countryCode, located.unmapped,
          attempt.campaign_id, attempt.entry_source, attempt.placement, testData, signupToken,
          Boolean(decision.acceptedReplacement), !bundle
        ]
      );
      let rewardToken = null;
      let rewardRow = null;
      if (bundle) {
        const created = await insertReward(client, response.rows[0].id, bundle, now, testData);
        rewardRow = created.row;
        rewardToken = created.token;
        await client.query('UPDATE analytics_events SET campaign_id = $2 WHERE reward_id = $1 AND campaign_id IS NULL', [rewardRow.id, attempt.campaign_id]);
      }
      await client.query('UPDATE survey_attempts SET submitted_at = $2 WHERE id = $1', [attempt.id, now]);
      await client.query(
        `INSERT INTO analytics_events (event_type, attempt_id, response_id, campaign_id, test_data)
         VALUES ('survey_submitted', $1, $2, $3, $4)`,
        [attempt.id, response.rows[0].id, attempt.campaign_id, testData]
      );
      return { duplicate: false, responseId: response.rows[0].id, signupToken, rewardToken, rewardId: rewardRow && rewardRow.id };
    });
  } catch (error) {
    if (error.code === '23505') {
      const existing = await query(
        'SELECT id FROM survey_responses WHERE idempotency_key = $1 OR attempt_id = $2 LIMIT 1',
        [input.idempotencyKey, input.attemptId]
      );
      if (existing.rowCount) return loadSubmitResult(existing.rows[0].id, { duplicate: true, baseUrl: input.baseUrl });
    }
    if (!error.status) {
      try { await query('INSERT INTO operation_log (kind) VALUES ($1)', ['submit_failed']); } catch (_) { /* ignore */ }
    }
    throw error;
  }
  return loadSubmitResult(outcome.responseId, {
    duplicate: outcome.duplicate,
    signupToken: outcome.signupToken,
    rewardToken: outcome.rewardToken,
    baseUrl: input.baseUrl
  });
}

function guestReward(row, extras = {}) {
  const snapshot = row.terms_snapshot || {};
  const status = effectiveStatus(row);
  return {
    code: row.code,
    title: snapshot.name,
    description: snapshot.description,
    guestTerms: snapshot.guestTerms,
    eligibility: snapshot.eligibility,
    rewardType: snapshot.rewardType,
    expiresAt: new Date(row.expires_at).toISOString(),
    expiresAtLabel: formatPacific(row.expires_at),
    status,
    testData: Boolean(row.test_data || snapshot.testData),
    partyNote: PARTY_NOTE,
    qrDataUrl: extras.qrDataUrl || null
  };
}

function effectiveStatus(row) {
  if (row.status === 'issued' && new Date(row.expires_at).getTime() <= Date.now()) return 'expired';
  return row.status;
}

async function qrForCode(code, baseUrl) {
  const url = `${baseUrl}/staff/rewards?code=${encodeURIComponent(code)}`;
  return QRCode.toDataURL(url, { margin: 1, width: 280, errorCorrectionLevel: 'M' });
}

async function loadSubmitResult(responseId, extras = {}) {
  const response = await query('SELECT * FROM survey_responses WHERE id = $1', [responseId]);
  if (!response.rowCount) throw new HttpError(404, 'not_found', 'That response was not found.');
  const row = response.rows[0];
  const reward = await query('SELECT * FROM rewards WHERE response_id = $1', [responseId]);
  let rewardPayload = null;
  if (reward.rowCount) {
    const qr = extras.baseUrl ? await qrForCode(reward.rows[0].code, extras.baseUrl) : null;
    rewardPayload = guestReward(reward.rows[0], { qrDataUrl: qr });
    if (extras.rewardToken) rewardPayload.token = extras.rewardToken;
  }
  return {
    duplicate: Boolean(extras.duplicate),
    responseId: row.id,
    submittedAt: row.submitted_at,
    noReward: row.no_reward,
    reward: rewardPayload,
    signupToken: extras.signupToken || row.signup_token
  };
}

async function createAttempt(input) {
  const now = input.now || new Date();
  return withTransaction(async (client) => {
    const resolved = await resolveEntry(client, { campaignSlug: input.campaignSlug, now });
    if (!resolved.survey) throw new HttpError(409, 'unavailable', resolved.availability.label, { availability: resolved.availability });
    if (!resolved.canStart) {
      throw new HttpError(409, 'unavailable', resolved.availability.label, {
        availability: resolved.availability,
        currentOfferPath: resolved.currentOfferPath || null
      });
    }
    const id = crypto.randomUUID();
    const testData = Boolean(resolved.testData);
    await client.query(
      `INSERT INTO survey_attempts (id, survey_version_id, promotion_version_id, campaign_id, entry_source, placement, utm, started_at, test_data)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        id,
        resolved.survey.version_id,
        resolved.availability.issuable && resolved.bundle ? resolved.bundle.version.id : null,
        resolved.campaign ? resolved.campaign.id : null,
        resolved.campaign ? resolved.campaign.channel : 'direct',
        input.placement || (resolved.campaign ? resolved.campaign.placement : null),
        input.utm || {},
        now,
        testData
      ]
    );
    await client.query(
      `INSERT INTO analytics_events (event_type, attempt_id, campaign_id, test_data) VALUES ('survey_started', $1, $2, $3)`,
      [id, resolved.campaign ? resolved.campaign.id : null, testData]
    );
    return {
      attemptId: id,
      surveyVersionId: resolved.survey.version_id,
      promotionVersionId: resolved.availability.issuable && resolved.bundle ? resolved.bundle.version.id : null,
      testData
    };
  });
}

module.exports = {
  submitResponse,
  createAttempt,
  guestReward,
  effectiveStatus,
  qrForCode,
  loadSubmitResult,
  PARTY_NOTE,
  deriveLocation
};
