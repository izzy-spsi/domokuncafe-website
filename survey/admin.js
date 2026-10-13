const { withTransaction, query } = require('./db');
const { HttpError } = require('./errors');
const { validateSurveySchema, stabilizeSchema, validatePromotionDraft, activationErrors, plainText } = require('./validate');
const { hashPassword } = require('./passwords');
const { toPacificLocalInput } = require('./time');

function slugify(value) {
  const slug = String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  return slug || 'item';
}

function assertTestPromotion(testData) {
  if (testData === false && process.env.SURVEY_ALLOW_LIVE_PROMOTIONS !== '1') {
    throw new HttpError(400, 'validation_error', 'Live promotions stay off until the launch reward, terms, and owners are chosen. Keep the test-data flag on.', {
      fields: { testData: 'Test promotions only.' }
    });
  }
}

async function listSurveys() {
  const result = await query(
    `SELECT s.*, v.version_number, v.title, v.state AS version_state
     FROM surveys s LEFT JOIN survey_versions v ON v.id = s.current_version_id
     ORDER BY s.created_at`
  );
  return result.rows;
}

async function getSurvey(id) {
  const survey = await query('SELECT * FROM surveys WHERE id = $1', [id]);
  if (!survey.rowCount) throw new HttpError(404, 'not_found', 'That survey was not found.');
  const versions = await query('SELECT id, version_number, state, title, intro, schema, published_at, created_at FROM survey_versions WHERE survey_id = $1 ORDER BY version_number', [id]);
  return { survey: survey.rows[0], versions: versions.rows };
}

async function createSurvey({ title, actor }) {
  const clean = plainText(title, 160);
  if (!clean.value) throw new HttpError(400, 'validation_error', 'Enter a title.', { fields: { title: 'Enter a title.' } });
  return withTransaction(async (client) => {
    const slug = `${slugify(clean.value)}-${Date.now().toString(36)}`;
    const survey = await client.query(
      `INSERT INTO surveys (slug, status) VALUES ($1, 'draft') RETURNING *`,
      [slug]
    );
    const version = await client.query(
      `INSERT INTO survey_versions (survey_id, version_number, state, title, intro, schema)
       VALUES ($1, 1, 'draft', $2, $3, $4) RETURNING *`,
      [survey.rows[0].id, clean.value, 'Tell us a little about your visit to receive {{current_reward}}.', { questions: [], steps: [{ id: 'step_1', title: 'About your visit', questionIds: [] }] }]
    );
    await client.query('UPDATE surveys SET current_version_id = $2 WHERE id = $1', [survey.rows[0].id, version.rows[0].id]);
    await audit(client, actor, 'survey_created', 'survey', survey.rows[0].id, null, { title: clean.value });
    return version.rows[0];
  });
}

async function duplicateSurvey(id, actor) {
  const source = await getSurvey(id);
  const published = [...source.versions].reverse().find((version) => version.state === 'published') || source.versions[source.versions.length - 1];
  return withTransaction(async (client) => {
    const survey = await client.query(`INSERT INTO surveys (slug, status, allow_no_reward) VALUES ($1, 'draft', $2) RETURNING *`, [`${source.survey.slug}-copy-${Date.now().toString(36)}`, source.survey.allow_no_reward]);
    const schema = remapSchema(published.schema);
    const version = await client.query(
      `INSERT INTO survey_versions (survey_id, version_number, state, title, intro, schema)
       VALUES ($1, 1, 'draft', $2, $3, $4) RETURNING *`,
      [survey.rows[0].id, `${published.title} copy`, published.intro, schema]
    );
    await client.query('UPDATE surveys SET current_version_id = $2 WHERE id = $1', [survey.rows[0].id, version.rows[0].id]);
    await audit(client, actor, 'survey_duplicated', 'survey', survey.rows[0].id, { from: id }, { title: version.rows[0].title });
    return version.rows[0];
  });
}

function remapSchema(schema) {
  const map = new Map();
  const questions = (schema.questions || []).map((question) => {
    const id = `q_${Math.random().toString(36).slice(2, 10)}`;
    map.set(question.id, id);
    return {
      ...question,
      id,
      options: (question.options || []).map((option) => ({
        ...option,
        id: question.type === 'location' ? option.id : `opt_${Math.random().toString(36).slice(2, 10)}`
      }))
    };
  });
  const steps = (schema.steps || []).map((step) => ({
    ...step,
    id: `step_${Math.random().toString(36).slice(2, 8)}`,
    questionIds: (step.questionIds || []).map((id) => map.get(id) || id)
  }));
  return { questions, steps };
}

