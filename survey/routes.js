const express = require('express');
const path = require('path');
const { query } = require('./db');
const { HttpError } = require('./errors');
const { resolveEntry, renderIntro } = require('./entry');
const { createAttempt, submitResponse, qrForCode, guestReward } = require('./issuance');
const { lookupReward, redeemReward, setFulfillment, reverseRedemption, voidReward, recordCourtesy, guestLookup } = require('./redemption');
const { signUp, unsubscribe, deleteContact, subscriberExport } = require('./signups');
const { overview, breakdowns, responseCsv, rewardCsv, opsStatus } = require('./reports');
const admin = require('./admin');
const { sha256 } = require('./codes');
const { login, logout, currentUser, requireRole, assertSameOrigin, COOKIE, cookieOptions } = require('./auth');
const { rateLimit } = require('./rate-limit');
const { CURRENT_CONSENT_VERSION, CONSENT_VERSIONS } = require('./consent');
const QRCode = require('qrcode');

const publicDir = path.join(__dirname, 'public');
const router = express.Router();

function wrap(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function db() {
  return { query: (text, params) => query(text, params) };
}

function baseUrl(req) {
  if (process.env.SURVEY_PUBLIC_BASE_URL) return process.env.SURVEY_PUBLIC_BASE_URL.replace(/\/$/, '');
  const proto = req.get('x-forwarded-proto') || req.protocol;
  return `${proto}://${req.get('host')}`;
}

function sendPage(res, name) {
  res.set('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'self'");
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'no-referrer');
  res.set('X-Robots-Tag', 'noindex, nofollow');
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(publicDir, name));
}

router.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'no-referrer');
  res.set('X-Robots-Tag', 'noindex, nofollow');
  res.set('Cache-Control', 'no-store');
  next();
});

router.use('/api', express.json({ limit: '100kb' }));

router.get(['/survey', '/survey/', '/survey/preview', '/survey/preview/'], (req, res) => sendPage(res, 'guest.html'));
router.get(['/survey/c/:slug', '/survey/r/:token', '/survey/privacy', '/survey/unsubscribe'], (req, res) => {
  if (req.path.startsWith('/survey/privacy')) return sendPage(res, 'privacy.html');
  if (req.path.startsWith('/survey/unsubscribe')) return sendPage(res, 'unsubscribe.html');
  return sendPage(res, 'guest.html');
});
router.get(['/survey/admin', '/survey/admin/'], (req, res) => sendPage(res, 'admin.html'));
router.get(['/survey/reports', '/survey/reports/'], (req, res) => sendPage(res, 'reports.html'));
router.get(['/staff/rewards', '/staff/rewards/'], (req, res) => sendPage(res, 'staff.html'));

router.get('/api/survey-health', wrap(async (req, res) => {
  let database = false;
  try {
    await query('SELECT 1');
    database = true;
  } catch (_) { database = false; }
  res.status(database ? 200 : 503).json({ ok: database, service: 'domo-survey' });
}));

router.get('/api/survey-context', rateLimit('CONTEXT', 60, 10 * 60 * 1000), wrap(async (req, res) => {
  const now = new Date();
  const resolved = await resolveEntry(db(), { campaignSlug: req.query.campaign || null, now });
  const privacyUrl = process.env.SURVEY_PRIVACY_URL || '/survey/privacy';
  if (!resolved.survey && resolved.availability.reason === 'unknown_campaign') {
    return res.status(404).json({ error: 'not_found', message: resolved.availability.label, serverTime: now.toISOString() });
  }
  res.json({
    serverTime: now.toISOString(),
    privacyUrl,
    consentVersion: CURRENT_CONSENT_VERSION,
    consentText: CONSENT_VERSIONS[CURRENT_CONSENT_VERSION],
    survey: resolved.survey ? {
      versionId: resolved.survey.version_id,
      title: resolved.survey.title,
      intro: renderIntro(resolved.survey.intro, resolved.offer ? resolved.offer.name : null),
      schema: resolved.survey.schema,
      allowNoReward: resolved.survey.allow_no_reward
    } : null,
    offer: resolved.offer,
    availability: resolved.availability,
    campaign: resolved.campaign ? {
      slug: resolved.campaign.slug,
      channel: resolved.campaign.channel,
      placement: resolved.campaign.placement
    } : null,
    canStart: resolved.canStart,
    currentOfferPath: resolved.currentOfferPath || null,
    testData: Boolean(resolved.testData || (resolved.offer && resolved.offer.testData))
  });
}));

