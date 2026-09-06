export const MAX_TRIP_FARE = 5000;

export const TRIP_FARE_HEADER_ALIASES = Object.freeze([
  'Original Trip Cost',
  'Original Cost',
  'Trip Cost',
  'Base Cost',
  'Base Fare',
  'Provider Cost',
  'Provider Pay',
  'Fare',
  'Cost',
]);

const normalizeHeader = (value) => String(value ?? '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '');

const missingResult = Object.freeze({
  status: 'missing',
  amount: null,
  reason: 'Original trip cost was not provided',
});

export const parseTripFare = (value) => {
  if (value === undefined || value === null || String(value).trim() === '') return { ...missingResult };

  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0 || value > MAX_TRIP_FARE) {
      return { status: 'invalid', amount: null, reason: `Original trip cost must be between $0 and $${MAX_TRIP_FARE.toLocaleString('en-US')}` };
    }
    return { status: 'valid', amount: Math.round((value + Number.EPSILON) * 100) / 100, reason: 'Verified numeric original trip cost' };
  }

  const source = String(value).trim();
  const standaloneCurrency = /^(?:USD\s*)?\$?\s*(?:(?:\d{1,3}(?:,\d{3})+)|\d+)(?:\.\d{1,2})?\s*(?:USD)?$/i;
  if (!standaloneCurrency.test(source)) {
    return { status: 'invalid', amount: null, reason: 'Original trip cost contains non-currency text or multiple values' };
  }

  const amount = Number(source.replace(/USD|\$|,|\s/gi, ''));
  if (!Number.isFinite(amount) || amount < 0 || amount > MAX_TRIP_FARE) {
    return { status: 'invalid', amount: null, reason: `Original trip cost must be between $0 and $${MAX_TRIP_FARE.toLocaleString('en-US')}` };
  }
  return { status: 'valid', amount: Math.round((amount + Number.EPSILON) * 100) / 100, reason: 'Verified standalone currency value' };
};

export const findTripFareColumn = (headers = []) => {
  const aliases = new Set(TRIP_FARE_HEADER_ALIASES.map(normalizeHeader));
  return (headers || []).find((header) => aliases.has(normalizeHeader(header))) || null;
};

export const readImportedTripFare = (row = {}) => {
  const header = findTripFareColumn(Object.keys(row || {}));
  if (!header) return { ...missingResult, header: null };
  return { ...parseTripFare(row[header]), header };
};

