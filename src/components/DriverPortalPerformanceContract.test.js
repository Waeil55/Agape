import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('driver portal performance contract', () => {
  it('batches ETA commits and keeps GPS updates from rebuilding interval work', () => {
    const source = readSource('./DriverPage.jsx');

    expect(source).toContain("activeNav !== 'tools'");
    expect(source).toContain('Promise.all(');
    expect(source).toContain('mergeDriverEtaMeasurements(previous, measurements)');
    expect(source).toContain('const pos = positionRef.current');
    expect(source).toContain('activeTripsRef.current.forEach');
    expect(source).not.toContain('setEtas(prev => ({ ...prev');
    expect(source).not.toContain('}, [driverPosition, activeTrips]);');
  });

  it('keeps route typing structurally shared, session-scoped, and stale estimates ignored', () => {
    const source = readSource('./DriverToolsPage.jsx');
    const textChange = source.match(/const handleTextChange = useCallback\(([\s\S]*?)\n\s{2}}, \[\]\);/)?.[1] || '';

    expect(textChange).toContain('prev.map');
    expect(textChange).not.toContain('normalizeStopOrder');
    expect(source).toContain('const RouteStopRow = React.memo');
    expect(source).not.toMatch(/(?:localStorage|sessionStorage)\.(?:getItem|setItem)\(/);
    expect(source).toContain('<RoutePlanSession key={sessionIdentity}');
    expect(source).toContain('routeRequestVersionRef');
    expect(source).toContain('requestVersion !== routeRequestVersionRef.current');
    expect(source).toContain('React.memo(DriverToolsPage, areDriverToolsPropsEqual)');
  });

  it('contains offscreen trip cards and avoids full-page blur effects', () => {
    const source = readSource('./TaskCard.jsx');

    expect(source).toContain("contentVisibility: 'auto'");
    expect(source).toContain('memo(TaskCard, areTaskCardPropsEqual)');
    expect(source).not.toContain('backdrop-blur');
    expect(source).not.toContain('animate-pulse');
    expect(source).not.toContain("document.body.style.overflow = '';\n      if");
  });

  it('keeps the App mutation callback stable and avoids O(N) actionContextKey strings', () => {
    const appSource = readSource('../App.jsx');
    const driverSource = readSource('./DriverPage.jsx');

    expect(appSource).toContain('const handleDriverTripUpdate = useCallback');
    expect(appSource).toContain('onUpdateTrip={handleDriverTripUpdate}');
    expect(appSource).not.toContain('onUpdateTrip={(tripId, status');
    expect(driverSource).not.toContain('tripActionContextKey');
    expect(driverSource).not.toContain('actionContextKey={tripActionContextKey}');
    expect(driverSource).toContain("activeNav !== 'settings'");
  });
});
