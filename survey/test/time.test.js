const test = require('node:test');
const assert = require('node:assert/strict');
const { pacificDate, computeExpiry, formatPacific } = require('../time');

test('Pacific dates follow daylight-saving boundaries', () => {
  assert.equal(pacificDate('2026-06-15T06:59:00Z'), '2026-06-14');
  assert.equal(pacificDate('2026-06-15T07:00:00Z'), '2026-06-15');
  assert.equal(pacificDate('2026-03-08T09:30:00Z'), '2026-03-08');
  assert.equal(pacificDate('2026-03-08T10:30:00Z'), '2026-03-08');
  assert.equal(pacificDate('2026-11-01T08:30:00Z'), '2026-11-01');
  assert.equal(pacificDate('2026-11-01T09:30:00Z'), '2026-11-01');
});

test('same-business-day expiry uses the Pacific cutoff', () => {
  const expiry = computeExpiry({ type: 'same_business_day', cutoffLocal: '23:59:59' }, '2026-06-15T03:00:00Z');
  assert.equal(expiry.toISOString(), '2026-06-15T06:59:59.000Z');
  assert.match(formatPacific(expiry), /June 14, 2026, 11:59:59 PM PT/);
});

test('duration and fixed expiries are absolute instants', () => {
  const duration = computeExpiry({ type: 'duration', hours: 24, minutes: 0 }, '2026-11-01T08:30:00Z');
  assert.equal(duration.toISOString(), '2026-11-02T08:30:00.000Z');
  const fixed = computeExpiry({ type: 'fixed', at: '2026-12-01T07:59:59.000Z' }, '2026-01-01T00:00:00Z');
  assert.equal(fixed.toISOString(), '2026-12-01T07:59:59.000Z');
});
