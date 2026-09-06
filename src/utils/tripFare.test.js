import { describe, expect, it } from 'vitest';
import { findTripFareColumn, MAX_TRIP_FARE, parseTripFare, readImportedTripFare } from './tripFare';

describe('trip fare validation', () => {
  it('accepts only standalone nonnegative currency values inside the safety limit', () => {
    expect(parseTripFare('$1,234.50')).toMatchObject({ status: 'valid', amount: 1234.5 });
    expect(parseTripFare('USD 65.28')).toMatchObject({ status: 'valid', amount: 65.28 });
    expect(parseTripFare(0)).toMatchObject({ status: 'valid', amount: 0 });
    expect(parseTripFare(MAX_TRIP_FARE + 0.01)).toMatchObject({ status: 'invalid', amount: null });
  });

  it('rejects addresses, phone numbers, timestamps, and mixed text instead of stripping their digits', () => {
    expect(parseTripFare('2231 E 151st St Carmel Indiana 46033')).toMatchObject({ status: 'invalid', amount: null });
    expect(parseTripFare('(317) 555-0199')).toMatchObject({ status: 'invalid', amount: null });
    expect(parseTripFare('2026-08-31 14:45')).toMatchObject({ status: 'invalid', amount: null });
    expect(parseTripFare('fare is $40')).toMatchObject({ status: 'invalid', amount: null });
  });

  it('maps only exact fare headers and never a similar operational column', () => {
    const headers = ['Booking Id', 'Origin', 'Direct Distance', 'Cost Center'];
    expect(findTripFareColumn(headers)).toBeNull();
    expect(readImportedTripFare({
      'Booking Id': '107706395',
      Origin: '2231 E 151st St Carmel Indiana 46033',
      'Direct Distance': '22.4',
    })).toMatchObject({ status: 'missing', amount: null, header: null });
    expect(readImportedTripFare({ 'Base Fare': '$82.25', Origin: '100 Main St' }))
      .toMatchObject({ status: 'valid', amount: 82.25, header: 'Base Fare' });
  });
});

