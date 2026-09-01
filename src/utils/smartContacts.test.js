import { describe, expect, it } from 'vitest';
import { buildContactList, getPrimaryContact } from './smartContacts';

describe('smart contact primary-phone safety', () => {
  it('keeps the client home number primary on both A and B legs', () => {
    const trips = [
      {
        patient: 'Sample Rider',
        pickup: '100 Main St Indianapolis IN 46201',
        dropoff: '200 Clinic Dr Indianapolis IN 46202',
        pickupSiteName: 'HOME',
        dropoffSiteName: 'Treatment Center',
        pickupPhone: '317-555-0101',
        dropoffPhone: '317-555-0199',
      },
      {
        patient: 'Sample Rider',
        pickup: '200 Clinic Dr Indianapolis IN 46202',
        dropoff: '100 Main St Indianapolis IN 46201',
        pickupSiteName: 'Treatment Center',
        dropoffSiteName: 'HOME',
        pickupPhone: '317-555-0199',
        dropoffPhone: '317-555-0101',
      },
    ];

    const outboundPrimary = getPrimaryContact(trips[0], trips);
    const returnPrimary = getPrimaryContact(trips[1], trips);
    const returnContacts = buildContactList(trips[1], trips);

    expect(outboundPrimary?.phone).toBe('3175550101');
    expect(returnPrimary?.phone).toBe('3175550101');
    expect(returnContacts.find((contact) => contact.role === 'facility')?.phone).toBe('317-555-0199');
  });

  it('does not fall back to a facility when no verified client phone exists', () => {
    const trip = {
      patient: 'Unresolved Rider',
      pickup: 'Hospital A',
      dropoff: 'Clinic B',
      pickupPhone: '317-555-0180',
      dropoffPhone: '317-555-0181',
      pickupSiteName: 'Hospital A',
      dropoffSiteName: 'Clinic B',
    };

    expect(getPrimaryContact(trip, [trip])).toBeNull();
    expect(buildContactList(trip, [trip]).every((contact) => contact.role === 'facility')).toBe(true);
  });
});
