import { describe, expect, it } from 'vitest';
import {
  DEFAULT_OVERRIDE_POLICY,
  analyzeTripCostOverrides,
  extractCityFromAddress,
  filterTripCostOverrideRows,
  getBoundaryDistanceKey,
  isOverridePolicyDocumentValid,
  normalizeOverridePolicy,
} from './tripCostOverrides';

const driver = {
  id: 'driver-1',
  name: 'Driver One',
  city: 'Fishers',
  state: 'IN',
  zip: '46038',
  homeAddress: '10409 Parmer Cir',
  homeLat: 39.993689,
  homeLng: -85.988494,
};

const sharedHomePolicy = {
  homeAddress: '10409 Parmer Cir',
  homeCity: 'Fishers',
  homeState: 'IN',
  homeZip: '46038',
  homeLat: 39.993689,
  homeLng: -85.988494,
  homeFormattedAddress: '10409 Parmer Cir, Fishers, IN 46038, USA',
};

const trip = (id, overrides = {}) => ({
  id,
  bookingId: id,
  patient: `Rider ${id}`,
  driverId: driver.id,
  completedVehicle: 'Van 1',
  date: '2026-08-01',
  status: 'Completed',
  arrivalTime: '2026-08-01T07:00:00-04:00',
  arrivalDropoffTime: '2026-08-01T07:30:00-04:00',
  pickupOdometer: 100,
  dropoffOdometer: 110,
  pickupCity: 'Fishers',
  dropoffCity: 'Carmel',
  pickup: '100 Main St, Fishers, IN 46038',
  dropoff: '200 Main St, Carmel, IN 46032',
  originalTripCost: 25,
  ...overrides,
});

const analyze = (trips, options = {}) => analyzeTripCostOverrides(trips, {
  allDates: true,
  drivers: [driver],
  ...options,
  policy: { ...sharedHomePolicy, ...(options.policy || {}) },
});

const rowFor = (result, bookingId, legType = 'before_pickup') => result.rows.find((row) => (
  String(row.trip.bookingId) === String(bookingId) && row.legType === legType
));