async function saveSurveyDraft(id, body, actor) {
  const title = plainText(body.title, 160);
  const intro = plainText(body.intro, 2000);
  if (!title.value) throw new HttpError(400, 'validation_error', 'Enter a title.', { fields: { title: 'Enter a title.' } });
  if (!intro.value) throw new HttpError(400, 'validation_error', 'Enter an introduction.', { fields: { intro: 'Enter an introduction.' } });
  return withTransaction(async (client) => {
    const survey = await client.query('SELECT * FROM surveys WHERE id = $1 FOR UPDATE', [id]);
    if (!survey.rowCount) throw new HttpError(404, 'not_found', 'That survey was not found.');
    if (survey.rows[0].status === 'archived') throw new HttpError(409, 'archived', 'Archived surveys cannot be edited. Duplicate one to make a draft.');
    const previous = await client.query(
      `SELECT schema FROM survey_versions WHERE survey_id = $1 AND state = 'published' ORDER BY version_number DESC LIMIT 1`,
      [id]
    );
    const schema = stabilizeSchema(previous.rows[0] && previous.rows[0].schema, body.schema || { questions: [], steps: [] });
    const errors = validateSurveySchema(schema);
    if (errors.length) throw new HttpError(400, 'validation_error', errors[0], { fields: { schema: errors.join(' ') } });
    const draft = await client.query(`SELECT * FROM survey_versions WHERE survey_id = $1 AND state = 'draft' ORDER BY version_number DESC LIMIT 1`, [id]);
    let saved;
    if (draft.rowCount) {
      saved = await client.query(
        `UPDATE survey_versions SET title = $2, intro = $3, schema = $4 WHERE id = $1 RETURNING *`,
        [draft.rows[0].id, title.value, intro.value, schema]
      );
    } else {
      const max = await client.query('SELECT coalesce(max(version_number), 0) AS n FROM survey_versions WHERE survey_id = $1', [id]);
      saved = await client.query(
        `INSERT INTO survey_versions (survey_id, version_number, state, title, intro, schema)
         VALUES ($1,$2,'draft',$3,$4,$5) RETURNING *`,
        [id, Number(max.rows[0].n) + 1, title.value, intro.value, schema]
      );
    }
    if (body.allowNoReward != null) {
      await client.query('UPDATE surveys SET allow_no_reward = $2, updated_at = now() WHERE id = $1', [id, Boolean(body.allowNoReward)]);
    }
    await audit(client, actor, 'survey_draft_saved', 'survey', id, null, { versionId: saved.rows[0].id });
    return saved.rows[0];
  });
}

async function publishSurvey(id, actor) {
  return withTransaction(async (client) => {
    const draft = await client.query(`SELECT * FROM survey_versions WHERE survey_id = $1 AND state = 'draft' ORDER BY version_number DESC LIMIT 1 FOR UPDATE`, [id]);
    if (!draft.rowCount) throw new HttpError(409, 'no_draft', 'There is no draft to publish.');
    const errors = validateSurveySchema(draft.rows[0].schema);
    if (errors.length) throw new HttpError(400, 'validation_error', errors[0], { fields: { schema: errors.join(' ') } });
    const published = await client.query(
      `UPDATE survey_versions SET state = 'published', published_at = now() WHERE id = $1 RETURNING *`,
      [draft.rows[0].id]
    );
    await client.query(`UPDATE surveys SET status = 'published', current_version_id = $2, updated_at = now() WHERE id = $1`, [id, published.rows[0].id]);
    await audit(client, actor, 'survey_published', 'survey', id, null, { versionId: published.rows[0].id, versionNumber: published.rows[0].version_number });
    return published.rows[0];
  });
}

async function archiveSurvey(id, actor, reason) {
  return withTransaction(async (client) => {
    const before = await client.query('SELECT status FROM surveys WHERE id = $1 FOR UPDATE', [id]);
    if (!before.rowCount) throw new HttpError(404, 'not_found', 'That survey was not found.');
    await client.query(`UPDATE surveys SET status = 'archived', updated_at = now() WHERE id = $1`, [id]);
    await audit(client, actor, 'survey_archived', 'survey', id, before.rows[0], { status: 'archived' }, reason || 'archive');
    return { ok: true };
  });
}

