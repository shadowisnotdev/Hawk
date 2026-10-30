import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTime, formatTime, parseCurrency } from '../src/core/utils/parsers.js';

test('Universal Time Parser accurately parses compact time formats', () => {
  assert.equal(parseTime('10s'), 10_000);
  assert.equal(parseTime('15m'), 15 * 60_000);
  assert.equal(parseTime('1h'), 3_600_000);
  assert.equal(parseTime('1h30m'), 5_400_000);
  assert.equal(parseTime('2d12h'), (2 * 86_400 + 12 * 3600) * 1000);
  assert.equal(parseTime('1w'), 7 * 86_400 * 1000);

  // Invalid formats return null
  assert.equal(parseTime(''), null);
  assert.equal(parseTime('invalid'), null);
  assert.equal(parseTime('-5m'), null);
});

test('Universal Time Formatter formats milliseconds into human-readable string', () => {
  assert.equal(formatTime(10_000), '10s');
  assert.equal(formatTime(5_400_000), '1h 30m');
  assert.equal(formatTime(86_400_000 * 2), '2d');
  assert.equal(formatTime(0), '0s');
});

test('Universal Currency Parser handles scientific, shorthand, and standard numbers', () => {
  // Scientific notation
  assert.equal(parseCurrency('1e6'), 1_000_000);
  assert.equal(parseCurrency('2.5e3'), 2500);

  // Shorthand suffixes
  assert.equal(parseCurrency('5k'), 5000);
  assert.equal(parseCurrency('2.5m'), 2_500_000);
  assert.equal(parseCurrency('1b'), 1_000_000_000);
  assert.equal(parseCurrency('10t'), 10_000_000_000_000);

  // Standard numbers and commas
  assert.equal(parseCurrency('500'), 500);
  assert.equal(parseCurrency('1,000,000'), 1_000_000);

  // Invalid returns null
  assert.equal(parseCurrency('abc'), null);
  assert.equal(parseCurrency('-50'), null);
});

