export const IN_OUT_WAIT_MINUTES = 5;

const IN_OUT_RE = /\bIN\s*(?:\/|-|\s)\s*OUT\b/i;

export const hasInOutMarker = (value) => {
  if (value === undefined || value === null) return false;
  return IN_OUT_RE.test(String(value));
};

export const isInOutTrip = (trip = {}) => {
  if (!trip) return false;
  if (trip.inOutTrip || trip.inOut || trip.tripKind === 'IN_OUT') return true;
  return [
    trip.time,
    trip.dropoffTime,
    trip.type,
    trip.purpose,
    trip.notes,
    trip.serviceType,
    trip.transportType,
  ].some(hasInOutMarker);
};

export const getBookingNumber = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const matches = raw.match(/\d+/g);
  if (!matches || matches.length === 0) return null;
  const numeric = Number(matches[matches.length - 1]);
  return Number.isFinite(numeric) ? numeric : null;
};

const getTripBookingNumber = (trip = {}) => getBookingNumber(trip.bookingId || trip.tripNumber || trip.id);

const normalizePairText = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

const groupKeyForTrip = (trip = {}) => [
  normalizePairText(trip.date || trip.scheduleDate || ''),
  normalizePairText(trip.patient || trip.clientName || ''),
  normalizePairText(trip.driverId || trip.driverEmail || ''),
].join('|');

const markPair = (target, aTrip, bTrip, baseNumber) => {
  const groupId = `INOUT-${aTrip.date || aTrip.scheduleDate || 'date'}-${baseNumber || aTrip.bookingId || aTrip.id}`;
  target.set(aTrip.id, {
    ...aTrip,
    inOutTrip: true,
    tripKind: 'IN_OUT',
    inOutStayWithClient: true,
    inOutWaitMinutes: IN_OUT_WAIT_MINUTES,
    inOutGroupId: groupId,
    inOutGroupBookingId: String(baseNumber || aTrip.bookingId || aTrip.id || ''),
    inOutLeg: 'A',
    inOutPairBookingId: bTrip.bookingId || bTrip.id || '',
    inOutPairTripId: bTrip.id || '',
  });
  target.set(bTrip.id, {
    ...bTrip,
    inOutTrip: true,
    tripKind: 'IN_OUT',
    inOutStayWithClient: true,
    inOutWaitMinutes: IN_OUT_WAIT_MINUTES,
    inOutGroupId: groupId,
    inOutGroupBookingId: String(baseNumber || aTrip.bookingId || aTrip.id || ''),
    inOutLeg: 'B',
    inOutPairBookingId: aTrip.bookingId || aTrip.id || '',
    inOutPairTripId: aTrip.id || '',
  });
};