router.post('/api/survey-events', rateLimit('EVENTS', 60, 10 * 60 * 1000), wrap(async (req, res) => {
  if (req.body && req.body.type !== 'survey_opened') return res.status(400).json({ error: 'validation_error', message: 'Unsupported event.' });
  let campaignId = null;
  let testData = false;
  if (req.body.campaignSlug) {
    const campaign = await query('SELECT id, test_data FROM campaigns WHERE slug = $1', [String(req.body.campaignSlug).slice(0, 80)]);
    if (campaign.rowCount) {
      campaignId = campaign.rows[0].id;
      testData = campaign.rows[0].test_data;
    }
  }
  await query(
    `INSERT INTO analytics_events (event_type, campaign_id, test_data) VALUES ('survey_opened', $1, $2)`,
    [campaignId, testData]
  );
  res.json({ ok: true });
}));

router.post('/api/survey-attempts', rateLimit('ATTEMPT', 30, 10 * 60 * 1000), wrap(async (req, res) => {
  const utm = {};
  ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'].forEach((key) => {
    if (req.body && req.body[key]) utm[key] = String(req.body[key]).slice(0, 120);
  });
  const created = await createAttempt({
    campaignSlug: req.body && req.body.campaignSlug ? String(req.body.campaignSlug).slice(0, 80) : null,
    placement: req.body && req.body.placement ? String(req.body.placement).slice(0, 80) : null,
    utm
  });
  res.status(201).json(created);
}));

router.post('/api/survey-responses', rateLimit('SUBMIT', 20, 10 * 60 * 1000), wrap(async (req, res) => {
  const body = req.body || {};
  if (!body.attemptId || !body.idempotencyKey) {
    throw new HttpError(400, 'validation_error', 'The survey session is incomplete. Please start again.', { fields: { attemptId: 'Start the survey again.' } });
  }
  const result = await submitResponse({
    attemptId: body.attemptId,
    idempotencyKey: String(body.idempotencyKey).slice(0, 80),
    answers: body.answers || {},
    decision: body.decision || null,
    acceptedVersionId: body.acceptedVersionId || null,
    baseUrl: baseUrl(req)
  });
  res.status(200).json(result);
}));

router.get('/api/rewards/:token', rateLimit('REWARD', 60, 10 * 60 * 1000), wrap(async (req, res) => {
  const row = await guestLookup(sha256(req.params.token));
  if (!row) return res.status(404).json({ error: 'not_found', message: 'That reward link was not found.' });
  const reward = guestReward(row, { qrDataUrl: await qrForCode(row.code, baseUrl(req)) });
  res.json({ reward });
}));

router.post('/api/survey-signups', rateLimit('SIGNUP', 20, 10 * 60 * 1000), wrap(async (req, res) => {
  const result = await signUp({
    signupToken: req.body && req.body.signupToken,
    email: req.body && req.body.email,
    firstName: req.body && req.body.firstName,
    consentVersion: req.body && req.body.consentVersion
  });
  res.json(result);
}));

router.post('/api/unsubscribe', rateLimit('UNSUBSCRIBE', 20, 10 * 60 * 1000), wrap(async (req, res) => {
  const result = await unsubscribe(req.body && req.body.token);
  res.json(result);
}));

router.post('/api/staff/login', rateLimit('LOGIN', 10, 10 * 60 * 1000), wrap(async (req, res) => {
  assertSameOrigin(req);
  const result = await login(req.body && req.body.email, req.body && req.body.password);
  res.cookie(COOKIE, result.token, cookieOptions());
  res.json({ user: result.user });
}));

router.post('/api/staff/logout', wrap(async (req, res) => {
  await logout(req);
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
}));

