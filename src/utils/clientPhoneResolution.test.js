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
    expect(isValidPhoneDigits('(317) 677-3763')).toBe(true);
    expect(isValidPhoneDigits('13176773763')).toBe(true);
    expect(isValidPhoneDigits('(765) 932-4111')).toBe(true);
  });

  it('extracts phone numbers from free-text notes/comments', () => {
    const text = 'please verify ride with 317-356-2760 or (765) 932-4111';
    const extracted = extractPhonesFromComments(text);
    expect(extracted).toContain('3173562760');
    expect(extracted).toContain('7659324111');
  });

  it('Theresa Mcmeans: prefers home phone over dialysis/treatment center phone across A and B legs', () => {
    const trips = [
      {
        patient: 'Theresa Mcmeans',
        pickup: '10069 E John Marshall Dr Indianapolis IN 46235',
        dropoff: '2626 E 46TH ST Indianapolis IN 46205',
        pickupPhone: '(317) 677-3763',
        dropoffPhone: '(317) 476-9066',
        pickupSiteName: 'HOME',
        dropoffSiteName: 'INDIANAPOLIS COMPREHENSIVE TREATMENT CENTER LLC',
      },
      {
        patient: 'Theresa Mcmeans',
        pickup: '2626 E 46TH ST Indianapolis IN 46205',
        dropoff: '1201 Indiana Ave Indianapolis Indiana 46202',
        pickupPhone: '(317) 476-9066',
        dropoffPhone: '(317) 677-3763',
        pickupSiteName: 'INDIANAPOLIS COMPREHENSIVE TREATMENT CENTER LLC',
        dropoffSiteName: 'WORK',
      },
    ];

    const analysis = analyzePhoneOwnershipForTrips(trips, 'Theresa Mcmeans');
    expect(analysis.clientPhone).toBe('3176773763');
    expect(analysis.facilityPhones).toContain('3174769066');
    expect(analysis.phoneConfidence).toBe('HIGH');
    expect(analysis.phoneNeedsReview).toBe(false);
    expect(analysis.phoneSource).toContain('Selected (317) 677-3763 as client phone');
    expect(analysis.phoneSource).toContain('Classified as FACILITY_PHONE: (317) 476-9066');
    expect(resolveClientPhoneForTrips(trips, 'Theresa Mcmeans')).toBe('3176773763');
    expect(resolveClientPhoneForTrip(trips[0], trips)).toBe('3176773763');
  });

  it('LEGEND DAVIS: classifies child patient guardian phone (Mother\'s Address) vs ABA Therapy facility phone', () => {
    const trips = [
      {
        patient: 'LEGEND DAVIS',
        pickup: '6855 Shore Terrace Suite 130 and 220 Indianapolis IN 46254',
        dropoff: '2231 E 151st St Carmel Indiana 46033',
        pickupPhone: '(463) 256-0551',
        dropoffPhone: '(371) 376-5188',
        pickupSiteName: 'Life Skills Autism Academy - ABA Therapy Center',
        dropoffSiteName: "Mother's Address",
        notes: 'Jalisa Davis-Mother ESCORT: FATHER: DEANDRE cobbins',
        type: 'CHILD1,ESC2',
      },
    ];

    const analysis = analyzePhoneOwnershipForTrips(trips, 'LEGEND DAVIS');
    expect(analysis.clientPhone).toBe('3713765188');
    expect(analysis.guardianPhone).toBe('3713765188');
    expect(analysis.parentPhone).toBe('3713765188');
    expect(analysis.facilityPhones).toContain('4632560551');
    expect(analysis.phoneConfidence).toBe('HIGH');
  });

  it('Angela Henley: rejects non-phone date string "20130301" and classifies Meijer Pharmacy as facility phone', () => {
    const trips = [
      {
        patient: 'Angela Henley',
        pickup: '13000 North Main Street Rushville In 46173',
        dropoff: '150 S Marlin Dr Greenwood In 46142',
        pickupPhone: '(765) 932-4111',
        dropoffPhone: '3178853033',
        pickupSiteName: '',
        dropoffSiteName: 'Meijer Pharmacy #132',
        dropoffComments: '20130301 will call',
      },
      {
        patient: 'Angela Henley',
        pickup: '150 S Marlin Dr Greenwood In 46142',
        dropoff: '7909 E 35th St Indianapolis In 462265905',
        pickupPhone: '3178853033',
        dropoffPhone: '(463) 332-4733',
        pickupSiteName: 'Meijer Pharmacy #132',
        dropoffSiteName: '',
        pickupComments: '20130301 will call',
      },
    ];

    const analysis = analyzePhoneOwnershipForTrips(trips, 'Angela Henley');
    expect(analysis.facilityPhones).toContain('3178853033'); // Meijer Pharmacy
    expect(analysis.clientPhone).not.toBe('3178853033'); // Not facility
    expect(analysis.clientPhone).not.toBe('20130301'); // Not date string
    expect(['7659324111', '4633324733']).toContain(analysis.clientPhone);
  });

  it('John Williams: resolves home phone, dialysis facility phone, and extracts verification contact from comments', () => {
    const trips = [
      {
        patient: 'John Williams',
        pickup: '1301 N Ritter Ave APT 225 Indianapolis Indiana 46219',
        dropoff: '1218 N PENNSYLVANIA ST INDIANAPOLIS IN 46202',
        pickupPhone: '(317) 914-0828',
        dropoffPhone: '317-686-0548',
        pickupSiteName: 'HOME',
        dropoffSiteName: 'METRO POINT DIALYSIS',
        notes: 'please verify ride with 317-356-2760',
      },
    ];

    const analysis = analyzePhoneOwnershipForTrips(trips, 'John Williams');
    expect(analysis.clientPhone).toBe('3179140828');
    expect(analysis.facilityPhones).toContain('3176860548');
    expect(analysis.otherContactPhones).toContain('3173562760');
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
});

