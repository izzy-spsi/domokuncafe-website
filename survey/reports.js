const { query } = require('./db');
const { HttpError } = require('./errors');
const { pacificRange, todayPacific, formatPacific, ZONE } = require('./time');
const { DateTime } = require('luxon');
const { toCsv } = require('./csv');

const DEFINITIONS = {
  surveyResponses: 'Committed, non-test response records unless test data is included. Not unique customers or unique parties.',
  completionRate: 'Saved responses divided by distinct tracked survey attempts started, within a start-date cohort. Recent cohorts are marked incomplete.',
  returningShare: 'Responses answering returning divided by responses answering the first-visit question. Based on the respondent’s report.',
  rewardRedemptionRate: 'Non-reversed redeemed rewards divided by rewards issued in the selected issuance cohort.',
  optionalSignupRate: 'Responses linked to an affirmative email signup divided by saved responses. New subscriber records are counted separately.',
  discoveryShare: 'Responses selecting an option divided by responses answering that question. Multi-select percentages may exceed 100% combined.',
  reportedPartyAttendance: 'Sum of reported party sizes. Reported attendance across responses, never unique visitors or all cafe traffic.'
};

function rangeFrom(input, now = new Date()) {
  try {
    const to = input.to || todayPacific(now);
    const from = input.from || DateTime.fromISO(to, { zone: ZONE }).minus({ days: 29 }).toISODate();
    const bounds = pacificRange(from, to);
    return { from, to, ...bounds };
  } catch (error) {
    throw new HttpError(400, 'validation_error', error.message || 'Those dates are not valid.');
  }
}

function testSql(includeTest, alias) {
  return includeTest ? '' : ` AND ${alias}.test_data = false`;
}

function extraFilters(input, params, alias) {
  const clauses = [];
  if (input.surveyVersionId) {
    params.push(input.surveyVersionId);
    clauses.push(` AND ${alias}.survey_version_id = $${params.length}`);
  }
  if (input.promotionVersionId) {
    params.push(input.promotionVersionId);
    clauses.push(` AND ${alias}.promotion_version_id = $${params.length}`);
  }
  if (input.campaignId) {
    params.push(input.campaignId);
    clauses.push(` AND ${alias}.campaign_id = $${params.length}`);
  }
  if (input.placement) {
    params.push(input.placement);
    clauses.push(` AND ${alias}.placement = $${params.length}`);
  }
  if (input.firstVisit) {
    params.push(input.firstVisit);
    clauses.push(` AND ${alias}.first_visit = $${params.length}`);
  }
  return clauses.join('');
}