router.get('/api/staff/me', wrap(async (req, res) => {
  const user = await currentUser(req);
  if (!user) return res.status(401).json({ error: 'unauthorized', message: 'Sign in required.' });
  res.json({ user });
}));

router.get('/api/staff/rewards/:code', requireRole('staff', 'manager', 'admin'), wrap(async (req, res) => {
  res.json(await lookupReward(req.params.code));
}));

router.post('/api/staff/rewards/:code/redeem', requireRole('staff', 'manager', 'admin'), wrap(async (req, res) => {
  assertSameOrigin(req);
  const result = await redeemReward({
    code: req.params.code,
    actor: req.staff,
    idempotencyKey: req.body && req.body.idempotencyKey ? String(req.body.idempotencyKey).slice(0, 80) : null,
    checkReference: req.body && req.body.checkReference
  });
  res.json(result);
}));

router.post('/api/staff/rewards/:code/fulfill', requireRole('staff', 'manager', 'admin'), wrap(async (req, res) => {
  assertSameOrigin(req);
  res.json(await setFulfillment({
    code: req.params.code,
    actor: req.staff,
    state: req.body && req.body.state,
    note: req.body && req.body.note
  }));
}));

router.post('/api/staff/rewards/:code/reverse', requireRole('manager', 'admin'), wrap(async (req, res) => {
  assertSameOrigin(req);
  res.json(await reverseRedemption({
    code: req.params.code,
    actor: req.staff,
    reason: req.body && req.body.reason,
    confirmNoBenefit: Boolean(req.body && req.body.confirmNoBenefit)
  }));
}));

router.post('/api/staff/rewards/:code/void', requireRole('manager', 'admin'), wrap(async (req, res) => {
  assertSameOrigin(req);
  res.json(await voidReward({ code: req.params.code, actor: req.staff, reason: req.body && req.body.reason }));
}));

router.post('/api/staff/rewards/:code/courtesy', requireRole('manager', 'admin'), wrap(async (req, res) => {
  assertSameOrigin(req);
  res.json(await recordCourtesy({ code: req.params.code, actor: req.staff, reason: req.body && req.body.reason }));
}));

const manager = requireRole('manager', 'admin');
const adminOnly = requireRole('admin');

router.get('/api/admin/surveys', manager, wrap(async (req, res) => res.json({ surveys: await admin.listSurveys() })));
router.get('/api/admin/surveys/:id', manager, wrap(async (req, res) => res.json(await admin.getSurvey(req.params.id))));
router.post('/api/admin/surveys', manager, wrap(async (req, res) => {
  assertSameOrigin(req);
  res.status(201).json(await admin.createSurvey({ title: req.body && req.body.title, actor: req.staff }));
}));
router.post('/api/admin/surveys/:id/duplicate', manager, wrap(async (req, res) => {
  assertSameOrigin(req);
  res.status(201).json(await admin.duplicateSurvey(req.params.id, req.staff));
}));
router.put('/api/admin/surveys/:id/draft', manager, wrap(async (req, res) => {
  assertSameOrigin(req);
  res.json(await admin.saveSurveyDraft(req.params.id, req.body || {}, req.staff));
}));
router.post('/api/admin/surveys/:id/publish', manager, wrap(async (req, res) => {
  assertSameOrigin(req);
  res.json(await admin.publishSurvey(req.params.id, req.staff));
}));
router.post('/api/admin/surveys/:id/archive', manager, wrap(async (req, res) => {
  assertSameOrigin(req);
  res.json(await admin.archiveSurvey(req.params.id, req.staff, req.body && req.body.reason));
}));