function versionToJson(row, ledger) {
  return {
    id: row.id,
    promotionId: row.promotion_id,
    versionNumber: row.version_number,
    state: row.state,
    name: row.name,
    description: row.description,
    imageUrl: row.image_url,
    rewardType: row.reward_type,
    rewardDetails: row.reward_details,
    eligibility: row.eligibility,
    guestTerms: row.guest_terms,
    staffInstructions: row.staff_instructions,
    startsAtLocal: toPacificLocalInput(row.starts_at),
    endsAtLocal: toPacificLocalInput(row.ends_at),
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    expiryRule: expiryForEditor(row.expiry_rule),
    totalCap: row.total_cap,
    dailyCap: row.daily_cap,
    physicalSupply: row.physical_supply,
    redemptionRules: row.redemption_rules,
    testData: row.test_data,
    ledger: ledger || null
  };
}

function expiryForEditor(rule) {
  if (!rule) return { type: 'same_business_day', cutoffLocal: '23:59:59' };
  if (rule.type === 'fixed') {
    return { type: 'fixed', atLocal: toPacificLocalInput(rule.at) };
  }
  return rule;
}

async function listPromotions() {
  const result = await query(
    `SELECT p.*, v.name, v.version_number, l.total_issued, l.total_cap AS live_total_cap, l.daily_cap AS live_daily_cap, l.physical_supply AS live_supply
     FROM promotions p
     LEFT JOIN promotion_versions v ON v.id = p.current_version_id
     LEFT JOIN capacity_ledger l ON l.promotion_id = p.id
     ORDER BY p.created_at`
  );
  return result.rows;
}

async function getPromotion(id) {
  const promo = await query('SELECT * FROM promotions WHERE id = $1', [id]);
  if (!promo.rowCount) throw new HttpError(404, 'not_found', 'That promotion was not found.');
  const versions = await query('SELECT * FROM promotion_versions WHERE promotion_id = $1 ORDER BY version_number', [id]);
  const ledger = await query('SELECT * FROM capacity_ledger WHERE promotion_id = $1', [id]);
  return {
    promotion: promo.rows[0],
    versions: versions.rows.map((row) => versionToJson(row, null)),
    ledger: ledger.rows[0] || null
  };
}

async function createPromotion(body, actor) {
  assertTestPromotion(body.testData);
  const draft = validatePromotionDraft({ ...body, rewardType: body.rewardType || 'percent_off', rewardDetails: body.rewardDetails || { percent: 10, quantity: 1, eligibleItems: 'TEST item' } });
  if (!draft.ok) throw new HttpError(400, 'validation_error', 'Check the promotion fields.', { fields: draft.fields });
  return withTransaction(async (client) => {
    const slug = `${slugify(draft.value.name)}-${Date.now().toString(36)}`;
    const promo = await client.query(
      `INSERT INTO promotions (slug, lifecycle, test_data) VALUES ($1, 'draft', $2) RETURNING *`,
      [slug, body.testData !== false]
    );
    await client.query('INSERT INTO capacity_ledger (promotion_id) VALUES ($1)', [promo.rows[0].id]);
    const version = await insertVersion(client, promo.rows[0].id, 1, draft.value, body.testData !== false);
    await client.query('UPDATE promotions SET current_version_id = $2 WHERE id = $1', [promo.rows[0].id, version.id]);
    await audit(client, actor, 'promotion_created', 'promotion', promo.rows[0].id, null, { name: draft.value.name, testData: body.testData !== false });
    return version;
  });
}

