const { parsePacificLocal } = require('./time');
const countries = require('./data/countries.json');

const COUNTRY_CODES = new Set(countries.map((row) => row.code));
const QUESTION_TYPES = new Set(['single', 'multi', 'integer', 'short_text', 'location']);
const REWARD_TYPES = new Set(['percent_off', 'fixed_amount', 'bogo', 'free_food_drink', 'merchandise', 'other_gift']);
const LOCATION_IDS = ['us', 'outside_us', 'prefer_not'];

function plainText(value, max) {
  const text = String(value == null ? '' : value)
    .replace(/<[^>]*>/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .trim();
  if (text.length > max) return { error: `Use ${max} characters or fewer.` };
  return { value: text };
}

function positiveInt(value, label) {
  if (value === '' || value == null) return { value: null };
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) return { error: `${label} must be a positive whole number, or blank for no limit.` };
  return { value: number };
}

function mintId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function validateSurveySchema(schema) {
  const errors = [];
  if (!schema || !Array.isArray(schema.questions) || schema.questions.length === 0) {
    return ['Add at least one question.'];
  }
  if (!Array.isArray(schema.steps) || schema.steps.length === 0) {
    errors.push('Add at least one step.');
  }
  const ids = new Set();
  schema.questions.forEach((question, index) => {
    if (!question || !QUESTION_TYPES.has(question.type)) errors.push(`Question ${index + 1} has an unsupported type.`);
    if (!question.label || !String(question.label).trim()) errors.push(`Question ${index + 1} needs a label.`);
    if (question.id && ids.has(question.id)) errors.push(`Question id ${question.id} is duplicated.`);
    if (question.id) ids.add(question.id);
    if (question.type === 'multi' && question.maxChoices != null) {
      const max = Number(question.maxChoices);
      if (!Number.isInteger(max) || max < 1) errors.push(`${question.label || 'A multi-select'} needs a positive choice limit.`);
    }
    if (question.type === 'integer') {
      const min = Number(question.min);
      const max = Number(question.max);
      if (!Number.isInteger(min) || !Number.isInteger(max) || min < 0 || max < min || max > 999) {
        errors.push(`${question.label || 'A number question'} needs a whole-number range.`);
      }
    }
    if (question.type === 'single' || question.type === 'multi') {
      if (!Array.isArray(question.options) || question.options.length < 1) {
        errors.push(`${question.label || 'A choice question'} needs options.`);
      }
    }
    if (question.type === 'location') {
      const optionIds = (question.options || []).map((option) => option.id);
      LOCATION_IDS.forEach((id) => {
        if (!optionIds.includes(id)) errors.push('The location question must keep United States, Outside the United States, and Prefer not to say.');
      });
    }
  });
  const placed = new Set();
  (schema.steps || []).forEach((step) => {
    if (!step.title || !String(step.title).trim()) errors.push('Every step needs a title.');
    (step.questionIds || []).forEach((id) => {
      if (placed.has(id)) errors.push(`Question ${id} is on more than one step.`);
      placed.add(id);
      if (!ids.has(id)) errors.push(`Step "${step.title || ''}" references a missing question.`);
    });
  });
  ids.forEach((id) => {
    if (!placed.has(id)) errors.push(`Question ${id} is not on a step.`);
  });
  return errors;
}

function acceptableId(id) {
  return typeof id === 'string' && /^[a-z][a-z0-9_]{0,48}$/.test(id);
}

function stabilizeSchema(previous, incoming) {
  const priorQuestions = new Map((previous?.questions || []).map((question) => [question.id, question]));
  const questions = incoming.questions.map((question) => {
    const next = { ...question, label: String(question.label || '').trim() };
    const prior = question.id ? priorQuestions.get(question.id) : null;
    if (prior && (prior.type !== question.type || prior.label !== next.label) && question.type !== 'location') {
      next.id = mintId('q');
    }
    if (!acceptableId(next.id)) next.id = mintId('q');
    if (question.type === 'single' || question.type === 'multi' || question.type === 'location') {
      const priorOptions = new Map((prior?.options || []).map((option) => [option.id, option]));
      next.options = (question.options || []).map((option) => {
        const copy = {
          id: option.id,
          label: String(option.label || '').trim(),
          exclusive: Boolean(option.exclusive),
          allowsText: Boolean(option.allowsText)
        };
        if (question.type === 'location' && LOCATION_IDS.includes(option.id)) return copy;
        const old = priorOptions.get(option.id);
        if (old && (old.label !== copy.label || Boolean(old.exclusive) !== copy.exclusive)) copy.id = mintId('opt');
        if (!acceptableId(copy.id)) copy.id = mintId('opt');
        return copy;
      });
    }
    return next;
  });
  const idMap = new Map(incoming.questions.map((question, index) => [question.id, questions[index].id]));
  const steps = (incoming.steps || []).map((step) => ({
    id: acceptableId(step.id) ? step.id : mintId('step'),
    title: String(step.title || '').trim(),
    questionIds: (step.questionIds || []).map((id) => idMap.get(id) || id)
  }));
  return { questions, steps };
}