export const annotateInOutPairs = (trips = []) => {
  const byId = new Map((trips || []).filter(Boolean).map((trip) => [trip.id, { ...trip }]));
  const groups = new Map();

  (trips || []).filter(Boolean).forEach((trip, index) => {
    const item = { ...trip, _inOutOrder: index, _inOutBookingNumber: getTripBookingNumber(trip) };
    const key = groupKeyForTrip(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });

  groups.forEach((items) => {
    const byNumber = new Map();
    items.forEach((item) => {
      if (item._inOutBookingNumber !== null) byNumber.set(item._inOutBookingNumber, item);
    });

    const paired = new Set();
    const markedItems = items
      .filter(isInOutTrip)
      .sort((a, b) => (a._inOutBookingNumber ?? Number.MAX_SAFE_INTEGER) - (b._inOutBookingNumber ?? Number.MAX_SAFE_INTEGER) || a._inOutOrder - b._inOutOrder);

    markedItems.forEach((item) => {
      if (paired.has(item.id)) return;
      const n = item._inOutBookingNumber;
      if (n === null) {
        byId.set(item.id, {
          ...byId.get(item.id),
          inOutTrip: true,
          tripKind: 'IN_OUT',
          inOutStayWithClient: true,
          inOutWaitMinutes: IN_OUT_WAIT_MINUTES,
          inOutLeg: byId.get(item.id)?.inOutLeg || 'A',
        });
        paired.add(item.id);
        return;
      }

      const base = n % 2 === 0 ? n : n - 1;
      const aTrip = byNumber.get(base);
      const bTrip = byNumber.get(base + 1);
      if (aTrip && bTrip && !paired.has(aTrip.id) && !paired.has(bTrip.id)) {
        markPair(byId, byId.get(aTrip.id) || aTrip, byId.get(bTrip.id) || bTrip, base);
        paired.add(aTrip.id);
        paired.add(bTrip.id);
        return;
      }

      const nextTrip = byNumber.get(n + 1);
      if (nextTrip && !paired.has(nextTrip.id)) {
        markPair(byId, byId.get(item.id) || item, byId.get(nextTrip.id) || nextTrip, n);
        paired.add(item.id);
        paired.add(nextTrip.id);
        return;
      }

      byId.set(item.id, {
        ...byId.get(item.id),
        inOutTrip: true,
        tripKind: 'IN_OUT',
        inOutStayWithClient: true,
        inOutWaitMinutes: IN_OUT_WAIT_MINUTES,
        inOutGroupId: `INOUT-${item.date || item.scheduleDate || 'date'}-${item.bookingId || item.id}`,
        inOutGroupBookingId: String(item.bookingId || item.id || ''),
        inOutLeg: byId.get(item.id)?.inOutLeg || 'A',
      });
      paired.add(item.id);
    });
  });

  return (trips || []).map((trip) => {
    const next = byId.get(trip.id) || trip;
    const { _inOutOrder, _inOutBookingNumber, ...clean } = next;
    return clean;
  });
};

export const compareInOutStack = (a = {}, b = {}) => {
  const aInOut = isInOutTrip(a);
  const bInOut = isInOutTrip(b);
  if (aInOut !== bInOut) return aInOut ? -1 : 1;
  if (!aInOut && !bInOut) return 0;

  const aGroup = String(a.inOutGroupBookingId || getTripBookingNumber(a) || '');
  const bGroup = String(b.inOutGroupBookingId || getTripBookingNumber(b) || '');
  const aGroupNum = getBookingNumber(aGroup);
  const bGroupNum = getBookingNumber(bGroup);
  if (aGroupNum !== null && bGroupNum !== null && aGroupNum !== bGroupNum) return aGroupNum - bGroupNum;
  if (aGroup !== bGroup) return aGroup.localeCompare(bGroup);

  const legRank = { A: 0, B: 1 };
  const aLeg = legRank[String(a.inOutLeg || '').toUpperCase()] ?? 0;
  const bLeg = legRank[String(b.inOutLeg || '').toUpperCase()] ?? 0;
  if (aLeg !== bLeg) return aLeg - bLeg;

  return (getTripBookingNumber(a) ?? 0) - (getTripBookingNumber(b) ?? 0);
};

const findPairTrip = (trip, byId, byBookingId) => {
  const pairById = trip.inOutPairTripId ? byId.get(String(trip.inOutPairTripId)) : null;
  if (pairById) return pairById;
  const pairByBooking = trip.inOutPairBookingId ? byBookingId.get(String(trip.inOutPairBookingId)) : null;
  if (pairByBooking) return pairByBooking;

  const n = getTripBookingNumber(trip);
  if (n === null) return null;
  const target = String((String(trip.inOutLeg || '').toUpperCase() === 'B') ? n - 1 : n + 1);
  return byBookingId.get(target) || null;
};

export const stackInOutPairs = (trips = []) => {
  const input = (trips || []).filter(Boolean);
  const byId = new Map(input.map((trip) => [String(trip.id), trip]));
  const byBookingId = new Map();
  input.forEach((trip) => {
    const booking = String(trip.bookingId || trip.tripNumber || trip.id || '');
    if (booking) byBookingId.set(booking, trip);
    const n = getTripBookingNumber(trip);
    if (n !== null) byBookingId.set(String(n), trip);
  });

  const used = new Set();
  const stacked = [];

  input.forEach((trip) => {
    if (used.has(trip.id)) return;
    if (!isInOutTrip(trip)) {
      stacked.push(trip);
      used.add(trip.id);
      return;
    }

    const pair = findPairTrip(trip, byId, byBookingId);
    if (pair && !used.has(pair.id) && isInOutTrip(pair)) {
      const tripLeg = String(trip.inOutLeg || '').toUpperCase();
      const pairLeg = String(pair.inOutLeg || '').toUpperCase();
      let first = trip;
      let second = pair;

      if (tripLeg === 'B' || pairLeg === 'A') {
        first = pair;
        second = trip;
      } else if (!tripLeg && !pairLeg && compareInOutStack(pair, trip) < 0) {
        first = pair;
        second = trip;
      }

      stacked.push(first, second);
      used.add(first.id);
      used.add(second.id);
      return;
    }

    stacked.push(trip);
    used.add(trip.id);
  });

  return stacked;
};
