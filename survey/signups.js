const { withTransaction, query } = require('./db');
const { HttpError } = require('./errors');
const { normalizeEmail, validEmail, plainText } = require('./validate');
const { sha256, randomToken } = require('./codes');
const { CONSENT_VERSIONS } = require('./consent');

async function signUp(input) {
  const email = normalizeEmail(input.email);
  if (!validEmail(email)) throw new HttpError(400, 'validation_error', 'Enter a valid email address.', { fields: { email: 'Enter a valid email address.' } });
  const consent = CONSENT_VERSIONS[input.consentVersion];
  if (!consent) throw new HttpError(400, 'validation_error', 'The signup permission text is out of date. Refresh and try again.', { fields: { consentVersion: 'Refresh the page and try again.' } });
  const name = input.firstName ? plainText(input.firstName, 80) : { value: '' };
  if (name.error) throw new HttpError(400, 'validation_error', name.error, { fields: { firstName: name.error } });
  return withTransaction(async (client) => {
    const response = await client.query('SELECT * FROM survey_responses WHERE signup_token = $1 FOR UPDATE', [input.signupToken]);
    if (!response.rowCount) throw new HttpError(403, 'forbidden', 'This signup link is not valid.');
    const responseId = response.rows[0].id;
    const existingLink = await client.query('SELECT subscriber_id FROM response_subscriber_links WHERE response_id = $1', [responseId]);
    if (existingLink.rowCount) {
      return { ok: true, duplicate: true, subscriberId: existingLink.rows[0].subscriber_id };
    }
    const emailHash = sha256(email);
    const found = await client.query('SELECT * FROM subscribers WHERE email = $1 OR email_hash = $2 FOR UPDATE', [email, emailHash]);
    let subscriber = found.rows[0];
    if (!subscriber) {
      const inserted = await client.query(
        `INSERT INTO subscribers (email, email_hash, first_name, status, unsubscribe_token)
         VALUES ($1,$2,$3,'subscribed',$4) RETURNING *`,
        [email, emailHash, name.value || null, randomToken()]
      );
      subscriber = inserted.rows[0];
    } else {
      await client.query(
        `UPDATE subscribers SET email = $2, email_hash = $3, first_name = COALESCE($4, first_name), status = 'subscribed',
         unsubscribe_token = COALESCE(unsubscribe_token, $5), updated_at = now() WHERE id = $1`,
        [subscriber.id, email, emailHash, name.value || null, randomToken()]
      );
    }
    await client.query(
      `INSERT INTO consent_events (subscriber_id, action, consent_text, consent_version, source)
       VALUES ($1,'opt_in',$2,$3,'survey')`,
      [subscriber.id, consent, input.consentVersion]
    );
    await client.query(
      `INSERT INTO response_subscriber_links (response_id, subscriber_id) VALUES ($1,$2)`,
      [responseId, subscriber.id]
    );
    await client.query(
      `INSERT INTO analytics_events (event_type, response_id, test_data) VALUES ('signup_opted_in', $1, $2)`,
      [responseId, response.rows[0].test_data]
    );
    return { ok: true, duplicate: false, subscriberId: subscriber.id };
  });
}

async function unsubscribe(token) {
  if (!token) throw new HttpError(400, 'validation_error', 'This unsubscribe link is not valid.');
  return withTransaction(async (client) => {
    const found = await client.query('SELECT * FROM subscribers WHERE unsubscribe_token = $1 FOR UPDATE', [token]);
    if (!found.rowCount) throw new HttpError(404, 'not_found', 'This unsubscribe link is not valid.');
    const subscriber = found.rows[0];
    if (subscriber.status === 'unsubscribed' || subscriber.status === 'deleted') return { ok: true, duplicate: true };
    await client.query(`UPDATE subscribers SET status = 'unsubscribed', updated_at = now() WHERE id = $1`, [subscriber.id]);
    await client.query(
      `INSERT INTO consent_events (subscriber_id, action, source) VALUES ($1,'opt_out','unsubscribe_link')`,
      [subscriber.id]
    );
    return { ok: true, duplicate: false };
  });
}

async function deleteContact({ subscriberId, actor, reason }) {
  if (!reason || String(reason).trim().length < 3) throw new HttpError(400, 'validation_error', 'A reason is required.', { fields: { reason: 'Enter a reason.' } });
  return withTransaction(async (client) => {
    const found = await client.query('SELECT * FROM subscribers WHERE id = $1 FOR UPDATE', [subscriberId]);
    if (!found.rowCount) throw new HttpError(404, 'not_found', 'That contact was not found.');
    const subscriber = found.rows[0];
    const emailHash = subscriber.email_hash || (subscriber.email ? sha256(normalizeEmail(subscriber.email)) : null);
    await client.query('DELETE FROM response_subscriber_links WHERE subscriber_id = $1', [subscriber.id]);
    await client.query(
      `UPDATE subscribers SET email = NULL, first_name = NULL, status = 'deleted', email_hash = $2, updated_at = now() WHERE id = $1`,
      [subscriber.id, emailHash]
    );
    await client.query(
      `INSERT INTO consent_events (subscriber_id, action, source) VALUES ($1,'delete','admin')`,
      [subscriber.id]
    );
    await client.query(
      `INSERT INTO audit_events (actor_id, action, entity_type, entity_id, reason, before_state, after_state)
       VALUES ($1,'contact_deleted','subscriber',$2,$3,$4,$5)`,
      [actor.id, subscriber.id, String(reason).trim(), { status: subscriber.status }, { status: 'deleted', emailRemoved: true }]
    );
    return { ok: true };
  });
}

async function subscriberExport(baseUrl) {
  const rows = await query(
    `SELECT s.email, s.first_name, s.status, s.unsubscribe_token,
            (SELECT max(created_at) FROM consent_events c WHERE c.subscriber_id = s.id AND c.action = 'opt_in') AS opt_in_at,
            (SELECT max(consent_version) FROM consent_events c WHERE c.subscriber_id = s.id AND c.action = 'opt_in') AS consent_version
     FROM subscribers s WHERE s.status = 'subscribed' AND s.email IS NOT NULL ORDER BY s.email`
  );
  return rows.rows.map((row) => ({
    email: row.email,
    first_name: row.first_name || '',
    status: row.status,
    consent_version: row.consent_version || '',
    opt_in_at: row.opt_in_at ? new Date(row.opt_in_at).toISOString() : '',
    unsubscribe_url: row.unsubscribe_token ? `${baseUrl}/survey/unsubscribe?token=${encodeURIComponent(row.unsubscribe_token)}` : ''
  }));
}

module.exports = { signUp, unsubscribe, deleteContact, subscriberExport };
