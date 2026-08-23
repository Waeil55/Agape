import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('DriverPage user-scoped route planning state', () => {
  it('clears route, selection, optimization, and guided state when the user key changes', () => {
    const source = readFileSync(new URL('./DriverPage.jsx', import.meta.url), 'utf8');
    const start = source.indexOf('const routePlanningUserKeyRef = useRef(userKey);');
    const end = source.indexOf('const handlePullTouchStart', start);
    const resetEffect = source.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(resetEffect).toContain('if (routePlanningUserKeyRef.current === userKey) return;');
    expect(resetEffect).toContain('setSelectedTrips([]);');
    expect(resetEffect).toContain('setRoutePlanStops(null);');
    expect(resetEffect).toContain('setAiSequence(null);');
    expect(resetEffect).toContain('setGuidedMode(false);');
    expect(resetEffect).toContain('setGuidedSteps([]);');
    expect(resetEffect).toContain('setSequencerTripFilter(null);');
    expect(resetEffect).toContain('setRouteTemplates([]);');
    expect(resetEffect).toContain('setAssignedSequence(null);');
    expect(resetEffect).toContain('}, [defaultTripId, setActiveWorkTripId, setExpandedTripId, userKey]);');
  });
});
