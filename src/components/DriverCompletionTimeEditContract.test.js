import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./DriverPage.jsx', import.meta.url), 'utf8');

const functionBody = (name, nextName) => source.slice(
  source.indexOf(`const ${name} =`),
  source.indexOf(`const ${nextName} =`),
);

describe('driver completion time editing contract', () => {
  it('preserves a selected pickup-departure time instead of normalizing it during input', () => {
    const body = functionBody('updateCompletionDeparture', 'updateCompletionDropoffArrival');
    expect(body).toContain('setDepartedTime(value)');
    expect(body).not.toContain('normalizeCompletionClocks');
  });

  it('preserves a selected dropoff-arrival time instead of changing either field during input', () => {
    const body = functionBody('updateCompletionDropoffArrival', 'submitComplete');
    expect(body).toContain('setArrivalDropoffTime(value)');
    expect(body).not.toContain('normalizeCompletionClocks');
    expect(body).not.toContain('setDepartedTime(');
  });

  it('validates the entered trip sequence without blocking on a stale pickup-arrival event', () => {
    const body = functionBody('submitComplete', 'getPrimaryTripAction');
    expect(body).not.toContain('pickupDepartureMs < pickupArrivalMs');
    expect(body).toContain('dropoffArrivalMs < pickupDepartureMs');
  });
});