function optionById(question, id) {
  return (question.options || []).find((option) => option.id === id);
}

function validateAnswers(schema, raw) {
  const fields = {};
  const answers = {};
  const incoming = raw && typeof raw === 'object' ? raw : {};
  const known = new Set(schema.questions.map((question) => question.id));
  Object.keys(incoming).forEach((key) => {
    if (!known.has(key)) fields[key] = 'That question is not on this survey.';
  });

  schema.questions.forEach((question) => {
    const value = incoming[question.id];
    if (question.type === 'location') {
      const parsed = validateLocation(question, value);
      if (parsed.error) fields[question.id] = parsed.error;
      else answers[question.id] = parsed.value;
      return;
    }
    const empty = value == null || value === '' || (Array.isArray(value) && value.length === 0) ||
      (typeof value === 'object' && !Array.isArray(value) && !value.optionId && !(value.optionIds || []).length);
    if (empty) {
      if (question.required !== false) fields[question.id] = 'This question is required.';
      return;
    }
    if (question.type === 'integer') {
      const number = Number(value);
      if (!Number.isInteger(number) || number < question.min || number > question.max) {
        fields[question.id] = `Enter a whole number from ${question.min} to ${question.max}.`;
      } else answers[question.id] = number;
      return;
    }
    if (question.type === 'short_text') {
      const text = plainText(value, question.maxLength || 200);
      if (text.error) fields[question.id] = text.error;
      else answers[question.id] = text.value;
      return;
    }
    if (question.type === 'single') {
      const optionId = typeof value === 'string' ? value : value.optionId;
      const option = optionById(question, optionId);
      if (!option) {
        fields[question.id] = 'Choose one of the listed answers.';
        return;
      }
      let text = null;
      if (option.allowsText && value && value.text) {
        const parsed = plainText(value.text, 200);
        if (parsed.error) {
          fields[question.id] = parsed.error;
          return;
        }
        text = parsed.value || null;
      }
      answers[question.id] = { optionId: option.id, text };
      return;
    }
    if (question.type === 'multi') {
      const optionIds = Array.isArray(value) ? value : (value.optionIds || []);
      const unique = [...new Set(optionIds)];
      const chosen = unique.map((id) => optionById(question, id)).filter(Boolean);
      if (chosen.length !== unique.length) {
        fields[question.id] = 'Choose only listed answers.';
        return;
      }
      const exclusives = chosen.filter((option) => option.exclusive);
      if (exclusives.length > 1 || (exclusives.length === 1 && chosen.length > 1)) {
        fields[question.id] = 'That answer cannot be combined with other choices.';
        return;
      }
      if (question.maxChoices && chosen.length > question.maxChoices) {
        fields[question.id] = `Choose up to ${question.maxChoices}.`;
        return;
      }
      if (question.required !== false && chosen.length === 0) {
        fields[question.id] = 'Choose at least one answer.';
        return;
      }
      let text = null;
      if (chosen.some((option) => option.allowsText) && value && value.text) {
        const parsed = plainText(value.text, 200);
        if (parsed.error) {
          fields[question.id] = parsed.error;
          return;
        }
        text = parsed.value || null;
      }
      answers[question.id] = { optionIds: chosen.map((option) => option.id), text };
    }
  });

  if (Object.keys(fields).length) return { ok: false, fields };
  const summary = summarize(schema, answers);
  return { ok: true, answers, ...summary };
}

function validateLocation(question, value) {
  if (value == null || value === '' || value.choice == null || value.choice === '' || value.choice === 'skipped') {
    return { value: { choice: 'skipped' } };
  }
  const choice = value.choice;
  if (!LOCATION_IDS.includes(choice)) return { error: 'Choose a location option or skip this question.' };
  if (choice === 'prefer_not') return { value: { choice } };
  if (choice === 'us') {
    const zip = String(value.zip || '').trim();
    if (!/^\d{5}$/.test(zip)) return { error: 'Enter a 5-digit ZIP code, or skip this question.' };
    return { value: { choice, zip } };
  }
  const city = plainText(value.city, 80);
  if (city.error || !city.value) return { error: city.error || 'Enter your home city, or skip this question.' };
  const countryCode = String(value.countryCode || '').trim().toUpperCase();
  if (!COUNTRY_CODES.has(countryCode)) return { error: 'Choose a country, or skip this question.' };
  return { value: { choice, city: city.value, countryCode } };
}

