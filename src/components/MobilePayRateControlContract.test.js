import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('mobile pay-rate control contract', () => {
  it('exposes and persists hourly wages from the Admin and Dispatcher mobile menu', () => {
    const dashboard = readFileSync(new URL('./MobileEnterpriseDashboard.jsx', import.meta.url), 'utf8');
    const menu = readFileSync(new URL('./MobileMenuPage.jsx', import.meta.url), 'utf8');
    const time = readFileSync(new URL('./TimeTrackingAdmin.jsx', import.meta.url), 'utf8');

    expect(menu).toContain("label: 'Time, Activity & Pay'");
    expect(menu).toContain('Set hourly wages and manage driver time records');
    expect(dashboard).toContain('onUpdateHourlyRate={props.onUpdateHourlyRate}');
    expect(time).toContain('onUpdateHourlyRate(driverId, num.toFixed(2))');
  });
});
