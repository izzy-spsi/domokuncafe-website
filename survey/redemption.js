const { withTransaction, query } = require('./db');
const { HttpError } = require('./errors');
const { normalizeCode } = require('./codes');
const { formatPacific } = require('./time');

function staffView(reward, redemption, events) {
  const snapshot = reward.terms_snapshot || {};
  const status = reward.status === 'issued' && new Date(reward.expires_at).getTime() <= Date.now() ? 'expired' : reward.status;
  return {
    code: reward.code,
    status,
    testData: Boolean(reward.test_data || snapshot.testData),
    title: snapshot.name,
    description: snapshot.description,
    guestTerms: snapshot.guestTerms,
    staffInstructions: snapshot.staffInstructions,
    rewardType: snapshot.rewardType,
    rewardDetails: snapshot.rewardDetails,
    eligibility: snapshot.eligibility,
    redemptionRules: snapshot.redemptionRules,
    expiresAt: new Date(reward.expires_at).toISOString(),
    expiresAtLabel: formatPacific(reward.expires_at),
    issuedAtLabel: formatPacific(reward.issued_at),
    redemption: redemption ? {
      redeemedAt: redemption.redeemed_at,
      redeemedAtLabel: formatPacific(redemption.redeemed_at),
      checkReference: redemption.check_reference,
      fulfillmentState: redemption.reversed_at ? 'reversed' : redemption.fulfillment_state,
      fulfillmentAt: redemption.fulfillment_at,
      reversedAt: redemption.reversed_at,
      reversalReason: redemption.reversal_reason,
      needsFulfillment: !redemption.reversed_at && redemption.fulfillment_state === 'pending'
    } : null,
    events: (events || []).map((event) => ({
      type: event.event_type,
      reason: event.reason,
      at: event.created_at
    }))
  };
}

async function loadByCode(client, code) {
  const normalized = normalizeCode(code);
  if (!normalized) return null;
  await client.query(
    `UPDATE rewards SET status = 'expired' WHERE code_normalized = $1 AND status = 'issued' AND expires_at <= now()`,
    [normalized]
  );
  const result = await client.query('SELECT * FROM rewards WHERE code_normalized = $1', [normalized]);
  return result.rows[0] || null;
}

async function lookupReward(code) {
  return withTransaction(async (client) => {
    const reward = await loadByCode(client, code);
    if (!reward) throw new HttpError(404, 'not_found', 'That code was not found.');
    const redemption = await client.query('SELECT * FROM redemptions WHERE reward_id = $1', [reward.id]);
    const events = await client.query('SELECT event_type, reason, created_at FROM reward_events WHERE reward_id = $1 ORDER BY created_at', [reward.id]);
    return staffView(reward, redemption.rows[0], events.rows);
  });
}

async function redeemReward({ code, actor, idempotencyKey, checkReference }) {
  return withTransaction(async (client) => {
    if (idempotencyKey) {
      const same = await client.query(
        `SELECT r.* FROM redemptions d JOIN rewards r ON r.id = d.reward_id WHERE d.idempotency_key = $1`,
        [idempotencyKey]
      );
      if (same.rowCount) return present(client, same.rows[0], true);
    }
    const reward = await loadByCode(client, code);
    if (!reward) throw new HttpError(404, 'not_found', 'That code was not found.');
    if (reward.status === 'voided') throw new HttpError(409, 'voided', 'This reward was voided and cannot be redeemed.');
    if (reward.status === 'expired' || (reward.status === 'issued' && new Date(reward.expires_at) <= new Date())) {
      throw new HttpError(409, 'expired', 'This reward expired before it was redeemed.');
    }
    const updated = await client.query(
      `UPDATE rewards SET status = 'redeemed' WHERE id = $1 AND status = 'issued' AND expires_at > now() RETURNING *`,
      [reward.id]
    );
    if (!updated.rowCount) {
      const current = await client.query('SELECT * FROM rewards WHERE id = $1', [reward.id]);
      if (current.rows[0].status === 'redeemed') return present(client, current.rows[0], true);
      throw new HttpError(409, 'expired', 'This reward can no longer be redeemed.');
    }
    const note = checkReference ? String(checkReference).slice(0, 80) : null;
    await client.query(
      `INSERT INTO redemptions (reward_id, staff_id, check_reference, idempotency_key)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (reward_id) DO UPDATE
       SET staff_id = EXCLUDED.staff_id, redeemed_at = now(), check_reference = EXCLUDED.check_reference,
           fulfillment_state = 'pending', fulfillment_at = NULL, fulfillment_by = NULL, fulfillment_note = NULL,
           idempotency_key = EXCLUDED.idempotency_key, reversed_at = NULL, reversed_by = NULL, reversal_reason = NULL`,
      [reward.id, actor.id, note, idempotencyKey || null]
    );
    await client.query(
      `INSERT INTO reward_events (reward_id, event_type, actor_id, data) VALUES ($1,'redeemed',$2,$3)`,
      [reward.id, actor.id, { checkReference: note }]
    );
    await client.query(
      `INSERT INTO analytics_events (event_type, reward_id, test_data) VALUES ('reward_redeemed', $1, $2)`,
      [reward.id, updated.rows[0].test_data]
    );
    return present(client, updated.rows[0], false);
  });
}