function summarize(schema, answers) {
  let firstVisit = null;
  let partySize = null;
  let discovery = null;
  let location = null;
  schema.questions.forEach((question) => {
    const value = answers[question.id];
    if (!value) return;
    if (question.reportKey === 'first_visit' && value.optionId) {
      firstVisit = value.optionId === 'first_time' ? 'first_time' : 'returning';
    }
    if (question.reportKey === 'party_size' && Number.isInteger(value)) partySize = value;
    if (question.reportKey === 'discovery' && value.optionId) discovery = value.optionId;
    if (question.type === 'location') location = value;
  });
  return { firstVisit, partySize, discovery, location };
}

function eligibilityLines(eligibility) {
  const lines = [];
  if (!eligibility) return lines;
  lines.push(eligibility.dineIn ? 'Dine-in purchase required.' : 'No dine-in requirement is configured.');
  lines.push(eligibility.minimumCents ? `Minimum purchase $${(eligibility.minimumCents / 100).toFixed(2)} before the reward.` : 'No purchase minimum.');
  if (eligibility.excludedCategories && eligibility.excludedCategories.length) {
    lines.push(`Excludes: ${eligibility.excludedCategories.join(', ')}.`);
  }
  lines.push(eligibility.stacking === 'allowed' ? 'May be combined with other offers.' : 'Cannot be combined with other offers.');
  lines.push('First-time and returning guests both qualify.');
  lines.push('One reward per party, per visit. Staff confirm this at the table.');
  return lines;
}