async function overview(input) {
  const includeTest = input.includeTest === true || input.includeTest === '1' || input.includeTest === 'true';
  const range = rangeFrom(input);
  const responseParams = [range.start, range.end];
  const responseWhere = `submitted_at >= $1 AND submitted_at < $2${testSql(includeTest, 'survey_responses')}${extraFilters(input, responseParams, 'survey_responses')}`;
  const responses = await query(`SELECT count(*)::int AS count FROM survey_responses WHERE ${responseWhere}`, responseParams);

  const attemptParams = [range.start, range.end];
  let attemptWhere = `started_at >= $1 AND started_at < $2${testSql(includeTest, 'survey_attempts')}`;
  if (input.campaignId) {
    attemptParams.push(input.campaignId);
    attemptWhere += ` AND campaign_id = $${attemptParams.length}`;
  }
  if (input.placement) {
    attemptParams.push(input.placement);
    attemptWhere += ` AND placement = $${attemptParams.length}`;
  }
  if (input.surveyVersionId) {
    attemptParams.push(input.surveyVersionId);
    attemptWhere += ` AND survey_version_id = $${attemptParams.length}`;
  }
  const starts = await query(`SELECT count(*)::int AS count FROM survey_attempts WHERE ${attemptWhere}`, attemptParams);
  const cohort = await query(
    `SELECT count(*)::int AS count FROM survey_responses r
     WHERE r.attempt_id IN (SELECT id FROM survey_attempts WHERE ${attemptWhere})`,
    attemptParams
  );
  const recent = await query(
    `SELECT count(*)::int AS count FROM survey_attempts WHERE ${attemptWhere} AND started_at > now() - interval '24 hours'`,
    attemptParams
  );

  const issuedParams = [range.start, range.end];
  let issuedWhere = `issued_at >= $1 AND issued_at < $2${testSql(includeTest, 'rewards')}`;
  if (input.promotionVersionId) {
    issuedParams.push(input.promotionVersionId);
    issuedWhere += ` AND promotion_version_id = $${issuedParams.length}`;
  }
  const issued = await query(
    `SELECT count(*)::int AS issued,
        count(*) FILTER (WHERE status = 'redeemed')::int AS redeemed,
        count(*) FILTER (WHERE status = 'voided')::int AS voided,
        count(*) FILTER (WHERE status = 'expired' OR (status = 'issued' AND expires_at <= now()))::int AS expired,
        count(*) FILTER (WHERE status = 'issued' AND expires_at > now())::int AS outstanding
     FROM rewards WHERE ${issuedWhere}`,
    issuedParams
  );
  const pending = await query(
    `SELECT count(*)::int AS count FROM redemptions d
     JOIN rewards r ON r.id = d.reward_id
     WHERE d.reversed_at IS NULL AND d.fulfillment_state = 'pending' AND r.issued_at >= $1 AND r.issued_at < $2${testSql(includeTest, 'r')}
     ${input.promotionVersionId ? 'AND r.promotion_version_id = $3' : ''}`,
    input.promotionVersionId ? [range.start, range.end, input.promotionVersionId] : [range.start, range.end]
  );
  const returning = await query(
    `SELECT count(*) FILTER (WHERE first_visit = 'returning')::int AS returning,
            count(*) FILTER (WHERE first_visit IS NOT NULL)::int AS answered
     FROM survey_responses WHERE ${responseWhere}`,
    responseParams
  );
  const signups = await query(
    `SELECT count(DISTINCT l.response_id)::int AS linked
     FROM response_subscriber_links l JOIN survey_responses ON survey_responses.id = l.response_id
     WHERE ${responseWhere}`,
    responseParams
  );
  const newSubscribers = await query(
    `SELECT count(*)::int AS count FROM subscribers s
     WHERE s.created_at >= $1 AND s.created_at < $2 AND s.status = 'subscribed'`,
    [range.start, range.end]
  );
  const attendance = await query(
    `SELECT coalesce(sum(party_size), 0)::int AS reported_attendance,
            count(party_size)::int AS responses_with_party
     FROM survey_responses WHERE ${responseWhere}`,
    responseParams
  );
  const responseCount = responses.rows[0].count;
  const startCount = starts.rows[0].count;
  const issuedCount = issued.rows[0].issued;
  const redeemedCount = issued.rows[0].redeemed;
  return {
    dateBasis: {
      from: range.from,
      to: range.to,
      zone: ZONE,
      responses: 'Survey response submission time, Pacific dates inclusive.',
      attempts: 'Survey attempt start time, Pacific dates inclusive.',
      rewards: 'Reward issuance time, Pacific dates inclusive.',
      redemptions: 'Redemption counts use rewards issued in this issuance cohort, not the redemption timestamp.',
      includeTest
    },
    definitions: DEFINITIONS,
    overview: {
      surveyStarts: startCount,
      surveyResponses: responseCount,
      rewardsIssued: issuedCount,
      rewardsRedeemed: redeemedCount,
      outstandingRewards: issued.rows[0].outstanding,
      pendingFulfillment: pending.rows[0].count,
      expiredRewards: issued.rows[0].expired,
      voidedRewards: issued.rows[0].voided,
      optionalEmailSignups: signups.rows[0].linked,
      newSubscriberRecords: newSubscribers.rows[0].count
    },
    rates: {
      completionRate: startCount ? cohort.rows[0].count / startCount : null,
      completionNumerator: cohort.rows[0].count,
      completionDenominator: startCount,
      cohortIncomplete: recent.rows[0].count > 0,
      returningShare: returning.rows[0].answered ? returning.rows[0].returning / returning.rows[0].answered : null,
      returningNumerator: returning.rows[0].returning,
      returningDenominator: returning.rows[0].answered,
      rewardRedemptionRate: issuedCount ? redeemedCount / issuedCount : null,
      redemptionNumerator: redeemedCount,
      redemptionDenominator: issuedCount,
      optionalSignupRate: responseCount ? signups.rows[0].linked / responseCount : null,
      reportedPartyAttendance: attendance.rows[0].reported_attendance,
      responsesWithPartySize: attendance.rows[0].responses_with_party
    }
  };
}

