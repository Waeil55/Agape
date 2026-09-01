import { describe, it, expect } from 'vitest';
import {
  resolveClientPhoneForTrip,
  resolveClientPhoneForTrips,
  analyzePhoneOwnershipForTrips,
  isValidPhoneDigits,
  extractPhonesFromComments,
} from './clientPhoneResolution';

describe('Complete Trip File Extraction & Client Phone Identification Engine', () => {
  it('filters out non-phone numeric values such as dates, booking IDs, and repeating digits', () => {
    expect(isValidPhoneDigits('20130301')).toBe(false); // 8-digit date string
    expect(isValidPhoneDigits('20260817')).toBe(false); // 8-digit date string
    expect(isValidPhoneDigits('0000000000')).toBe(false); // repeating zeros
    expect(isValidPhoneDigits('1111111111')).toBe(false); // repeating ones
    expect(isValidPhoneDigits('12345')).toBe(false); // too short
    expect(isValidPhoneDigits('(317) 555-0101')).toBe(true);
    expect(isValidPhoneDigits('13175550101')).toBe(true);
    expect(isValidPhoneDigits('(765) 555-0111')).toBe(true);
  });

  it('extracts phone numbers from free-text notes/comments', () => {
    const text = 'please verify ride with 317-555-0120 or (765) 555-0111';
    const extracted = extractPhonesFromComments(text);
    expect(extracted).toContain('3175550120');
    expect(extracted).toContain('7655550111');
  });

  it('prefers the residential client phone over a treatment-center phone across A and B legs', () => {
    const trips = [
      {
        patient: 'Sample Client A',
        pickup: '100 Main St Indianapolis IN 46201',
        dropoff: '200 Clinic Dr Indianapolis IN 46202',
        pickupPhone: '(317) 555-0101',
        dropoffPhone: '(317) 555-0199',
        pickupSiteName: 'HOME',
        dropoffSiteName: 'INDIANAPOLIS COMPREHENSIVE TREATMENT CENTER LLC',
      },
      {
        patient: 'Sample Client A',
        pickup: '200 Clinic Dr Indianapolis IN 46202',
        dropoff: '100 Main St Indianapolis IN 46201',
        pickupPhone: '(317) 555-0199',
        dropoffPhone: '(317) 555-0101',
        pickupSiteName: 'INDIANAPOLIS COMPREHENSIVE TREATMENT CENTER LLC',
        dropoffSiteName: 'HOME',
      },
    ];

    const analysis = analyzePhoneOwnershipForTrips(trips, 'Sample Client A');
    expect(analysis.clientPhone).toBe('3175550101');
    expect(analysis.facilityPhones).toContain('3175550199');
    expect(analysis.phoneConfidence).toBe('HIGH');
    expect(analysis.phoneNeedsReview).toBe(false);
    expect(analysis.phoneSource).toContain('Selected (317) 555-0101 as client phone');
    expect(analysis.phoneSource).toContain('Classified as FACILITY_PHONE: (317) 555-0199');
    expect(resolveClientPhoneForTrips(trips, 'Sample Client A')).toBe('3175550101');
    expect(resolveClientPhoneForTrip(trips[1], trips)).toBe('3175550101');
  });

  it('classifies a guardian home number separately from an ABA facility number', () => {
    const trips = [
      {
        patient: 'Sample Child',
        pickup: '300 Therapy Center Dr Indianapolis IN 46203',
        dropoff: '400 Oak St Carmel IN 46032',
        pickupPhone: '(463) 555-0198',
        dropoffPhone: '(317) 555-0102',
        pickupSiteName: 'Life Skills Autism Academy - ABA Therapy Center',
        dropoffSiteName: "Mother's Address",
        notes: 'Mother is the guardian and father may escort.',
        type: 'CHILD1,ESC2',
      },
    ];

    const analysis = analyzePhoneOwnershipForTrips(trips, 'Sample Child');
    expect(analysis.clientPhone).toBe('3175550102');
    expect(analysis.guardianPhone).toBe('3175550102');
    expect(analysis.parentPhone).toBe('3175550102');
    expect(analysis.facilityPhones).toContain('4635550198');
    expect(analysis.phoneConfidence).toBe('HIGH');
  });

  it('rejects a date-like value and classifies a pharmacy number as a facility phone', () => {
    const trips = [
      {
        patient: 'Sample Client B',
        pickup: '500 North Main Street Rushville IN 46173',
        dropoff: '600 Pharmacy Dr Greenwood IN 46142',
        pickupPhone: '(765) 555-0103',
        dropoffPhone: '3175550197',
        pickupSiteName: '',
        dropoffSiteName: 'Meijer Pharmacy #132',
        dropoffComments: '20130301 will call',
      },
      {
        patient: 'Sample Client B',
        pickup: '600 Pharmacy Dr Greenwood IN 46142',
        dropoff: '500 North Main Street Rushville IN 46173',
        pickupPhone: '3175550197',
        dropoffPhone: '(765) 555-0103',
        pickupSiteName: 'Meijer Pharmacy #132',
        dropoffSiteName: '',
        pickupComments: '20130301 will call',
      },
    ];

    const analysis = analyzePhoneOwnershipForTrips(trips, 'Sample Client B');
    expect(analysis.facilityPhones).toContain('3175550197');
    expect(analysis.clientPhone).not.toBe('3175550197');
    expect(analysis.clientPhone).not.toBe('20130301'); // Not date string
    expect(analysis.clientPhone).toBe('7655550103');
  });

  it('resolves a home phone, facility phone, and separate verification contact from comments', () => {
    const trips = [
      {
        patient: 'Sample Client C',
        pickup: '700 Ritter Ave Apt 2 Indianapolis IN 46219',
        dropoff: '800 Dialysis Center Dr Indianapolis IN 46202',
        pickupPhone: '(317) 555-0104',
        dropoffPhone: '317-555-0196',
        pickupSiteName: 'HOME',
        dropoffSiteName: 'METRO POINT DIALYSIS',
        notes: 'please verify ride with 317-555-0120',
      },
    ];

    const analysis = analyzePhoneOwnershipForTrips(trips, 'Sample Client C');
    expect(analysis.clientPhone).toBe('3175550104');
    expect(analysis.facilityPhones).toContain('3175550196');
    expect(analysis.otherContactPhones).toContain('3175550120');
    expect(analysis.phoneConfidence).toBe('HIGH');
  });

  it('Ambiguous phone case: sets client_phone = null, confidence = UNKNOWN, and phone_needs_review = true when only facility phones exist', () => {
    const trips = [
      {
        patient: 'Uncertain Patient',
        pickup: 'Hospital A',
        dropoff: 'Clinic B',
        pickupPhone: '317-555-1111',
        dropoffPhone: '317-555-2222',
        pickupSiteName: 'Community Hospital North',
        dropoffSiteName: 'Fresenius Kidney Care',
      },
    ];

    const analysis = analyzePhoneOwnershipForTrips(trips, 'Uncertain Patient');
    expect(analysis.clientPhone).toBe('');
    expect(analysis.phoneConfidence).toBe('UNKNOWN');
    expect(analysis.phoneNeedsReview).toBe(true);
    expect(analysis.phoneSource).toContain('No client personal phone found');
  });

  it('fails closed instead of treating an unclassified endpoint number as the client phone', () => {
    const trip = {
      patient: 'Unknown Ownership',
      pickup: 'Location One',
      dropoff: 'Location Two',
      pickupPhone: '317-555-0140',
      dropoffPhone: '317-555-0141',
    };

    expect(resolveClientPhoneForTrip(trip)).toBe('');
  });

  it('uses an explicit client phone on both route directions', () => {
    const trip = {
      patient: 'Explicit Client',
      clientPhone: '317-555-0150',
      pickupPhone: '317-555-0190',
      dropoffPhone: '317-555-0191',
    };

    expect(resolveClientPhoneForTrip(trip)).toBe('3175550150');
  });
});
