import { describe, expect, it } from 'vitest';
import { OPERATIONAL_VIEW_PRESETS, getOperationalViewPreset } from './operationalViews';

describe('operational view presets', () => {
  it('provides deterministic queue presets with safe defaults', () => {
    expect(OPERATIONAL_VIEW_PRESETS.map((view) => view.id)).toEqual(['all', 'attention', 'unassigned', 'active', 'late', 'completed']);
    expect(getOperationalViewPreset('unassigned')).toMatchObject({ status: 'Unassigned', driver: 'unassigned' });
    expect(getOperationalViewPreset('unknown').id).toBe('all');
  });
});