async function breakdowns(input) {
  const includeTest = input.includeTest === true || input.includeTest === '1' || input.includeTest === 'true';
  const range = rangeFrom(input);
  const params = [range.start, range.end];
  const where = `submitted_at >= $1 AND submitted_at < $2${testSql(includeTest, 'survey_responses')}${extraFilters(input, params, 'survey_responses')}`;
  const rows = await query(
    `SELECT survey_version_id, answers, postal_code, locality, country_code, location_unmapped, discovery_option, first_visit
     FROM survey_responses WHERE ${where} LIMIT 50000`,
    params
  );
  const versions = await query('SELECT id, title, schema FROM survey_versions');
  const byId = new Map(versions.rows.map((row) => [row.id, row]));
  const origins = {};
  const questions = {};
  rows.rows.forEach((row) => {
    const originKey = [row.country_code || 'missing', row.locality || (row.location_unmapped ? 'unmapped' : 'missing'), row.postal_code || ''].join('|');
    origins[originKey] = origins[originKey] || { countryCode: row.country_code, locality: row.locality, postalCode: row.postal_code, unmapped: row.location_unmapped, count: 0 };
    origins[originKey].count += 1;
    const version = byId.get(row.survey_version_id);
    if (!version) return;
    version.schema.questions.forEach((question) => {
      const answer = row.answers[question.id];
      if (answer == null) return;
      const bucketKey = `${version.id}:${question.id}`;
      questions[bucketKey] = questions[bucketKey] || {
        surveyVersionId: version.id,
        surveyTitle: version.title,
        questionId: question.id,
        label: question.label,
        reportKey: question.reportKey || null,
        answered: 0,
        options: {}
      };
      const bucket = questions[bucketKey];
      bucket.answered += 1;
      const optionIds = answer.optionId ? [answer.optionId] : (answer.optionIds || []);
      optionIds.forEach((optionId) => {
        const option = (question.options || []).find((item) => item.id === optionId);
        const label = option ? option.label : optionId;
        bucket.options[optionId] = bucket.options[optionId] || { optionId, label, count: 0 };
        bucket.options[optionId].count += 1;
      });
    });
  });
  const promotions = await query(
    `SELECT v.id, v.name, p.test_data,
        (SELECT count(*) FROM survey_responses r WHERE r.promotion_version_id = v.id AND r.submitted_at >= $1 AND r.submitted_at < $2 ${includeTest ? '' : 'AND r.test_data = false'})::int AS responses,
        (SELECT count(*) FROM rewards w WHERE w.promotion_version_id = v.id AND w.issued_at >= $1 AND w.issued_at < $2 ${includeTest ? '' : 'AND w.test_data = false'})::int AS issued,
        (SELECT count(*) FROM rewards w WHERE w.promotion_version_id = v.id AND w.status = 'redeemed' AND w.issued_at >= $1 AND w.issued_at < $2 ${includeTest ? '' : 'AND w.test_data = false'})::int AS redeemed,
        l.total_issued, l.total_cap, l.daily_cap, l.physical_supply
     FROM promotion_versions v
     JOIN promotions p ON p.id = v.promotion_id
     LEFT JOIN capacity_ledger l ON l.promotion_id = p.id
     WHERE v.state = 'published'`,
    [range.start, range.end]
  );
  return {
    dateBasis: { from: range.from, to: range.to, zone: ZONE, basis: 'Response submission date for answers. Promotion issued counts use issuance time.' },
    definitions: DEFINITIONS,
    origins: Object.values(origins),
    questions: Object.values(questions).map((bucket) => ({
      ...bucket,
      options: Object.values(bucket.options).map((option) => ({
        ...option,
        share: bucket.answered ? option.count / bucket.answered : null
      }))
    })),
    promotions: promotions.rows.map((row) => ({
      promotionVersionId: row.id,
      name: row.name,
      testData: row.test_data,
      responses: row.responses,
      issued: row.issued,
      redeemed: row.redeemed,
      redemptionRate: row.issued ? row.redeemed / row.issued : null,
      totalIssued: row.total_issued,
      totalCap: row.total_cap,
      dailyCap: row.daily_cap,
      physicalSupply: row.physical_supply,
      remaining: remainingOf(row)
    }))
  };
}

