import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const readProjectFile = relativePath => readFileSync(fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)), 'utf8');

describe('interaction regressions', () => {
  it('keeps pull-to-refresh out of ordinary driver scrolling and below the safe-area header', () => {
    const source = readProjectFile('src/components/DriverPage.jsx');
    const headerIndex = source.indexOf('className="driver-page-header');
    const resumeIndex = source.indexOf("Resume {activeWorkTrip.patient || 'active trip'}");
    expect(source).toContain("activeNav === 'trips' && scrollTop <= 0");
    expect(headerIndex).toBeGreaterThan(0);
    expect(resumeIndex).toBeGreaterThan(headerIndex);
  });

  it('submits trip odometer actions on the first touch before keyboard viewport movement', () => {
    const source = readProjectFile('src/components/DriverPage.jsx');
    expect(source).toContain('runTripActionOnFirstPress');
    expect(source).toContain('runTripActionOnFirstPress(event, submitOdometer)');
    expect(source).toContain('runTripActionOnFirstPress(event, submitComplete)');
  });

  it('uses one explicit operations scroll owner and forwards vertical table wheel input', () => {
    const operations = readProjectFile('src/components/OperationsCommandCenter.jsx');
    const desktop = readProjectFile('src/components/DesktopEnterpriseDashboard.jsx');
    expect(operations).toContain('data-operations-scroll');
    expect(operations).toContain("verticalScroller.scrollBy({ top: event.deltaY, behavior: 'auto' })");
    expect(operations).toContain('flex h-full min-h-0 flex-col overflow-hidden');
    expect(desktop).toContain("['operations', 'reports', 'admin', 'drive', 'chat'].includes(activePanel)");
  });

  it('does not show fake table selection or resize interactions', () => {
    const entry = readProjectFile('src/main.jsx');
    const css = readProjectFile('src/index.css');
    expect(entry).not.toContain('selectedTableRow');
    expect(css).toContain('table th {\n    resize: none;\n    cursor: default;');
    expect(css).not.toContain('data-agape-selected');
  });

  it('saves driver odometer explicitly instead of writing on every keystroke', () => {
    const settings = readProjectFile('src/components/SettingsPage.jsx');
    expect(settings).toContain('Save Odometer');
    expect(settings).toContain('onSubmit={async (event) =>');
    expect(settings).not.toContain("onChange={(e) => { const val = parseInt(e.target.value); if (!isNaN(val)) saveSettings({ odometer: val }, true); }}");
  });

  it('pauses driver location-derived background work outside trip workspaces', () => {
    const source = readProjectFile('src/components/DriverPage.jsx');
    expect(source.match(/!\['trips', 'active-trip'\]\.includes\(activeNav\)/g)).toHaveLength(2);
    expect(source).not.toContain('phoneNumbersFallback');
  });
});
