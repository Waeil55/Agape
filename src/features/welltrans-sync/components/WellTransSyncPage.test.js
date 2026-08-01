import { describe, expect, it } from 'vitest';
import { isValidWellTransServiceDate } from '../utils/welltransDate';

describe('WellTrans service date transition', () => {
  it('accepts an actual ISO service date', () => {
    expect(isValidWellTransServiceDate('2026-07-31')).toBe(true);
  });

  it('rejects the empty intermediate value emitted by native date inputs', () => {
    expect(isValidWellTransServiceDate('')).toBe(false);
  });

  it('rejects impossible calendar dates', () => {
    expect(isValidWellTransServiceDate('2026-02-31')).toBe(false);
  });
});
