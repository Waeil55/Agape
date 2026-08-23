import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const fleetMapSource = readFileSync(new URL('./LiveMapPage.jsx', import.meta.url), 'utf8');
const routeMapSource = readFileSync(new URL('./LiveRouteMap.jsx', import.meta.url), 'utf8');

describe('mobile map performance contract', () => {
  it('reuses fleet marker instances instead of rebuilding them on selection', () => {
    expect(fleetMapSource).toContain('const markersRef = useRef(new Map())');
    expect(fleetMapSource).toContain('let record = markerRecords.get(markerKey)');
    expect(fleetMapSource).toContain('record.marker.setPosition(point)');
    expect(fleetMapSource).not.toContain('markersRef.current = []');
  });

  it('keys nearest-pickup distance refreshes to visible trip data', () => {
    expect(fleetMapSource).toContain('const nearestTripCandidateKey = JSON.stringify');
    expect(fleetMapSource).toContain('nearestTripCandidatesRef.current');
    expect(fleetMapSource).toContain('nearestTripCandidateKey, intelRefreshToken');
  });

  it('bounds Google Maps DOM observation to startup', () => {
    expect(routeMapSource).toContain('observer?.disconnect();');
    expect(routeMapSource).toContain('observer = null;');
    expect(routeMapSource).toContain('leaving it attached');
  });

  it('coalesces resize bursts and fingerprints route geometry', () => {
    expect(fleetMapSource).toContain('resizeFrameRef.current !== null');
    expect(routeMapSource).toContain('resizeFrame.current !== null');
    expect(routeMapSource).toContain('const routePlanKey =');
    expect(routeMapSource).toContain('[calcRoute, clearRoute, routePlanKey]');
    expect(routeMapSource).not.toContain('[ordered, hasGeoStops, driverPosition]');
  });
});