function remainingOf(row) {
  const limits = [];
  if (row.total_cap != null) limits.push(Number(row.total_cap) - Number(row.total_issued || 0));
  if (row.physical_supply != null) limits.push(Number(row.physical_supply) - Number(row.total_issued || 0));
  if (!limits.length) return null;
  return Math.min(...limits);
}

async function responseCsv(input) {
  const includeTest = input.includeTest === true || input.includeTest === '1';
  const range = rangeFrom(input);
  const params = [range.start, range.end];
  const where = `r.submitted_at >= $1 AND r.submitted_at < $2${testSql(includeTest, 'r')}${extraFilters(input, params, 'r')}`;
  const result = await query(
    `SELECT r.id, r.submitted_at, r.survey_version_id, v.title AS survey_title, r.promotion_version_id,
            pv.name AS promotion_name, c.slug AS campaign_slug, r.entry_source, r.placement, r.first_visit,
            r.party_size, r.postal_code, r.locality, r.country_code, r.location_unmapped, r.test_data,
            r.answers, w.id AS reward_id, w.code AS reward_code, w.status AS reward_status, v.schema
     FROM survey_responses r
     JOIN survey_versions v ON v.id = r.survey_version_id
     LEFT JOIN promotion_versions pv ON pv.id = r.promotion_version_id
     LEFT JOIN campaigns c ON c.id = r.campaign_id
     LEFT JOIN rewards w ON w.response_id = r.id
     WHERE ${where}
     ORDER BY r.submitted_at`,
    params
  );
  const rows = result.rows.map((row) => {
    const flat = {
      response_id: row.id,
      submitted_at_utc: new Date(row.submitted_at).toISOString(),
      submitted_at_pacific: formatPacific(row.submitted_at),
      survey_version_id: row.survey_version_id,
      survey_title: row.survey_title,
      promotion_version_id: row.promotion_version_id || '',
      promotion_name: row.promotion_name || '',
      campaign_slug: row.campaign_slug || '',
      entry_source: row.entry_source || '',
      placement: row.placement || '',
      first_visit: row.first_visit || '',
      party_size: row.party_size == null ? '' : row.party_size,
      postal_code: row.postal_code || '',
      locality: row.locality || '',
      country_code: row.country_code || '',
      location_unmapped: row.location_unmapped ? 'true' : 'false',
      test_data: row.test_data ? 'true' : 'false',
      reward_id: row.reward_id || '',
      reward_code: row.reward_code || '',
      reward_status: row.reward_status || ''
    };
    (row.schema.questions || []).forEach((question) => {
      flat[`answer:${question.id}:${question.label}`] = answerText(row.answers[question.id], question);
    });
    return flat;
  });
  const headers = rows[0] ? Object.keys(rows[0]) : ['response_id'];
  return toCsv(headers, rows);
}