async function insertVersion(client, promotionId, number, value, testData) {
  const result = await client.query(
    `INSERT INTO promotion_versions (
      promotion_id, version_number, state, name, description, image_url, reward_type, reward_details,
      eligibility, guest_terms, staff_instructions, starts_at, ends_at, expiry_rule, total_cap, daily_cap,
      physical_supply, redemption_rules, test_data
    ) VALUES ($1,$2,'draft',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
    [
      promotionId, number, value.name, value.description, value.imageUrl, value.rewardType, value.rewardDetails,
      value.eligibility, value.guestTerms, value.staffInstructions, value.startsAt, value.endsAt, value.expiryRule,
      value.totalCap, value.dailyCap, value.physicalSupply, value.redemptionRules, testData
    ]
  );
  return result.rows[0];
}

async function savePromotionDraft(id, body, actor) {
  const promo = await query('SELECT * FROM promotions WHERE id = $1', [id]);
  if (!promo.rowCount) throw new HttpError(404, 'not_found', 'That promotion was not found.');
  assertTestPromotion(body.testData);
  const draft = validatePromotionDraft(body);
  if (!draft.ok) throw new HttpError(400, 'validation_error', 'Check the promotion fields.', { fields: draft.fields });
  const testData = body.testData !== false && promo.rows[0].test_data !== false ? promo.rows[0].test_data : body.testData !== false;
  return withTransaction(async (client) => {
    const existing = await client.query(`SELECT * FROM promotion_versions WHERE promotion_id = $1 AND state = 'draft' ORDER BY version_number DESC LIMIT 1 FOR UPDATE`, [id]);
    let saved;
    if (existing.rowCount) {
      saved = await client.query(
        `UPDATE promotion_versions SET name=$2, description=$3, image_url=$4, reward_type=$5, reward_details=$6,
         eligibility=$7, guest_terms=$8, staff_instructions=$9, starts_at=$10, ends_at=$11, expiry_rule=$12,
         total_cap=$13, daily_cap=$14, physical_supply=$15, redemption_rules=$16, test_data=$17
         WHERE id=$1 RETURNING *`,
        [existing.rows[0].id, draft.value.name, draft.value.description, draft.value.imageUrl, draft.value.rewardType,
          draft.value.rewardDetails, draft.value.eligibility, draft.value.guestTerms, draft.value.staffInstructions,
          draft.value.startsAt, draft.value.endsAt, draft.value.expiryRule, draft.value.totalCap, draft.value.dailyCap,
          draft.value.physicalSupply, draft.value.redemptionRules, testData]
      );
    } else {
      const max = await client.query('SELECT coalesce(max(version_number),0) AS n FROM promotion_versions WHERE promotion_id=$1', [id]);
      saved = { rows: [await insertVersion(client, id, Number(max.rows[0].n) + 1, draft.value, testData)] };
    }
    await audit(client, actor, 'promotion_draft_saved', 'promotion', id, null, { versionId: saved.rows[0].id });
    return saved.rows[0];
  });
}

async function setLifecycle(id, lifecycle, actor, reason) {
  if (!['draft', 'scheduled', 'active', 'paused', 'ended'].includes(lifecycle)) {
    throw new HttpError(400, 'validation_error', 'Unknown lifecycle.', { fields: { lifecycle: 'Choose draft, scheduled, active, paused, or ended.' } });
  }
  return withTransaction(async (client) => {
    const promo = await client.query('SELECT * FROM promotions WHERE id = $1 FOR UPDATE', [id]);
    if (!promo.rowCount) throw new HttpError(404, 'not_found', 'That promotion was not found.');
    let versionId = promo.rows[0].current_version_id;
    if (lifecycle === 'active' || lifecycle === 'scheduled') {
      const draft = await client.query(`SELECT * FROM promotion_versions WHERE promotion_id = $1 AND state = 'draft' ORDER BY version_number DESC LIMIT 1 FOR UPDATE`, [id]);
      const current = versionId ? await client.query('SELECT * FROM promotion_versions WHERE id = $1', [versionId]) : { rows: [] };
      const candidate = draft.rows[0] || current.rows[0];
      if (!candidate) throw new HttpError(409, 'no_version', 'Save a promotion version before activation.');
      const problems = activationErrors(candidate);
      if (problems.length) throw new HttpError(400, 'validation_error', problems[0], { fields: { activation: problems.join(' ') } });
      if (candidate.state === 'draft') {
        const published = await client.query(`UPDATE promotion_versions SET state = 'published', published_at = now() WHERE id = $1 RETURNING *`, [candidate.id]);
        versionId = published.rows[0].id;
        await client.query('UPDATE promotions SET current_version_id = $2 WHERE id = $1', [id, versionId]);
        await client.query(
          `UPDATE capacity_ledger SET total_cap = $2, daily_cap = $3, physical_supply = $4, updated_at = now() WHERE promotion_id = $1`,
          [id, published.rows[0].total_cap, published.rows[0].daily_cap, published.rows[0].physical_supply]
        );
      }
      const version = (await client.query('SELECT * FROM promotion_versions WHERE id = $1', [versionId])).rows[0];
      const now = new Date();
      if (lifecycle === 'active' && now < new Date(version.starts_at)) lifecycle = 'scheduled';
      if (now >= new Date(version.ends_at)) throw new HttpError(400, 'validation_error', 'The issuance window has already ended.', { fields: { endsAtLocal: 'Choose a future end.' } });
    }
    const before = promo.rows[0].lifecycle;
    await client.query('UPDATE promotions SET lifecycle = $2, updated_at = now() WHERE id = $1', [id, lifecycle]);
    await audit(client, actor, 'promotion_lifecycle', 'promotion', id, { lifecycle: before }, { lifecycle }, reason || null);
    return { lifecycle };
  });
}

async function setDefault(id, isDefault, actor) {
  return withTransaction(async (client) => {
    if (isDefault) {
      await client.query('UPDATE promotions SET is_default = false WHERE is_default = true AND id <> $1', [id]);
      await client.query('UPDATE promotions SET is_default = true, updated_at = now() WHERE id = $1', [id]);
    } else {
      await client.query('UPDATE promotions SET is_default = false, updated_at = now() WHERE id = $1', [id]);
    }
    await audit(client, actor, 'promotion_default', 'promotion', id, null, { isDefault: Boolean(isDefault) });
    return { ok: true };
  });
}

async function setCapacity(id, body, actor) {
  if (!body.reason || String(body.reason).trim().length < 3) {
    throw new HttpError(400, 'validation_error', 'Say why the capacity is changing.', { fields: { reason: 'A reason is required.' } });
  }
  const total = parseCap(body.totalCap, 'totalCap');
  const daily = parseCap(body.dailyCap, 'dailyCap');
  const physical = parseCap(body.physicalSupply, 'physicalSupply');
  return withTransaction(async (client) => {
    const before = await client.query('SELECT * FROM capacity_ledger WHERE promotion_id = $1 FOR UPDATE', [id]);
    if (!before.rowCount) throw new HttpError(404, 'not_found', 'That promotion was not found.');
    const after = await client.query(
      `UPDATE capacity_ledger SET total_cap = $2, daily_cap = $3, physical_supply = $4, updated_at = now() WHERE promotion_id = $1 RETURNING *`,
      [id, total, daily, physical]
    );
    await audit(client, actor, 'capacity_change', 'promotion', id, {
      totalCap: before.rows[0].total_cap, dailyCap: before.rows[0].daily_cap, physicalSupply: before.rows[0].physical_supply, totalIssued: before.rows[0].total_issued
    }, {
      totalCap: after.rows[0].total_cap, dailyCap: after.rows[0].daily_cap, physicalSupply: after.rows[0].physical_supply, totalIssued: after.rows[0].total_issued
    }, String(body.reason).trim());
    return after.rows[0];
  });
}

function parseCap(value, field) {
  if (value === '' || value == null) return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new HttpError(400, 'validation_error', 'Caps must be positive whole numbers, or blank for unlimited.', { fields: { [field]: 'Enter a positive whole number or leave blank.' } });
  }
  return number;
}

async function listCampaigns() {
  const result = await query(
    `SELECT c.*, p.slug AS promotion_slug, p.lifecycle FROM campaigns c JOIN promotions p ON p.id = c.promotion_id ORDER BY c.created_at`
  );
  return result.rows;
}

async function createCampaign(body, actor) {
  const name = plainText(body.name, 120);
  const slug = slugify(body.slug || body.name);
  if (!name.value) throw new HttpError(400, 'validation_error', 'Name the campaign.', { fields: { name: 'Enter a name.' } });
  if (!/^[a-z0-9-]{2,60}$/.test(slug)) throw new HttpError(400, 'validation_error', 'Use a short slug.', { fields: { slug: 'Use lowercase letters, numbers, and hyphens.' } });
  const channel = plainText(body.channel, 60);
  const placement = plainText(body.placement, 60);
  if (!channel.value || !placement.value) throw new HttpError(400, 'validation_error', 'Channel and placement are required.', { fields: { channel: 'Enter a channel and placement.' } });
  return withTransaction(async (client) => {
    const promo = await client.query('SELECT * FROM promotions WHERE id = $1', [body.promotionId]);
    if (!promo.rowCount || !promo.rows[0].current_version_id) throw new HttpError(400, 'validation_error', 'Choose a promotion that has a saved version.', { fields: { promotionId: 'Choose a promotion.' } });
    const survey = await client.query(`SELECT current_version_id FROM surveys WHERE status = 'published' ORDER BY updated_at DESC LIMIT 1`);
    const inserted = await client.query(
      `INSERT INTO campaigns (slug, name, promotion_id, promotion_version_id, survey_version_id, channel, placement, utm, test_data)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [slug, name.value, promo.rows[0].id, promo.rows[0].current_version_id, survey.rows[0] ? survey.rows[0].current_version_id : null,
        channel.value, placement.value, body.utm || {}, promo.rows[0].test_data]
    );
    await audit(client, actor, 'campaign_created', 'campaign', inserted.rows[0].id, null, { slug });
    return inserted.rows[0];
  });
}

