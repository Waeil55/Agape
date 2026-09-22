import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('mobile embedded driver workflow contract', () => {
  it('uses the driver workflow persistence callback instead of the generic trip editor', () => {
    const source = readFileSync(new URL('./MobileEnterpriseDashboard.jsx', import.meta.url), 'utf8');
    const embeddedDriver = source.slice(
      source.indexOf('<DriverPage'),
      source.indexOf('</Suspense>', source.indexOf('<DriverPage')),
    );

    expect(embeddedDriver).toContain('onUpdateTrip={onUpdateDriverTrip}');
    expect(embeddedDriver).not.toContain('onUpdateTrip={onUpdateTrip || onUpdateDriverTrip}');
  });
});
