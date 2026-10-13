const { DateTime } = require('luxon');

const ZONE = 'America/Los_Angeles';

function asDate(value) {
  if (value instanceof Date) return value;
  return new Date(value);
}

function inZone(value) {
  return DateTime.fromJSDate(asDate(value), { zone: 'utc' }).setZone(ZONE);
}

function pacificDate(value) {
  return inZone(value).toISODate();
}

function formatPacific(value) {
  return inZone(value).toFormat("cccc, LLLL d, yyyy, h:mm:ss a 'PT'");
}

function parsePacificLocal(input) {
  if (!input) return null;
  const dt = DateTime.fromISO(String(input), { zone: ZONE });
  if (!dt.isValid) {
    const error = new Error('Enter the date and time in Pacific time.');
    error.code = 'invalid_time';
    throw error;
  }
  return dt.toUTC().toJSDate();
}

function toPacificLocalInput(value) {
  if (!value) return '';
  return inZone(value).toFormat("yyyy-LL-dd'T'HH:mm");
}

function pacificDayBounds(dateIso) {
  const start = DateTime.fromISO(dateIso, { zone: ZONE }).startOf('day');
  if (!start.isValid) {
    const error = new Error('Use a Pacific calendar date, YYYY-MM-DD.');
    error.code = 'invalid_time';
    throw error;
  }
  return {
    start: start.toUTC().toJSDate(),
    end: start.plus({ days: 1 }).toUTC().toJSDate()
  };
}

function pacificRange(fromDate, toDate) {
  const start = pacificDayBounds(fromDate).start;
  const end = pacificDayBounds(toDate).end;
  return { start, end };
}

function todayPacific(now = new Date()) {
  return pacificDate(now);
}

function computeExpiry(rule, issuedAt) {
  const issued = inZone(issuedAt);
  if (!rule || !rule.type) {
    throw new Error('This promotion has no expiration rule.');
  }
  if (rule.type === 'duration') {
    const hours = Number(rule.hours || 0);
    const minutes = Number(rule.minutes || 0);
    return issued.plus({ hours, minutes }).toUTC().toJSDate();
  }
  if (rule.type === 'fixed') {
    return asDate(rule.at);
  }
  const cutoff = rule.cutoffLocal || '23:59:59';
  const [hour, minute, second] = cutoff.split(':').map((part) => Number(part));
  let deadline = DateTime.fromObject({
    year: issued.year,
    month: issued.month,
    day: issued.day,
    hour,
    minute,
    second
  }, { zone: ZONE });
  if (!deadline.isValid) {
    throw new Error('The business-day cutoff is not a real Pacific time on the issue date.');
  }
  if (deadline.toMillis() <= issued.toMillis()) {
    const next = issued.plus({ days: 1 });
    deadline = DateTime.fromObject({
      year: next.year,
      month: next.month,
      day: next.day,
      hour,
      minute,
      second
    }, { zone: ZONE });
  }
  return deadline.toUTC().toJSDate();
}

function expiryPreview(rule, now = new Date()) {
  if (!rule) return '';
  if (rule.type === 'duration') {
    const hours = Number(rule.hours || 0);
    const minutes = Number(rule.minutes || 0);
    const parts = [];
    if (hours) parts.push(`${hours} hour${hours === 1 ? '' : 's'}`);
    if (minutes) parts.push(`${minutes} minute${minutes === 1 ? '' : 's'}`);
    const at = computeExpiry(rule, now);
    return `Expires ${parts.join(' ') || 'immediately'} after submission. If you submit now, the deadline is ${formatPacific(at)}.`;
  }
  if (rule.type === 'same_business_day') {
    const cutoff = rule.cutoffLocal || '23:59:59';
    const at = computeExpiry(rule, now);
    return `Expires at the Pacific business-day cutoff (${cutoff}). If you submit now, the deadline is ${formatPacific(at)}.`;
  }
  if (rule.type === 'fixed') {
    return `Expires ${formatPacific(rule.at)}.`;
  }
  return '';
}

module.exports = {
  ZONE,
  pacificDate,
  formatPacific,
  parsePacificLocal,
  toPacificLocalInput,
  pacificDayBounds,
  pacificRange,
  todayPacific,
  computeExpiry,
  expiryPreview
};