async function listStaff() {
  const result = await query('SELECT id, email, name, role, active, created_at FROM staff_users ORDER BY created_at');
  return result.rows;
}

async function createStaffUser(body, actor) {
  const email = String(body.email || '').trim().toLowerCase();
  const name = plainText(body.name, 80);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'validation_error', 'Enter an email.', { fields: { email: 'Enter a valid email.' } });
  if (!name.value) throw new HttpError(400, 'validation_error', 'Enter a name.', { fields: { name: 'Enter a name.' } });
  if (!['staff', 'manager', 'admin'].includes(body.role)) throw new HttpError(400, 'validation_error', 'Choose a role.', { fields: { role: 'Choose staff, manager, or admin.' } });
  if (!body.password || String(body.password).length < 10) throw new HttpError(400, 'validation_error', 'Use a password of at least 10 characters.', { fields: { password: 'Use at least 10 characters.' } });
  const passwordHash = await hashPassword(body.password);
  return withTransaction(async (client) => {
    const inserted = await client.query(
      `INSERT INTO staff_users (email, name, password_hash, role) VALUES ($1,$2,$3,$4) RETURNING id, email, name, role, active`,
      [email, name.value, passwordHash, body.role]
    );
    await audit(client, actor, 'staff_created', 'staff_user', inserted.rows[0].id, null, { email, role: body.role });
    return inserted.rows[0];
  });
}

