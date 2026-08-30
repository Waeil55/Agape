import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path) => readFileSync(path, 'utf8');

describe('override policy UI integration contract', () => {
  it('blocks billing output when the shared policy cannot be verified', () => {
    const app = read('src/App.jsx');
    const report = read('src/components/UnloadedTripsReport.jsx');
    expect(app).toContain("setOverridePolicyStatus('error')");
    expect(app).toContain('Cost calculations and export are blocked');
    expect(report).toContain("const policyReady = overridePolicyStatus === 'ready'");
    expect(report).toContain('disabled={!policyReady || !rows.length}');
    expect(report).toContain("role={overridePolicyStatus === 'error' ? 'alert' : 'status'}");
  });

  it('forwards verified policy state to desktop, mobile, reports, and settings', () => {
    const app = read('src/App.jsx');
    const desktop = read('src/components/DesktopEnterpriseDashboard.jsx');
    const mobile = read('src/components/MobileEnterpriseDashboard.jsx');
    const reports = read('src/components/ReportsPage.jsx');
    const settings = read('src/components/SettingsPage.jsx');
    expect(app).toContain('overridePolicyStatus={overridePolicyStatus}');
    expect(app).toContain('overridePolicyError={overridePolicyError}');
    expect(desktop.match(/overridePolicyStatus=\{overridePolicyStatus\}/g)?.length).toBeGreaterThanOrEqual(3);
    expect(mobile).toContain('<SettingsPage');
    expect(mobile).toContain('{...props}');
    expect(reports).toContain('overridePolicyStatus={props.overridePolicyStatus}');
    expect(settings).toContain("const canSaveOverridePolicy = ['ready', 'error'].includes(overridePolicyStatus)");
    expect(settings).toContain('disabled={!canSaveOverridePolicy}');
    expect(settings).toContain("'Repair override policy'");
  });

  it('uses the driver directory while calculating chronological gaps', () => {
    const report = read('src/components/UnloadedTripsReport.jsx');
    expect(report).toMatch(/analyzeTripCostOverrides\(trips, \{[\s\S]*?drivers,[\s\S]*?fromDate/);
  });
});
