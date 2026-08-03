const CLOCK_PATTERN = /^(\d{1,2}):(\d{2})$/;

export const clockMinutes = value => {
  const match = String(value || '').trim().match(CLOCK_PATTERN);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return (hours * 60) + minutes;
};

export const isClockBefore = (candidate, lowerBound) => {
  const candidateMinutes = clockMinutes(candidate);
  const lowerBoundMinutes = clockMinutes(lowerBound);
  return candidateMinutes !== null
    && lowerBoundMinutes !== null
    && candidateMinutes < lowerBoundMinutes;
};

export const normalizeCompletionClocks = ({
  pickupArrival = '', pickupDeparture = '', dropoffArrival = '', now = '',
} = {}) => {
  let departure = pickupDeparture || now || pickupArrival;
  if (!departure || isClockBefore(departure, pickupArrival)) departure = pickupArrival || now;

  let dropoff = dropoffArrival || now || departure;
  if (!dropoff || isClockBefore(dropoff, departure)) dropoff = departure;

  return { pickupDeparture: departure, dropoffArrival: dropoff };
};

export const minuteEpoch = value => {
  const milliseconds = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(milliseconds) ? Math.floor(milliseconds / 60_000) : NaN;
};
