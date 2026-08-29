import { describe, expect, it } from 'vitest';
import { isReviewableImportedTrip, parseOptionalReportNumber, tripImportMatchKey, unmatchedOverrideReportBookingIds } from './reportOverrideImport';

describe('override report import reconciliation', () => {
  it('preserves explicit zeros and treats blank weekly override cells as zero only when requested', () => {
    expect(parseOptionalReportNumber('0')).toBe(0);
    expect(parseOptionalReportNumber('')).toBeNull();
    expect(parseOptionalReportNumber('', { blankAsZero: true })).toBe(0);
    expect(parseOptionalReportNumber('$65.28')).toBe(65.28);
  });

  it('matches operational trips by exact Booking ID', () => {
    expect(tripImportMatchKey({ bookingId: '107769193', patient: 'Different name' })).toBe('booking::107769193');
    expect(unmatchedOverrideReportBookingIds(
      [{ bookingId: '107769193', reportOverridePatch: true }],
      [{ id: 'internal-id', bookingId: '107769193' }],
      [],
    )).toEqual([]);
  });

  it('blocks unmatched booking-only override rows instead of creating sparse trips', () => {
    expect(unmatchedOverrideReportBookingIds(
      [{ bookingId: '107615882', reportOverridePatch: true }],
      [{ bookingId: '107615881' }],
      [],
    )).toEqual(['107615882']);
  });

  it('keeps booking-only override rows while removing examples and blank formula rows from review', () => {
    expect(isReviewableImportedTrip({ bookingId: '107768411', patient: 'Unknown', unloadedMileageMiles: 27 }, { report: true })).toBe(true);
    expect(isReviewableImportedTrip({ bookingId: '', patient: 'Unknown', unloadedMileageMiles: 70 }, { report: true })).toBe(false);
    expect(isReviewableImportedTrip({ bookingId: '', patient: 'Unknown', unloadedMileageMiles: null, overrideWaitingHours: null }, { report: true })).toBe(false);
  });
});
