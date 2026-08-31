import { timeToMinutes, tripCalendarDateKey } from './tripDate';

const normalize = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

const tripReference = (trip) => normalize(
  trip?.bookingId || trip?.tripNumber || trip?.confirmationId || trip?.id
);

const sameTripRecord = (a, b) => {
  if (a === b) return true;
  const aId = normalize(a?.id);
  const bId = normalize(b?.id);
  if (aId && bId && aId === bId) return true;
  const aReference = tripReference(a);
  const bReference = tripReference(b);
  return Boolean(aReference && bReference && aReference === bReference);
};

const sameClient = (a, b) => {
  const aClient = normalize(a?.patient || a?.clientName || a?.memberName);
  const bClient = normalize(b?.patient || b?.clientName || b?.memberName);
  return Boolean(aClient && bClient && aClient === bClient);
};

const conflictLabel = (trip) => {
  const client = String(trip?.patient || trip?.clientName || trip?.memberName || 'Client').trim();
  const reference = String(trip?.bookingId || trip?.tripNumber || trip?.id || '').trim();
  return reference ? `${client} #${reference}` : client;
};

// A driver conflict represents two different clients assigned on the same
// service date less than the configured spacing apart. Duplicate records,
// multiple legs for the same client, and trips from different dates are not a
// driver double-booking and must never create a self-conflict banner.
export const buildDriverTimeConflicts = (trips = [], { minimumSpacingMinutes = 30, limit = 5 } = {}) => {
  const candidates = (Array.isArray(trips) ? trips : []).filter(Boolean);
  const detected = [];
  const flagged = new Set();

  for (let i = 0; i < candidates.length && detected.length < limit; i += 1) {
    for (let j = i + 1; j < candidates.length && detected.length < limit; j += 1) {
      const a = candidates[i];
      const b = candidates[j];
      if (sameTripRecord(a, b) || sameClient(a, b)) continue;

      const aDate = tripCalendarDateKey(a?.date);
      const bDate = tripCalendarDateKey(b?.date);
      if (!aDate || aDate !== bDate) continue;
      if (!a?.time || !b?.time || a.time === 'Will Call' || b.time === 'Will Call') continue;

      const timeA = timeToMinutes(a.time);
      const timeB = timeToMinutes(b.time);
      if (!Number.isFinite(timeA) || !Number.isFinite(timeB) || timeA >= 1440 || timeB >= 1440) continue;
      if (Math.abs(timeA - timeB) >= minimumSpacingMinutes) continue;

      const aReference = tripReference(a);
      const bReference = tripReference(b);
      if (!aReference || !bReference) continue;
      const pairKey = [aReference, bReference].sort().join('|');
      if (flagged.has(pairKey)) continue;
      flagged.add(pairKey);
      detected.push({
        aId: a.id || '',
        bId: b.id || '',
        aName: a.patient || a.clientName || a.memberName || 'Client',
        bName: b.patient || b.clientName || b.memberName || 'Client',
        aLabel: conflictLabel(a),
        bLabel: conflictLabel(b),
        timeA: a.time,
        timeB: b.time,
        serviceDate: aDate,
      });
    }
  }

  return detected;
};