function validatePromotionDraft(input) {
  const errors = {};
  const name = plainText(input.name, 120);
  if (name.error || !name.value) errors.name = name.error || 'Enter a guest-facing name.';
  const description = plainText(input.description, 500);
  if (description.error || !description.value) errors.description = description.error || 'Enter a short description.';
  if (input.imageUrl) {
    const image = String(input.imageUrl).trim();
    if (!/^https:\/\/|^\/survey-assets\//.test(image) || image.length > 500) errors.imageUrl = 'Use an https image URL or a survey brand asset path.';
  }
  if (!REWARD_TYPES.has(input.rewardType)) errors.rewardType = 'Choose a reward type.';
  const guestTerms = plainText(input.guestTerms, 2000);
  if (guestTerms.error) errors.guestTerms = guestTerms.error;
  const staffInstructions = plainText(input.staffInstructions, 2000);
  if (staffInstructions.error) errors.staffInstructions = staffInstructions.error;
  const caps = {
    totalCap: positiveInt(input.totalCap, 'Total limit'),
    dailyCap: positiveInt(input.dailyCap, 'Daily limit'),
    physicalSupply: positiveInt(input.physicalSupply, 'Physical supply')
  };
  Object.entries(caps).forEach(([key, parsed]) => { if (parsed.error) errors[key] = parsed.error; });
  let startsAt = null;
  let endsAt = null;
  try { startsAt = input.startsAtLocal ? parsePacificLocal(input.startsAtLocal) : null; }
  catch (error) { errors.startsAtLocal = error.message; }
  try { endsAt = input.endsAtLocal ? parsePacificLocal(input.endsAtLocal) : null; }
  catch (error) { errors.endsAtLocal = error.message; }
  if (startsAt && endsAt && startsAt >= endsAt) errors.endsAtLocal = 'The end must be after the start. The end is exclusive.';
  const details = validateRewardDetails(input.rewardType, input.rewardDetails || {});
  Object.assign(errors, details.errors);
  const eligibility = normalizeEligibility(input.eligibility || {});
  if (eligibility.error) errors.eligibility = eligibility.error;
  const expiry = normalizeExpiry(input.expiryRule || {});
  if (expiry.error) errors.expiryRule = expiry.error;
  if (Object.keys(errors).length) return { ok: false, fields: errors };
  return {
    ok: true,
    value: {
      name: name.value,
      description: description.value,
      imageUrl: input.imageUrl ? String(input.imageUrl).trim() : null,
      rewardType: input.rewardType,
      rewardDetails: details.value,
      eligibility: eligibility.value,
      guestTerms: guestTerms.value || '',
      staffInstructions: staffInstructions.value || '',
      startsAt,
      endsAt,
      expiryRule: expiry.value,
      totalCap: caps.totalCap.value,
      dailyCap: caps.dailyCap.value,
      physicalSupply: caps.physicalSupply.value,
      redemptionRules: {
        onePerPartyPerVisit: true,
        stacking: eligibility.value.stacking
      }
    }
  };
}

function validateRewardDetails(type, details) {
  const errors = {};
  const items = plainText(details.eligibleItems || '', 300);
  if (items.error) errors.eligibleItems = items.error;
  const quantity = Number(details.quantity == null ? 1 : details.quantity);
  if (!Number.isInteger(quantity) || quantity <= 0) errors.quantity = 'Quantity must be a positive whole number.';
  const value = { eligibleItems: items.value || '', quantity: Number.isInteger(quantity) ? quantity : 1 };
  if (type === 'percent_off') {
    const percent = Number(details.percent);
    if (!Number.isFinite(percent) || percent <= 0 || percent > 100) errors.percent = 'Percentage must be greater than 0 and at most 100.';
    value.percent = percent;
    if (details.maxDiscountCents != null && details.maxDiscountCents !== '') {
      const max = Number(details.maxDiscountCents);
      if (!Number.isInteger(max) || max <= 0) errors.maxDiscountCents = 'Maximum discount must be a positive amount in cents.';
      value.maxDiscountCents = max;
    }
  } else if (type === 'fixed_amount') {
    const amount = Number(details.amountCents);
    if (!Number.isInteger(amount) || amount <= 0) errors.amountCents = 'Enter the discount in USD cents.';
    value.amountCents = amount;
  } else if (type === 'bogo') {
    const purchased = plainText(details.purchasedItem, 200);
    const reward = plainText(details.rewardItem, 200);
    if (purchased.error || !purchased.value) errors.purchasedItem = purchased.error || 'Name the item the guest buys.';
    if (reward.error || !reward.value) errors.rewardItem = reward.error || 'Name the reward item.';
    value.purchasedItem = purchased.value || '';
    value.rewardItem = reward.value || '';
  } else if (!value.eligibleItems) {
    errors.eligibleItems = 'Name the exact item or gift.';
  }
  if (details.variant) {
    const variant = plainText(details.variant, 120);
    if (variant.error) errors.variant = variant.error;
    else value.variant = variant.value;
  }
  return { errors, value };
}

function normalizeEligibility(input) {
  const stacking = input.stacking === 'allowed' ? 'allowed' : 'none';
  let minimumCents = null;
  if (input.minimumCents != null && input.minimumCents !== '') {
    const parsed = Number(input.minimumCents);
    if (!Number.isInteger(parsed) || parsed < 0) return { error: 'Purchase minimum must be a whole number of cents, or blank.' };
    minimumCents = parsed;
  }
  const excluded = Array.isArray(input.excludedCategories)
    ? input.excludedCategories.map((item) => plainText(item, 80).value).filter(Boolean)
    : [];
  return { value: { dineIn: input.dineIn !== false, minimumCents, excludedCategories: excluded, stacking } };
}

function normalizeExpiry(rule) {
  if (!rule.type) return { value: { type: 'same_business_day', cutoffLocal: '23:59:59' } };
  if (rule.type === 'duration') {
    const hours = Number(rule.hours || 0);
    const minutes = Number(rule.minutes || 0);
    if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || minutes < 0 || (hours === 0 && minutes === 0) || minutes > 59) {
      return { error: 'Enter a duration of at least one minute.' };
    }
    return { value: { type: 'duration', hours, minutes } };
  }
  if (rule.type === 'same_business_day') {
    const cutoff = rule.cutoffLocal || '23:59:59';
    if (!/^\d{2}:\d{2}:\d{2}$/.test(cutoff)) return { error: 'Use a cutoff time like 23:59:59.' };
    return { value: { type: 'same_business_day', cutoffLocal: cutoff } };
  }
  if (rule.type === 'fixed') {
    try {
      const at = parsePacificLocal(rule.atLocal);
      if (!at) return { error: 'Enter the fixed expiration in Pacific time.' };
      return { value: { type: 'fixed', at: at.toISOString() } };
    } catch (error) {
      return { error: error.message };
    }
  }
  return { error: 'Choose an expiration rule.' };
}

function activationErrors(version) {
  const errors = [];
  if (!version.guest_terms || String(version.guest_terms).trim().length < 10) errors.push('Write the exact guest terms before activation.');
  if (!version.staff_instructions || String(version.staff_instructions).trim().length < 10) errors.push('Write staff instructions before activation.');
  if (!version.eligibility) errors.push('Complete eligibility before activation.');
  if (!version.expiry_rule || !version.expiry_rule.type) errors.push('Choose an expiration rule before activation.');
  if (!version.starts_at || !version.ends_at) errors.push('Enter the Pacific issuance window before activation.');
  if (version.starts_at && version.ends_at && new Date(version.starts_at) >= new Date(version.ends_at)) errors.push('The issuance end must be after the start.');
  return errors;
}

function normalizeEmail(email) {
  return String(email || '').normalize('NFC').trim().toLowerCase();
}

function validEmail(email) {
  if (!email || email.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

module.exports = {
  plainText,
  validateSurveySchema,
  stabilizeSchema,
  validateAnswers,
  validatePromotionDraft,
  activationErrors,
  eligibilityLines,
  normalizeEmail,
  validEmail,
  COUNTRY_CODES
};