async function updateStaffUser(id, body, actor) {
  return withTransaction(async (client) => {
    const before = await client.query('SELECT id, role, active FROM staff_users WHERE id = $1 FOR UPDATE', [id]);
    if (!before.rowCount) throw new HttpError(404, 'not_found', 'That account was not found.');
    const role = body.role || before.rows[0].role;
    if (!['staff', 'manager', 'admin'].includes(role)) throw new HttpError(400, 'validation_error', 'Choose a role.', { fields: { role: 'Choose a role.' } });
    const active = body.active == null ? before.rows[0].active : Boolean(body.active);
    const updated = await client.query('UPDATE staff_users SET role = $2, active = $3 WHERE id = $1 RETURNING id, email, name, role, active', [id, role, active]);
    if (body.password) {
      if (String(body.password).length < 10) throw new HttpError(400, 'validation_error', 'Use a password of at least 10 characters.', { fields: { password: 'Use at least 10 characters.' } });
      await client.query('UPDATE staff_users SET password_hash = $2 WHERE id = $1', [id, await hashPassword(body.password)]);
    }
    await audit(client, actor, 'staff_updated', 'staff_user', id, before.rows[0], { role, active });
    return updated.rows[0];
  });
}

async function audit(client, actor, action, entityType, entityId, before, after, reason) {
  await client.query(
    `INSERT INTO audit_events (actor_id, action, entity_type, entity_id, before_state, after_state, reason)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [actor ? actor.id : null, action, entityType, entityId, before || null, after || null, reason || null]
  );
}

module.exports = {
  listSurveys, getSurvey, createSurvey, duplicateSurvey, saveSurveyDraft, publishSurvey, archiveSurvey,
  listPromotions, getPromotion, createPromotion, savePromotionDraft, setLifecycle, setDefault, setCapacity,
  listCampaigns, createCampaign, listStaff, createStaffUser, updateStaffUser, versionToJson
};
