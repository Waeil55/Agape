import { describe, expect, it } from 'vitest';
import { formatSystemSyncTime } from './SystemHealthDashboard';

describe('system health sync time', () => {
  it('preserves clock-only audit timestamps', () => {
    expect(formatSystemSyncTime('01:58 PM')).toBe('01:58 PM');
  });

  it('fails closed for missing or invalid timestamps', () => {
    expect(formatSystemSyncTime(null)).toBe('Not recorded');
    expect(formatSystemSyncTime('not-a-date')).toBe('Not recorded');
  });

  it('formats valid ISO timestamps without returning Invalid Date', () => {
    expect(formatSystemSyncTime('2026-08-23T14:15:00.000Z')).not.toContain('Invalid');
  });
});