describe('trip cost override calculation', () => {
  it('orders the reported 107813500/107813501 day by odometer and creates one Booking ID per unloaded leg', () => {
    const prior = trip('107706390', {
      arrivalTime: '2026-08-27T12:50:00-04:00',
      arrivalDropoffTime: '2026-08-27T13:34:00-04:00',
      pickupOdometer: 271488,
      dropoffOdometer: 271510,
      pickupCity: 'Indianapolis',
      dropoffCity: 'Carmel',
      dropoff: 'Carmel, IN',
    });
    const outbound = trip('107813500', {
      arrivalTime: '2026-08-27T15:04:46-04:00',
      arrivalDropoffTime: '2026-08-27T15:26:00-04:00',
      pickupOdometer: 271705,
      dropoffOdometer: 271718,
      pickupCity: 'BOONVILLE',
      dropoffCity: 'EVANSVILLE',
      pickup: '430 S 2ND ST apt b, BOONVILLE, IN 47601',
      dropoff: '7307 E COLUMBIA ST, EVANSVILLE, IN 47715',
    });
    const returnTrip = trip('107813501', {
      // This recorded pickup time is wrong and would sort before 107813500 without odometer reconciliation.
      arrivalTime: '2026-08-27T14:41:00-04:00',
      arrivalDropoffTime: '2026-08-27T16:28:00-04:00',
      pickupOdometer: 271718,
      dropoffOdometer: 271727,
      pickupCity: 'EVANSVILLE',
      dropoffCity: 'BOONVILLE',
      pickup: '7307 E COLUMBIA ST, EVANSVILLE, IN 47715',
      dropoff: '430 S 2ND ST apt b, BOONVILLE, IN 47601',
    });
    const pending = analyze([returnTrip, outbound, prior]);
    const homeKey = pending.boundaryRequests.find((request) => request.tripId === '107813501' && request.legType === 'home_return').id;
    const result = analyze([returnTrip, outbound, prior], {
      boundaryDistances: new Map([[homeKey, { status: 'ready', miles: 183 }]]),
    });

    expect(rowFor(result, '107813500')).toMatchObject({
      originCity: 'Carmel',
      destinationCity: 'BOONVILLE',
      rawUnloadedMiles: 195,
      unloadedMiles: 195,
      unloadedAmount: 156,
    });
    expect(rowFor(result, '107813501')).toMatchObject({
      originCity: 'EVANSVILLE',
      destinationCity: 'EVANSVILLE',
      sameCity: true,
      unloadedMiles: 0,
    });
    expect(rowFor(result, '107813501', 'home_return')).toMatchObject({
      originCity: 'BOONVILLE',
      destinationCity: 'Fishers',
      rawUnloadedMiles: 183,
      unloadedMiles: 183,
      unloadedAmount: 146.4,
    });
    expect(result.rows.every((row) => !Object.hasOwn(row, 'nextTrip'))).toBe(true);
  });

  it('creates first-trip home-to-pickup and last-trip dropoff-to-home boundary legs', () => {
    const only = trip('B-1', { pickupCity: 'Carmel', dropoffCity: 'Muncie' });
    const pending = analyze([only]);
    const firstKey = pending.boundaryRequests.find((request) => request.legType === 'before_pickup').id;
    const homeKey = pending.boundaryRequests.find((request) => request.legType === 'home_return').id;
    const result = analyze([only], {
      boundaryDistances: new Map([
        [firstKey, { status: 'ready', miles: 24 }],
        [homeKey, { status: 'ready', miles: 55 }],
      ]),
    });
    expect(rowFor(result, 'B-1')).toMatchObject({ legLabel: 'Home to first pickup', originCity: 'Fishers', destinationCity: 'Carmel', unloadedMiles: 24 });
    expect(rowFor(result, 'B-1', 'home_return')).toMatchObject({ legLabel: 'Return home', originCity: 'Muncie', destinationCity: 'Fishers', unloadedMiles: 55 });
  });

  it('uses the one shared policy home for every driver and ignores driver-profile homes', () => {
    const secondDriver = {
      id: 'driver-2',
      name: 'Driver Two',
      homeAddress: '500 Personal Address',
      city: 'Muncie',
      state: 'IN',
      zip: '47302',
      homeLat: 40.1934,
      homeLng: -85.3864,
    };
    const firstDriverTrip = trip('SHARED-1', { pickupCity: 'Carmel', dropoffCity: 'Noblesville' });
    const secondDriverTrip = trip('SHARED-2', {
      driverId: secondDriver.id,
      pickupCity: 'Greenwood',
      dropoffCity: 'Plainfield',
      arrivalTime: '2026-08-01T08:00:00-04:00',
      arrivalDropoffTime: '2026-08-01T08:30:00-04:00',
    });
    const result = analyze([firstDriverTrip, secondDriverTrip], { drivers: [driver, secondDriver] });
    const firstRows = result.rows.filter((row) => row.legType === 'before_pickup');
    const returnRows = result.rows.filter((row) => row.legType === 'home_return');

    expect(firstRows).toHaveLength(2);
    expect(returnRows).toHaveLength(2);
    expect(firstRows.every((row) => row.originCity === 'Fishers' && row.originAddress === sharedHomePolicy.homeFormattedAddress)).toBe(true);
    expect(returnRows.every((row) => row.destinationCity === 'Fishers' && row.destinationAddress === sharedHomePolicy.homeFormattedAddress)).toBe(true);
    expect(result.boundaryRequests.filter((request) => request.legType === 'before_pickup').every((request) => request.origin === `${sharedHomePolicy.homeLat},${sharedHomePolicy.homeLng}`)).toBe(true);
  });

  it('assigns between-trip mileage and waiting to the current pickup Booking ID', () => {
    const first = trip('1', { arrivalDropoffTime: '2026-08-01T08:00:00-04:00', dropoffOdometer: 120, dropoffCity: 'Rushville' });
    const current = trip('2', {
      arrivalTime: '2026-08-01T12:30:00-04:00',
      arrivalDropoffTime: '2026-08-01T13:00:00-04:00',
      pickupOdometer: 179,
      dropoffOdometer: 190,
      pickupCity: 'Carmel',
      originalTripCost: 65.28,
    });
    const row = rowFor(analyze([current, first]), '2');
    expect(row).toMatchObject({ unloadedMiles: 59, unloadedAmount: 47.2, waitHours: 3.5, waitCost: 31.5 });
    expect(row.totalCost).toBeCloseTo(143.98);
  });

  it('uses a strict mileage threshold and suppresses same-city mileage without suppressing wait', () => {
    const first = trip('1', { arrivalDropoffTime: '2026-08-01T08:00:00-04:00', dropoffOdometer: 120, dropoffCity: 'Indianapolis' });
    const exact = trip('2', { arrivalTime: '2026-08-01T09:00:00-04:00', arrivalDropoffTime: '2026-08-01T09:30:00-04:00', pickupOdometer: 140, pickupCity: 'Fishers' });
    expect(rowFor(analyze([first, exact]), '2').unloadedMiles).toBe(0);

    const sameCity = trip('2', { arrivalTime: '2026-08-01T10:00:00-04:00', arrivalDropoffTime: '2026-08-01T10:30:00-04:00', pickupOdometer: 180, pickupCity: 'Indy' });
    expect(rowFor(analyze([first, sameCity]), '2')).toMatchObject({ sameCity: true, unloadedMiles: 0, waitHours: 1, waitCost: 9 });
  });

  it('bills only time beyond the threshold and rounds it up', () => {
    const first = trip('1', { arrivalDropoffTime: '2026-08-01T08:00:00-04:00', dropoffOdometer: 120 });
    const current = trip('2', { arrivalTime: '2026-08-01T09:01:00-04:00', arrivalDropoffTime: '2026-08-01T09:30:00-04:00', pickupOdometer: 145 });
    const row = rowFor(analyze([first, current]), '2');
    expect(row.rawGapHours).toBeCloseTo(61 / 60);
    expect(row).toMatchObject({ waitHours: 0.5, waitCost: 4.5 });
  });

  it('uses every configurable threshold, rate, and rounding value', () => {
    const first = trip('1', { arrivalDropoffTime: '2026-08-01T08:00:00-04:00', dropoffOdometer: 120 });
    const current = trip('2', { arrivalTime: '2026-08-01T10:01:00-04:00', arrivalDropoffTime: '2026-08-01T10:30:00-04:00', pickupOdometer: 160 });
    const row = rowFor(analyze([first, current], {
      policy: { unloadedThresholdMiles: 30, unloadedRate: 1.25, waitingThresholdHours: 2, waitRate: 12, waitRoundingMinutes: 15 },
    }), '2');
    expect(row).toMatchObject({ unloadedMiles: 40, unloadedAmount: 50, waitHours: 0.25, waitCost: 3 });
  });

  it('blocks both supplements when another worked trip overlaps the between-trip gap', () => {
    const first = trip('1', { arrivalDropoffTime: '2026-08-01T08:00:00-04:00', dropoffOdometer: 120 });
    const current = trip('2', { arrivalTime: '2026-08-01T11:00:00-04:00', arrivalDropoffTime: '2026-08-01T11:30:00-04:00', pickupOdometer: 180 });
    const overlapping = trip('x', { status: 'Assigned', arrivalTime: '2026-08-01T09:00:00-04:00', arrivalDropoffTime: '2026-08-01T10:00:00-04:00' });
    const row = rowFor(analyze([first, current, overlapping]), '2');
    expect(row).toMatchObject({ interveningWork: true, unloadedMiles: 0, waitCost: 0 });
  });

  it('counts original trip cost once when the same Booking ID has two qualifying legs', () => {
    const only = trip('B-2', { pickupCity: 'Carmel', dropoffCity: 'Muncie', originalTripCost: 40 });
    const pending = analyze([only]);
    const firstKey = pending.boundaryRequests.find((request) => request.legType === 'before_pickup').id;
    const homeKey = pending.boundaryRequests.find((request) => request.legType === 'home_return').id;
    const result = analyze([only], { boundaryDistances: new Map([[firstKey, 30], [homeKey, 50]]) });
    const ownedRows = result.rows.filter((row) => row.trip.bookingId === 'B-2');
    expect(ownedRows.reduce((sum, row) => sum + row.originalTripCost, 0)).toBe(40);
    expect(ownedRows.reduce((sum, row) => sum + row.totalCost, 0)).toBe(104);
  });

  it('applies route exclusions directionally and allows other routes', () => {
    const first = trip('1', { dropoffCity: 'Indianapolis', dropoffOdometer: 120 });
    const current = trip('2', { arrivalTime: '2026-08-01T09:00:00-04:00', arrivalDropoffTime: '2026-08-01T09:30:00-04:00', pickupCity: 'Carmel', pickupOdometer: 170 });
    const excluded = rowFor(analyze([first, current], { policy: { excludedCityPairs: ['Indianapolis > Carmel'] } }), '2');
    expect(excluded).toMatchObject({ pairExcluded: true, unloadedMiles: 0, waitHours: 0 });
    const reverseFirst = trip('1', { dropoffCity: 'Carmel', dropoffOdometer: 120 });
    const reverse = rowFor(analyze([reverseFirst, { ...current, pickupCity: 'Indianapolis' }], { policy: { excludedCityPairs: ['Indianapolis > Carmel'] } }), '2');
    expect(reverse).toMatchObject({ pairExcluded: false, unloadedMiles: 50 });
  });

  it('excludes waiting only without losing qualifying unloaded mileage', () => {
    const first = trip('1', { arrivalDropoffTime: '2026-08-01T08:00:00-04:00', dropoffCity: 'Indianapolis', dropoffOdometer: 120 });
    const current = trip('2', { arrivalTime: '2026-08-01T10:00:00-04:00', arrivalDropoffTime: '2026-08-01T10:30:00-04:00', pickupCity: 'Carmel', pickupOdometer: 180 });
    const row = rowFor(analyze([first, current], {
      policy: { overrideExclusionRules: [{ scope: 'waiting', fromCity: 'Indianapolis', toCity: 'Carmel' }] },
    }), '2');

    expect(row).toMatchObject({ mileageExcluded: false, waitingExcluded: true, unloadedMiles: 60, unloadedAmount: 48, waitHours: 0, waitCost: 0, pairExcluded: false });
    expect(row.waitReason).toContain('Waiting time excluded');
  });

  it('supports directional any-destination waiting exclusions without affecting reverse routes', () => {
    const first = trip('1', { arrivalDropoffTime: '2026-08-01T08:00:00-04:00', dropoffCity: 'Indianapolis', dropoffOdometer: 120 });
    const current = trip('2', { arrivalTime: '2026-08-01T10:00:00-04:00', arrivalDropoffTime: '2026-08-01T10:30:00-04:00', pickupCity: 'Carmel', pickupOdometer: 180 });
    const policy = { overrideExclusionRules: [{ scope: 'waiting', fromCity: 'Indianapolis', toCity: '*' }] };
    expect(rowFor(analyze([first, current], { policy }), '2')).toMatchObject({ waitingExcluded: true, unloadedMiles: 60, waitCost: 0 });

    const reverseFirst = trip('1', { arrivalDropoffTime: '2026-08-01T08:00:00-04:00', dropoffCity: 'Carmel', dropoffOdometer: 120 });
    const reverseCurrent = trip('2', { arrivalTime: '2026-08-01T10:00:00-04:00', arrivalDropoffTime: '2026-08-01T10:30:00-04:00', pickupCity: 'Indianapolis', pickupOdometer: 180 });
    expect(rowFor(analyze([reverseFirst, reverseCurrent], { policy }), '2')).toMatchObject({ waitingExcluded: false, unloadedMiles: 60, waitHours: 1, waitCost: 9 });
  });

  it('keeps same-city waiting unless a waiting rule explicitly excludes it', () => {
    const first = trip('1', { arrivalDropoffTime: '2026-08-01T08:00:00-04:00', dropoffCity: 'Indianapolis', dropoffOdometer: 120 });
    const current = trip('2', { arrivalTime: '2026-08-01T10:00:00-04:00', arrivalDropoffTime: '2026-08-01T10:30:00-04:00', pickupCity: 'Indy', pickupOdometer: 180 });
    const included = rowFor(analyze([first, current]), '2');
    expect(included).toMatchObject({ sameCity: true, unloadedMiles: 0, waitingExcluded: false, waitHours: 1, waitCost: 9 });

    const excluded = rowFor(analyze([first, current], {
      policy: { overrideExclusionRules: [{ scope: 'waiting', fromCity: 'Indianapolis', toCity: 'Indianapolis' }] },
    }), '2');
    expect(excluded).toMatchObject({ sameCity: true, waitingExcluded: true, waitHours: 0, waitCost: 0 });
  });

  it('supports mileage-only and all-override exclusions independently', () => {
    const first = trip('1', { arrivalDropoffTime: '2026-08-01T08:00:00-04:00', dropoffCity: 'Indianapolis', dropoffOdometer: 120 });
    const current = trip('2', { arrivalTime: '2026-08-01T10:00:00-04:00', arrivalDropoffTime: '2026-08-01T10:30:00-04:00', pickupCity: 'Carmel', pickupOdometer: 180 });
    const mileageOnly = rowFor(analyze([first, current], {
      policy: { overrideExclusionRules: [{ scope: 'mileage', fromCity: 'Indianapolis', toCity: '*' }] },
    }), '2');
    expect(mileageOnly).toMatchObject({ mileageExcluded: true, waitingExcluded: false, unloadedMiles: 0, waitHours: 1, waitCost: 9, pairExcluded: false });

    const all = rowFor(analyze([first, current], {
      policy: { overrideExclusionRules: [{ scope: 'all', fromCity: 'Indianapolis', toCity: '*' }] },
    }), '2');
    expect(all).toMatchObject({ mileageExcluded: true, waitingExcluded: true, unloadedMiles: 0, waitHours: 0, waitCost: 0, pairExcluded: true });
  });

  it('fails closed for missing home data, missing cities, vehicle changes, and unavailable routed mileage', () => {
    const single = trip('solo');
    const missingHome = analyzeTripCostOverrides([single], { allDates: true, drivers: [driver], policy: DEFAULT_OVERRIDE_POLICY });
    expect(rowFor(missingHome, 'solo')).toMatchObject({ requiresReview: true, isOverrideCandidate: false });
    expect(rowFor(missingHome, 'solo').originCity).toBe('');

    const first = trip('1', { dropoffCity: '', dropoff: '', dropoffOdometer: 120 });
    const current = trip('2', { arrivalTime: '2026-08-01T09:00:00-04:00', arrivalDropoffTime: '2026-08-01T09:30:00-04:00', pickupOdometer: 170 });
    const missingCity = rowFor(analyze([first, current]), '2');
    expect(missingCity).toMatchObject({ cityPairComplete: false, requiresReview: true, unloadedMiles: 0 });

    const changedVehicle = rowFor(analyze([trip('1', { dropoffOdometer: 120 }), { ...current, completedVehicle: 'Van 2' }]), '2');
    expect(changedVehicle.unloadedReason).toContain('Vehicle changed');

    const pending = analyze([single]);
    expect(pending.boundaryRequests).toHaveLength(1);
    expect(rowFor(pending, 'solo')).toMatchObject({ boundaryDistanceStatus: 'pending', isOverrideCandidate: false });
  });

  it('excludes noncompleted and timestamp-invalid trips and keeps each service date independent', () => {
    const result = analyze([
      trip('1'),
      trip('2', { status: 'Cancelled' }),
      trip('3', { status: 'No Show' }),
      trip('4', { status: 'Assigned' }),
      trip('5', { arrivalTime: null }),
    ]);
    expect(result.rows).toHaveLength(2);
    expect(result.excluded).toEqual({ missingTimestamps: 1, notCompleted: 3, invalidChronology: 0 });

    const nextDay = trip('6', { date: '2026-08-02', arrivalTime: '2026-08-02T07:00:00-04:00', arrivalDropoffTime: '2026-08-02T07:30:00-04:00' });
    const dates = analyze([trip('1'), nextDay]).rows;
    expect(dates.filter((row) => row.legLabel === 'Home to first pickup')).toHaveLength(2);
    expect(dates.filter((row) => row.legLabel === 'Return home')).toHaveLength(2);
  });

  it('supports legacy recorded field names and pickup service-date scoping', () => {
    const first = trip('1', {
      date: undefined,
      serviceDate: '2026-08-01',
      arrivalTime: undefined,
      pickupArrival: '7:00 AM',
      arrivalDropoffTime: undefined,
      dropoffArrival: '8:00 AM',
      dropoffOdometer: undefined,
      endMileage: '1,120',
    });
    const current = trip('2', {
      date: undefined,
      dateKey: '2026-08-01',
      arrivalTime: undefined,
      arrivedPickupTime: '10:00 AM',
      arrivalDropoffTime: undefined,
      dropoffArrivalTime: '10:30 AM',
      pickupOdometer: undefined,
      startMileage: '1,170',
    });
    const result = analyzeTripCostOverrides([first, current], { drivers: [driver], policy: sharedHomePolicy, fromDate: '2026-08-01', toDate: '2026-08-01' });
    expect(rowFor(result, '2')).toMatchObject({ serviceDate: '2026-08-01', unloadedMiles: 50, waitHours: 1 });
  });

  it('applies candidate, leg, driver, route, minimum, and search filters together', () => {
    const rows = [
      { legType: 'before_pickup', legLabel: 'Before pickup', trip: { id: '1', bookingId: 'B-100', driverId: 'd1', patient: 'First Rider' }, driverKey: 'd1', originCity: 'Indianapolis', destinationCity: 'Carmel', tripPickupCity: 'Carmel', tripDropoffCity: 'Muncie', unloadedMiles: 25, waitHours: 1, isOverrideCandidate: true, overrideType: 'both' },
      { legType: 'home_return', legLabel: 'Return home', trip: { id: '2', bookingId: 'B-200', driverId: 'd2', patient: 'Second Rider' }, driverKey: 'd2', originCity: 'Carmel', destinationCity: 'Fishers', tripPickupCity: 'Muncie', tripDropoffCity: 'Carmel', unloadedMiles: 50, waitHours: 2, isOverrideCandidate: true, overrideType: 'both' },
    ];
    const filtered = filterTripCostOverrideRows(rows, {
      search: 'second driver',
      driverKey: 'd2',
      legType: 'home_return',
      minimumUnloadedMiles: 40,
      minimumWaitHours: 1.5,
      gapFromCity: 'CARMEL',
      gapToCity: 'Fishers, IN',
      driverNamesById: new Map([['d2', 'Second Driver']]),
    });
    expect(filtered.map((row) => row.trip.bookingId)).toEqual(['B-200']);
  });

  it('records and searches client names from supported trip name fields', () => {
    const result = analyze([trip('client-name', { patient: '', clientName: '', memberName: 'Elizabeth McCandless' })]);
    expect(result.rows).not.toHaveLength(0);
    expect(result.rows.every((row) => row.clientName === 'Elizabeth McCandless')).toBe(true);
    expect(filterTripCostOverrideRows(result.rows, { candidateType: 'all', search: 'elizabeth' })).toHaveLength(result.rows.length);
  });

  it('shows only real candidates by default and keeps explicit audit views', () => {
    const rows = [
      { trip: { id: 'mileage' }, driverKey: 'd1', unloadedMiles: 30, waitHours: 0, isOverrideCandidate: true, overrideType: 'mileage', requiresReview: false },
      { trip: { id: 'waiting' }, driverKey: 'd1', unloadedMiles: 0, waitHours: 1.5, isOverrideCandidate: true, overrideType: 'waiting', requiresReview: false },
      { trip: { id: 'both' }, driverKey: 'd1', unloadedMiles: 35, waitHours: 2, isOverrideCandidate: true, overrideType: 'both', requiresReview: false },
      { trip: { id: 'zero' }, driverKey: 'd1', unloadedMiles: 0, waitHours: 0, isOverrideCandidate: false, overrideType: 'none', requiresReview: false },
      { trip: { id: 'review' }, driverKey: 'd1', unloadedMiles: 0, waitHours: 0, isOverrideCandidate: false, overrideType: 'none', requiresReview: true },
    ];
    expect(filterTripCostOverrideRows(rows).map((row) => row.trip.id)).toEqual(['mileage', 'waiting', 'both']);
    expect(filterTripCostOverrideRows(rows, { candidateType: 'mileage' }).map((row) => row.trip.id)).toEqual(['mileage', 'both']);
    expect(filterTripCostOverrideRows(rows, { candidateType: 'waiting' }).map((row) => row.trip.id)).toEqual(['waiting', 'both']);
    expect(filterTripCostOverrideRows(rows, { candidateType: 'both' }).map((row) => row.trip.id)).toEqual(['both']);
    expect(filterTripCostOverrideRows(rows, { candidateType: 'review' }).map((row) => row.trip.id)).toEqual(['review']);
    expect(filterTripCostOverrideRows(rows, { candidateType: 'all' })).toHaveLength(5);
  });

  it('extracts city names and normalizes incomplete settings to safe defaults', () => {
    expect(extractCityFromAddress('10409 Parmer Cir, Fishers, IN 46038, USA')).toBe('Fishers');
    expect(extractCityFromAddress('500 Main St, Louisville, Kentucky, USA')).toBe('Louisville');
    expect(extractCityFromAddress('13000 North Main Street  Rushville In 46173')).toBe('Rushville');
    expect(extractCityFromAddress('4485 Malden Ln  Beech Grove Indiana 46107')).toBe('Beech Grove');
    expect(normalizeOverridePolicy({ unloadedRate: -1, waitRoundingMinutes: 0 })).toMatchObject({ unloadedRate: DEFAULT_OVERRIDE_POLICY.unloadedRate, waitRoundingMinutes: 1 });
    expect(isOverridePolicyDocumentValid(DEFAULT_OVERRIDE_POLICY)).toBe(true);
    expect(isOverridePolicyDocumentValid({ ...DEFAULT_OVERRIDE_POLICY, waitRate: '9' })).toBe(false);
    expect(isOverridePolicyDocumentValid({ ...DEFAULT_OVERRIDE_POLICY, overrideExclusionRules: [{ scope: 'wrong', fromCity: 'Indianapolis', toCity: '*' }] })).toBe(false);
    expect(isOverridePolicyDocumentValid({ ...DEFAULT_OVERRIDE_POLICY, overrideExclusionRules: [{ scope: 'waiting', fromCity: '', toCity: '*' }] })).toBe(false);
    expect(normalizeOverridePolicy({
      overrideExclusionRules: [
        { scope: 'waiting', fromCity: 'Indianapolis', toCity: 'Carmel' },
        { scope: 'mileage', fromCity: 'Indianapolis', toCity: 'Carmel' },
      ],
    }).overrideExclusionRules).toEqual([{ id: 'all:indianapolis:carmel', scope: 'all', fromCity: 'Indianapolis', toCity: 'Carmel' }]);
  });

  it('invalidates cached home mileage when the shared home address changes', () => {
    const base = { driverKey: 'driver-1', serviceDate: '2026-08-30', legType: 'home_return', tripId: 'B-100', origin: 'Boonville, IN' };
    expect(getBoundaryDistanceKey({ ...base, destination: 'Old home, Fishers, IN' }))
      .not.toBe(getBoundaryDistanceKey({ ...base, destination: 'New home, Fishers, IN' }));
  });
});
