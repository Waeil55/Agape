import { describe, expect, it } from 'vitest';
import { recordMatchesSearch, tripMatchesSearch } from './search';

describe('enterprise search', () => {
  it('matches phone digits regardless of formatting', () => {
    const trip = { patient: 'Rider', patientPhone: '+1 (317) 555-0199' };
    expect(tripMatchesSearch(trip, '3175550199')).toBe(true);
    expect(tripMatchesSearch(trip, '555-0199')).toBe(true);
  });

  it('searches every supported trip contact phone field', () => {
    expect(tripMatchesSearch({ hospitalPhone: '317-777-7700' }, '7777700')).toBe(true);
    expect(tripMatchesSearch({ dropoffPhone: '463.555.0101' }, '463555')).toBe(true);
  });

  it('supports phone search for people and driver records', () => {
    expect(recordMatchesSearch({ phone: '(317) 555-0100' }, '3175550100', ['name'])).toBe(true);
  });
});