async function present(client, reward, duplicate) {
  const redemption = await client.query('SELECT * FROM redemptions WHERE reward_id = $1', [reward.id]);
  const events = await client.query('SELECT event_type, reason, created_at FROM reward_events WHERE reward_id = $1 ORDER BY created_at', [reward.id]);
  return { duplicate, reward: staffView(reward, redemption.rows[0], events.rows) };
}

async function setFulfillment({ code, actor, state, note }) {
  if (!['completed', 'failed', 'pending'].includes(state)) {
    throw new HttpError(400, 'validation_error', 'Choose a fulfillment state.', { fields: { state: 'Use completed, failed, or pending.' } });
  }
  return withTransaction(async (client) => {
    const reward = await loadByCode(client, code);
    if (!reward) throw new HttpError(404, 'not_found', 'That code was not found.');
    const redemption = await client.query('SELECT * FROM redemptions WHERE reward_id = $1 FOR UPDATE', [reward.id]);
    if (!redemption.rowCount || redemption.rows[0].reversed_at) {
      throw new HttpError(409, 'not_redeemed', 'Redeem this reward before recording fulfillment.');
    }
    const current = redemption.rows[0];
    if (current.fulfillment_state === state && state === 'completed') {
      return present(client, reward, true);
    }
    await client.query(
      `UPDATE redemptions SET fulfillment_state = $2, fulfillment_at = CASE WHEN $2 = 'pending' THEN NULL ELSE now() END,
       fulfillment_by = $3, fulfillment_note = $4 WHERE reward_id = $1`,
      [reward.id, state, actor.id, note ? String(note).slice(0, 300) : null]
    );
    await client.query(
      `INSERT INTO reward_events (reward_id, event_type, actor_id, reason) VALUES ($1,$2,$3,$4)`,
      [reward.id, state === 'completed' ? 'fulfillment_completed' : `fulfillment_${state}`, actor.id, note || null]
    );
    if (state === 'completed') {
      await client.query(
        `INSERT INTO analytics_events (event_type, reward_id, test_data) VALUES ('fulfillment_completed', $1, $2)`,
        [reward.id, reward.test_data]
      );
    }
    await client.query(
      `INSERT INTO audit_events (actor_id, action, entity_type, entity_id, before_state, after_state, reason)
       VALUES ($1, $2, 'reward', $3, $4, $5, $6)`,
      [actor.id, 'fulfillment_' + state, reward.id, { fulfillment: current.fulfillment_state }, { fulfillment: state }, note || null]
    );
    const fresh = await client.query('SELECT * FROM rewards WHERE id = $1', [reward.id]);
    return present(client, fresh.rows[0], false);
  });
}

