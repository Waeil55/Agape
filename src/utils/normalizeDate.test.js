import { describe, it, expect } from 'vitest';
import { normalizeDateValue } from './normalizeDate';

describe('normalizeDateValue', () => {
  it('preserves ISO dates without UTC shift', () => {
    expect(normalizeDateValue('2026-06-30')).toBe('2026-06-30');
    expect(normalizeDateValue('2026-01-01')).toBe('2026-01-01');
    expect(normalizeDateValue('2026-12-31')).toBe('2026-12-31');
  });

  it('normalizes ISO with extra spaces', () => {
    expect(normalizeDateValue('  2026-06-30  ')).toBe('2026-06-30');
  });

  it('normalizes ISO with single-digit month/day', () => {
    expect(normalizeDateValue('2026-6-5')).toBe('2026-06-05');
  });

  it('handles US format MM/DD/YYYY', () => {
    expect(normalizeDateValue('06/30/2026')).toBe('2026-06-30');
    expect(normalizeDateValue('1/5/2026')).toBe('2026-01-05');
  });

  it('handles US format MM/DD/YY', () => {
    expect(normalizeDateValue('06/30/26')).toBe('2026-06-30');
  });

  it('handles full text dates', () => {
    const result = normalizeDateValue('June 30, 2026');
    expect(result).toBe('2026-06-30');
  });

  it('returns empty for null/undefined/empty', () => {
    expect(normalizeDateValue(null)).toBe('');
    expect(normalizeDateValue(undefined)).toBe('');
    expect(normalizeDateValue('')).toBe('');
    expect(normalizeDateValue('  ')).toBe('');
  });

  it('returns empty for unparseable strings', () => {
    expect(normalizeDateValue('not a date')).toBe('');
  });

  it('handles numeric string dates', () => {
    expect(normalizeDateValue('20260630')).toBe('');
  });
});
