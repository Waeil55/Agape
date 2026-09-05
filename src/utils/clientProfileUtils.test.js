import { describe, expect, it } from 'vitest';
import { normalizeClientKey, prefillFromProfile } from './clientProfileUtils';

describe('normalizeClientKey', () => {
  it('lowercases and trims the name', () => {
    expect(normalizeClientKey('  John Doe  ')).toBe('john doe');
  });

  it('collapses multiple spaces', () => {
    expect(normalizeClientKey('Jane   Ann   Smith')).toBe('jane ann smith');
  });

  it('returns empty string for falsy input', () => {
    expect(normalizeClientKey('')).toBe('');
    expect(normalizeClientKey(null)).toBe('');
    expect(normalizeClientKey(undefined)).toBe('');
  });

  it('strips leading and trailing whitespace', () => {
    expect(normalizeClientKey('   ')).toBe('');
  });
});

describe('prefillFromProfile', () => {
  const profile = {
    pickup: '123 Main St',
    dropoff: '456 Oak Ave',
    pickupPhone: '555-0100',
    dropoffPhone: '555-0200',
    time: '08:30 AM',
    type: 'Wheelchair',
    notes: 'Handle with care',
  };

  it('fills empty fields from profile', () => {
    const result = prefillFromProfile(profile, {});
    expect(result).toEqual({
      pickup: '123 Main St',
      dropoff: '456 Oak Ave',
      pickupPhone: '555-0100',
      dropoffPhone: '555-0200',
      time: '08:30 AM',
      type: 'Wheelchair',
      notes: 'Handle with care',
    });
  });

  it('does not override existing values', () => {
    const result = prefillFromProfile(profile, { pickup: '789 Existing', time: '10:00 AM' });
    expect(result.pickup).toBe('789 Existing');
    expect(result.time).toBe('10:00 AM');
    expect(result.dropoff).toBe('456 Oak Ave');
  });

  it('overrides empty string values', () => {
    const result = prefillFromProfile(profile, { pickup: '' });
    expect(result.pickup).toBe('123 Main St');
  });

  it('overrides null values', () => {
    const result = prefillFromProfile(profile, { pickup: null });
    expect(result.pickup).toBe('123 Main St');
  });

  it('overrides undefined values', () => {
    const result = prefillFromProfile(profile, { pickup: undefined });
    expect(result.pickup).toBe('123 Main St');
  });

  it('returns overrides unchanged when profile is null', () => {
    const overrides = { pickup: 'existing' };
    expect(prefillFromProfile(null, overrides)).toBe(overrides);
  });

  it('returns overrides unchanged when profile is undefined', () => {
    const overrides = { pickup: 'existing' };
    expect(prefillFromProfile(undefined, overrides)).toBe(overrides);
  });

  it('preserves extra fields not in PROFILE_FIELDS', () => {
    const result = prefillFromProfile(profile, { bookingId: 'BK-123' });
    expect(result.bookingId).toBe('BK-123');
    expect(result.pickup).toBe('123 Main St');
  });

  it('does not copy extra profile fields not in PROFILE_FIELDS', () => {
    const profileWithExtra = { ...profile, patientName: 'John', createdAt: '2024-01-01' };
    const result = prefillFromProfile(profileWithExtra, {});
    expect(result.patientName).toBeUndefined();
    expect(result.createdAt).toBeUndefined();
    expect(result.pickup).toBe('123 Main St');
  });

  it('returns empty object when both profile and overrides are empty', () => {
    expect(prefillFromProfile({}, {})).toEqual({});
  });
});