function dangerousText(text) {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

function answerText(answer, question) {
  if (answer == null) return '';
  if (typeof answer === 'number' || typeof answer === 'string') return String(answer);
  if (answer.choice) {
    if (answer.choice === 'us') return answer.zip || '';
    if (answer.choice === 'outside_us') return [answer.city, answer.countryCode].filter(Boolean).join(', ');
    return answer.choice;
  }
  const ids = answer.optionId ? [answer.optionId] : (answer.optionIds || []);
  const labels = ids.map((id) => {
    const option = (question.options || []).find((item) => item.id === id);
    return option ? option.label : id;
  });
  if (answer.text) labels.push(dangerousText(answer.text));
  return labels.join('; ');
}

async function rewardCsv(input) {
  const includeTest = input.includeTest === true || input.includeTest === '1';
  const range = rangeFrom(input);
  const params = [range.start, range.end];
  let where = `w.issued_at >= $1 AND w.issued_at < $2${testSql(includeTest, 'w')}`;
  if (input.promotionVersionId) {
    params.push(input.promotionVersionId);
    where += ` AND w.promotion_version_id = $${params.length}`;
  }
  const result = await query(
    `SELECT w.id, w.code, w.status, w.issued_at, w.expires_at, w.promotion_version_id, w.test_data,
            v.name AS promotion_name, d.redeemed_at, d.fulfillment_state, d.reversed_at
     FROM rewards w
     JOIN promotion_versions v ON v.id = w.promotion_version_id
     LEFT JOIN redemptions d ON d.reward_id = w.id
     WHERE ${where}
     ORDER BY w.issued_at`,
    params
  );
  const rows = result.rows.map((row) => ({
    reward_id: row.id,
    code: row.code,
    status: row.status === 'issued' && new Date(row.expires_at) <= new Date() ? 'expired' : row.status,
    issued_at_pacific: formatPacific(row.issued_at),
    expires_at_pacific: formatPacific(row.expires_at),
    promotion_version_id: row.promotion_version_id,
    promotion_name: row.promotion_name,
    test_data: row.test_data ? 'true' : 'false',
    redeemed_at_pacific: row.redeemed_at ? formatPacific(row.redeemed_at) : '',
    fulfillment_state: row.fulfillment_state || '',
    reversed_at_pacific: row.reversed_at ? formatPacific(row.reversed_at) : ''
  }));
  return toCsv(Object.keys(rows[0] || { reward_id: '' }), rows);
}

async function opsStatus() {
  const pending = await query(
    `SELECT count(*)::int AS count FROM redemptions d JOIN rewards r ON r.id = d.reward_id
     WHERE d.reversed_at IS NULL AND d.fulfillment_state = 'pending'`
  );
  const low = await query(
    `SELECT p.slug, l.total_issued, l.total_cap, l.physical_supply, l.daily_cap
     FROM capacity_ledger l JOIN promotions p ON p.id = l.promotion_id
     WHERE p.lifecycle IN ('active','scheduled')`
  );
  const failures = await query(
    `SELECT count(*)::int AS count FROM operation_log WHERE kind = 'submit_failed' AND created_at > now() - interval '24 hours'`
  );
  return {
    pendingFulfillment: pending.rows[0].count,
    submitFailuresLast24Hours: failures.rows[0].count,
    capacity: low.rows.map((row) => ({
      slug: row.slug,
      totalIssued: row.total_issued,
      totalCap: row.total_cap,
      physicalSupply: row.physical_supply,
      dailyCap: row.daily_cap,
      low: (row.total_cap != null && row.total_cap - row.total_issued <= 5) ||
        (row.physical_supply != null && row.physical_supply - row.total_issued <= 5)
    }))
  };
}

module.exports = { overview, breakdowns, responseCsv, rewardCsv, opsStatus, DEFINITIONS };
