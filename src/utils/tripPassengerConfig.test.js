import { describe, expect, it } from 'vitest';
import { summarizeTripPassengerConfig, detectWheelchairFromPassengerConfig } from './tripPassengerConfig';

describe('summarizeTripPassengerConfig', () => {
  it('labels an ambulatory space-type code', () => {
    expect(summarizeTripPassengerConfig({ spaceTypes: 'AM1' })).toEqual(['Ambulatory']);
  });

  it('labels a wheelchair space-type code with its count', () => {
    expect(summarizeTripPassengerConfig({ spaceTypes: 'WC2' })).toEqual(['2 Wheelchair']);
  });

  it('combines space types, mobility aids and escort into one summary, excluding rider category codes', () => {
    expect(summarizeTripPassengerConfig({
      passengerTypes: 'ADULT1',
      spaceTypes: 'WC1',
      mobilityAids: 'ESCORT1',
    })).toEqual(['Wheelchair', 'Escort']);
  });

  it('merges a code duplicated across two fields into one combined count', () => {
    expect(summarizeTripPassengerConfig({ spaceTypes: 'AM1', mobilityAids: 'AM1' })).toEqual(['2 Ambulatory']);
  });

  it('falls back to the wheelchair flag when no broker codes are present', () => {
    expect(summarizeTripPassengerConfig({ wheelchair: true })).toEqual(['Wheelchair']);
  });

  it('returns nothing for a trip with no mobility information at all', () => {
    expect(summarizeTripPassengerConfig({})).toEqual([]);
  });
});

describe('detectWheelchairFromPassengerConfig', () => {
  it('detects a wheelchair space-type code', () => {
    expect(detectWheelchairFromPassengerConfig({ spaceTypes: 'WC1' })).toBe(true);
  });

  it('detects a wheelchair mobility-aid code', () => {
    expect(detectWheelchairFromPassengerConfig({ mobilityAids: 'WHEELCHAIR' })).toBe(true);
  });

  it('is false for an ambulatory-only trip', () => {
    expect(detectWheelchairFromPassengerConfig({ spaceTypes: 'AM1' })).toBe(false);
  });
});
