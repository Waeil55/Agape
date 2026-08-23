import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readComponent = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('remaining mobile premium safety contract', () => {
  it('keeps report and admin trip scope on the shared service-date utilities', () => {
    const reportsSource = readComponent('./MobileReportsPage.jsx');
    const adminSource = readComponent('./MobileAdminPage.jsx');

    expect(reportsSource).toContain('tripMatchesServiceDate');
    expect(adminSource).toContain('localCalendarYmd');
    expect(adminSource).toContain('tripMatchesServiceDate(trip, serviceDate)');
    expect(reportsSource).not.toContain('role="button"');
  });

  it('keeps explicit state handling and safe mobile interaction affordances', () => {
    const reportsSource = readComponent('./MobileReportsPage.jsx');
    const adminSource = readComponent('./MobileAdminPage.jsx');
    const toolsSource = readComponent('./DriverToolsPage.jsx');

    for (const source of [reportsSource, adminSource, toolsSource]) {
      expect(source).toContain('isLoading');
      expect(source).toContain('readOnly');
      expect(source).toContain('pb-24');
    }

    expect(toolsSource).toContain('aria-controls={quickNavId}');
    expect(toolsSource).toContain('aria-controls={etasId}');
    expect(toolsSource).not.toContain('text-[7px]');
    expect(toolsSource).not.toContain('generateAiText');
  });
});
