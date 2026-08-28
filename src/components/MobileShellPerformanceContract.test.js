import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readComponent = (name) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const adminSource = readComponent('MobileAdminPage.jsx');
const reportsSource = readComponent('MobileReportsPage.jsx');
const menuSource = readComponent('MobileMenuPage.jsx');
const shellSource = readComponent('EnterpriseDashboard.jsx');
const accessControlSource = readFileSync(new URL('../utils/accessControl.js', import.meta.url), 'utf8');

describe('mobile shell interaction performance contract', () => {
  it('indexes driver identity once for admin trip assignment lookups', () => {
    const lookupStart = adminSource.indexOf('const activeTripsByDriver = useMemo');
    const lookupEnd = adminSource.indexOf('const driverLiveState = useMemo', lookupStart);
    const lookupBlock = adminSource.slice(lookupStart, lookupEnd);

    expect(adminSource).toContain('buildDriverIndex(drivers)');
    expect(lookupBlock).toContain('findDriverInIndex(driverIndex, trip)');
    expect(lookupBlock).not.toContain('drivers.find');
    expect(adminSource).toContain('export const MOBILE_ADMIN_LIST_PAGE_SIZE = 40');
    expect(adminSource).toContain('useDeferredValue(driverQuery)');
    expect(adminSource).toContain('visibleDrivers.map');
    expect(adminSource).toContain('visibleUsers.map');
    expect(adminSource).toContain('export default React.memo(MobileAdminPage)');
  });

  it('bounds report DOM size, defers search work, and caps bulk review concurrency', () => {
    expect(reportsSource).toContain('useDeferredValue(searchQuery)');
    expect(reportsSource).toContain('export const MOBILE_REPORT_PAGE_SIZE = 40');
    expect(reportsSource).toContain('visibleTrips.map');
    expect(reportsSource).toContain('forEachWithConcurrency(pendingTrips');
    expect(reportsSource).not.toContain('drivers.find');
  });

  it('precomputes role menu sections and memoizes the lightweight menu page', () => {
    const menuComponentStart = menuSource.indexOf('const MobileMenuPage');
    const menuComponent = menuSource.slice(menuComponentStart);

    expect(menuSource).toContain('const DISPATCH_MENU_SECTIONS');
    expect(menuComponent).not.toContain('section.items.filter');
    expect(menuSource).toContain('export default React.memo(MobileMenuPage)');
  });

  it('uses one media-query listener rather than firing on every resize event', () => {
    expect(shellSource).toContain("import { MOBILE_MEDIA_QUERY, useMediaQuery } from '../hooks/useMediaQuery'");
    expect(shellSource).toContain('const isMobile = useMediaQuery(MOBILE_MEDIA_QUERY)');
    expect(shellSource).not.toContain("window.addEventListener('resize'");
    expect(shellSource).toContain('export default React.memo(EnterpriseDashboard)');
  });

  it('builds dispatcher trip scope indexes once per filter pass', () => {
    const filterStart = accessControlSource.indexOf('export function filterTripsForRole');
    const filterBody = accessControlSource.slice(filterStart);
    expect(filterBody).toContain('const scopedIds = new Set(');
    expect(filterBody).toContain('const scopedEmails = new Set(');
    expect(filterBody).not.toContain('isTripInDispatcherScope(trip, scopedDrivers)');
  });
});
