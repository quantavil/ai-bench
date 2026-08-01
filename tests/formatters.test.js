import { describe, expect, test } from 'bun:test';
import { fmtDateTimeCompact, fmt1, fmtDate } from '../src/utils/formatters.js';

describe('formatters', () => {
  test('fmtDateTimeCompact formats timestamp consistently', () => {
    const timestamp = Date.parse('2026-08-01T11:54:39.000Z');
    const result = fmtDateTimeCompact(timestamp);
    expect(result).not.toContain(',');
    expect(result.length).toBeGreaterThan(0);
  });

  test('fmtDateTimeCompact handles null / invalid dates gracefully', () => {
    expect(fmtDateTimeCompact(null)).toBe('');
    expect(fmtDateTimeCompact(undefined)).toBe('');
    expect(fmtDateTimeCompact('invalid')).toBe('');
  });

  test('fmt1 formats single decimal precision', () => {
    expect(fmt1(95.46)).toBe('95.5');
    expect(fmt1(80)).toBe('80.0');
  });
});