router.get('/api/admin/promotions', manager, wrap(async (req, res) => res.json({ promotions: await admin.listPromotions() })));
router.get('/api/admin/promotions/:id', manager, wrap(async (req, res) => res.json(await admin.getPromotion(req.params.id))));
router.post('/api/admin/promotions', manager, wrap(async (req, res) => {
  assertSameOrigin(req);
  res.status(201).json(await admin.createPromotion(req.body || {}, req.staff));
}));
router.put('/api/admin/promotions/:id/draft', manager, wrap(async (req, res) => {
  assertSameOrigin(req);
  res.json(await admin.savePromotionDraft(req.params.id, req.body || {}, req.staff));
}));
router.post('/api/admin/promotions/:id/lifecycle', manager, wrap(async (req, res) => {
  assertSameOrigin(req);
  res.json(await admin.setLifecycle(req.params.id, req.body && req.body.lifecycle, req.staff, req.body && req.body.reason));
}));
router.post('/api/admin/promotions/:id/default', manager, wrap(async (req, res) => {
  assertSameOrigin(req);
  res.json(await admin.setDefault(req.params.id, Boolean(req.body && req.body.isDefault), req.staff));
}));
router.post('/api/admin/promotions/:id/capacity', manager, wrap(async (req, res) => {
  assertSameOrigin(req);
  res.json(await admin.setCapacity(req.params.id, req.body || {}, req.staff));
}));

router.get('/api/admin/campaigns', manager, wrap(async (req, res) => res.json({ campaigns: await admin.listCampaigns() })));
router.post('/api/admin/campaigns', manager, wrap(async (req, res) => {
  assertSameOrigin(req);
  res.status(201).json(await admin.createCampaign(req.body || {}, req.staff));
}));
router.get('/api/admin/campaigns/:id/qr', manager, wrap(async (req, res) => {
  const found = await query('SELECT slug FROM campaigns WHERE id = $1', [req.params.id]);
  if (!found.rowCount) return res.status(404).json({ error: 'not_found', message: 'That campaign was not found.' });
  const url = `${baseUrl(req)}/survey/c/${found.rows[0].slug}`;
  const qrDataUrl = await QRCode.toDataURL(url, { margin: 1, width: 280 });
  res.json({ url, qrDataUrl });
}));

router.get('/api/admin/staff', adminOnly, wrap(async (req, res) => res.json({ staff: await admin.listStaff() })));
router.post('/api/admin/staff', adminOnly, wrap(async (req, res) => {
  assertSameOrigin(req);
  res.status(201).json(await admin.createStaffUser(req.body || {}, req.staff));
}));
router.patch('/api/admin/staff/:id', adminOnly, wrap(async (req, res) => {
  assertSameOrigin(req);
  res.json(await admin.updateStaffUser(req.params.id, req.body || {}, req.staff));
}));
router.post('/api/admin/subscribers/:id/delete', adminOnly, wrap(async (req, res) => {
  assertSameOrigin(req);
  res.json(await deleteContact({ subscriberId: req.params.id, actor: req.staff, reason: req.body && req.body.reason }));
}));

router.get('/api/reports/overview', manager, wrap(async (req, res) => res.json(await overview(req.query))));
router.get('/api/reports/breakdowns', manager, wrap(async (req, res) => res.json(await breakdowns(req.query))));
router.get('/api/reports/export/responses.csv', manager, wrap(async (req, res) => {
  const csv = await responseCsv(req.query);
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.send(csv);
}));
router.get('/api/reports/export/rewards.csv', manager, wrap(async (req, res) => {
  const csv = await rewardCsv(req.query);
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.send(csv);
}));
router.get('/api/reports/export/subscribers.csv', adminOnly, wrap(async (req, res) => {
  const { toCsv } = require('./csv');
  const rows = await subscriberExport(baseUrl(req));
  const headers = ['email', 'first_name', 'status', 'consent_version', 'opt_in_at', 'unsubscribe_url'];
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.send(toCsv(headers, rows));
}));
router.get('/api/admin/ops', manager, wrap(async (req, res) => res.json(await opsStatus())));

router.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error.code === 'no_database') {
    return res.status(503).json({ error: 'unavailable', message: 'The survey database is not configured yet.' });
  }
  if (error instanceof HttpError) {
    return res.status(error.status).json({ error: error.code, message: error.message, ...error.extra });
  }
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'validation_error', message: 'The request could not be read.' });
  }
  console.error('Survey request failed:', error.message);
  return res.status(500).json({ error: 'server_error', message: 'Something went wrong. Your answers are still on this device if you were in the survey. Please try again.' });
});

module.exports = { router };