async function reverseRedemption({ code, actor, reason, confirmNoBenefit }) {
  if (!reason || String(reason).trim().length < 3) throw new HttpError(400, 'validation_error', 'A reason is required.', { fields: { reason: 'Enter the reason for this exception.' } });
  return withTransaction(async (client) => {
    const reward = await loadByCode(client, code);
    if (!reward) throw new HttpError(404, 'not_found', 'That code was not found.');
    const redemption = await client.query('SELECT * FROM redemptions WHERE reward_id = $1 FOR UPDATE', [reward.id]);
    if (!redemption.rowCount || redemption.rows[0].reversed_at) {
      throw new HttpError(409, 'not_redeemed', 'There is no active redemption to reverse.');
    }
    if (redemption.rows[0].fulfillment_state === 'completed' && !confirmNoBenefit) {
      throw new HttpError(400, 'validation_error', 'Confirm that no benefit was delivered before reversing a completed redemption.', { fields: { confirmNoBenefit: 'Confirmation is required.' } });
    }
    const before = { status: reward.status, fulfillment: redemption.rows[0].fulfillment_state };
    const expired = new Date(reward.expires_at).getTime() <= Date.now();
    const nextStatus = expired ? 'expired' : 'issued';
    await client.query('UPDATE rewards SET status = $2 WHERE id = $1', [reward.id, nextStatus]);
    await client.query(
      `UPDATE redemptions SET reversed_at = now(), reversed_by = $2, reversal_reason = $3 WHERE reward_id = $1`,
      [reward.id, actor.id, String(reason).trim().slice(0, 500)]
    );
    await client.query(
      `INSERT INTO reward_events (reward_id, event_type, actor_id, reason, data) VALUES ($1,'redemption_reversed',$2,$3,$4)`,
      [reward.id, actor.id, String(reason).trim(), { before, nextStatus, confirmNoBenefit: Boolean(confirmNoBenefit) }]
    );
    await client.query(
      `INSERT INTO audit_events (actor_id, action, entity_type, entity_id, before_state, after_state, reason)
       VALUES ($1,'redemption_reversed','reward',$2,$3,$4,$5)`,
      [actor.id, reward.id, before, { status: nextStatus }, String(reason).trim()]
    );
    const fresh = await client.query('SELECT * FROM rewards WHERE id = $1', [reward.id]);
    return present(client, fresh.rows[0], false);
  });
}

async function voidReward({ code, actor, reason }) {
  if (!reason || String(reason).trim().length < 3) throw new HttpError(400, 'validation_error', 'A reason is required.', { fields: { reason: 'Enter the reason for voiding this reward.' } });
  return withTransaction(async (client) => {
    const reward = await loadByCode(client, code);
    if (!reward) throw new HttpError(404, 'not_found', 'That code was not found.');
    if (reward.status !== 'issued') throw new HttpError(409, 'not_voidable', 'Only an issued reward that has not been redeemed can be voided.');
    await client.query(`UPDATE rewards SET status = 'voided' WHERE id = $1 AND status = 'issued'`, [reward.id]);
    await client.query(
      `INSERT INTO reward_events (reward_id, event_type, actor_id, reason) VALUES ($1,'voided',$2,$3)`,
      [reward.id, actor.id, String(reason).trim()]
    );
    await client.query(
      `INSERT INTO audit_events (actor_id, action, entity_type, entity_id, before_state, after_state, reason)
       VALUES ($1,'reward_voided','reward',$2,$3,$4,$5)`,
      [actor.id, reward.id, { status: 'issued' }, { status: 'voided' }, String(reason).trim()]
    );
    const fresh = await client.query('SELECT * FROM rewards WHERE id = $1', [reward.id]);
    return present(client, fresh.rows[0], false);
  });
}

async function recordCourtesy({ code, actor, reason }) {
  if (!reason || String(reason).trim().length < 3) throw new HttpError(400, 'validation_error', 'Describe the courtesy action.', { fields: { reason: 'A note is required.' } });
  return withTransaction(async (client) => {
    const reward = await loadByCode(client, code);
    if (!reward) throw new HttpError(404, 'not_found', 'That code was not found.');
    await client.query(
      `INSERT INTO reward_events (reward_id, event_type, actor_id, reason, data)
       VALUES ($1,'courtesy_action',$2,$3,$4)`,
      [reward.id, actor.id, String(reason).trim(), { preservesOriginalTerms: true }]
    );
    await client.query(
      `INSERT INTO audit_events (actor_id, action, entity_type, entity_id, reason, after_state)
       VALUES ($1,'courtesy_action','reward',$2,$3,$4)`,
      [actor.id, reward.id, String(reason).trim(), { preservesOriginalTerms: true }]
    );
    return present(client, reward, false);
  });
}

async function guestLookup(tokenHash) {
  await query(`UPDATE rewards SET status = 'expired' WHERE token_hash = $1 AND status = 'issued' AND expires_at <= now()`, [tokenHash]);
  const result = await query('SELECT * FROM rewards WHERE token_hash = $1', [tokenHash]);
  return result.rows[0] || null;
}

module.exports = {
  lookupReward, redeemReward, setFulfillment, reverseRedemption, voidReward, recordCourtesy, guestLookup, staffView
};
