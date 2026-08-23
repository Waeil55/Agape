import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readComponent = (name) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');

describe('core mobile accessibility presentation contract', () => {
  it('keeps core route controls at least 44px tall below the desktop breakpoint', () => {
    for (const name of [
      'TripsPage.jsx',
      'LiveMapPage.jsx',
      'CommandSidebar.jsx',
      'RoutePlannerPage.jsx',
      'PayrollReportPage.jsx',
      'TimeTrackingAdmin.jsx',
      'FileUploadTrips.jsx',
      'RouteSequencer.jsx',
    ]) {
      expect(readComponent(name)).toContain('max-md:[&_button]:min-h-11');
    }
  });

  it('uses mobile-safe trip dialogs and a single-column create form', () => {
    const source = readComponent('TripsPage.jsx');

    expect(source).toContain('grid grid-cols-1 gap-3 sm:grid-cols-2');
    expect(source).toContain('rounded-none border border-slate-200');
    expect(source).toContain('rounded-t-3xl');
    expect(source).toContain('pb-24');
    expect(source).not.toContain('backdrop-blur');
  });

  it('keeps payroll foregrounds legible and avoids a large blurred hero layer', () => {
    const payroll = readComponent('PayrollReportPage.jsx');
    const timeTracking = readComponent('TimeTrackingAdmin.jsx');

    expect(payroll).toContain('bg-indigo-600 text-white');
    expect(payroll).toContain("color: 'text-indigo-700'");
    expect(timeTracking).toContain('bg-blue-600 p-5 sm:p-7 mb-5 text-white');
    expect(timeTracking).toContain('tracking-tight text-white');
    expect(timeTracking).not.toContain('blur-3xl');
  });
});
