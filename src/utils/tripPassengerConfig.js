// Interprets the short NEMT broker codes (WellTrans/Medicaid broker exports)
// for who is riding and what they need — e.g. "AM1" (1 ambulatory), "WC1"
// (1 wheelchair), "ESCORT1" (1 escort riding along) — into a readable trip
// detail instead of dropping them on import.

const CODE_LABELS = {
  AM: 'Ambulatory',
  WC: 'Wheelchair',
  WHEELCHAIR: 'Wheelchair',
  STR: 'Stretcher',
  STRETCHER: 'Stretcher',
  ESC: 'Escort',
  ESCORT: 'Escort',
  CANE: 'Cane',
  WALKER: 'Walker',
  CRUTCH: 'Crutches',
  CRUTCHES: 'Crutches',
};

// "Passenger Types" (ADULT1/CHILD1) describes the rider category, not a
// mobility need — it is captured on the trip but left out of the on-screen
// summary so the badge stays focused on wheelchair/ambulatory/escort.
const SUMMARY_EXCLUDED_CODES = new Set(['ADULT', 'CHILD', 'PEDS', 'PEDIATRIC']);

function parseCodeTokens(raw) {
  if (!raw) return [];
  const tokens = String(raw).toUpperCase().match(/[A-Z]+\d*/g) || [];
  return tokens.map((token) => {
    const match = token.match(/^([A-Z]+?)(\d+)?$/);
    const code = match?.[1] || token;
    const count = match?.[2] ? Number(match[2]) : null;
    return { code, count, label: CODE_LABELS[code] || null };
  }).filter((t) => t.label);
}

/**
 * Human-readable mobility/escort summary for a trip, e.g.
 * ["Wheelchair", "1 Escort"]. Reads the raw imported broker fields; falls
 * back to the app's own `wheelchair` flag when no broker codes are present.
 */
export function summarizeTripPassengerConfig(trip = {}) {
  const tokens = [
    ...parseCodeTokens(trip.spaceTypes),
    ...parseCodeTokens(trip.mobilityAids),
    ...parseCodeTokens(trip.passengerTypes).filter((t) => !SUMMARY_EXCLUDED_CODES.has(t.code)),
  ];
  const byLabel = new Map();
  tokens.forEach(({ label, count }) => {
    const existing = byLabel.get(label);
    if (existing && count) byLabel.set(label, existing + count);
    else if (!byLabel.has(label)) byLabel.set(label, count || null);
  });
  if (byLabel.size === 0 && trip.wheelchair) byLabel.set('Wheelchair', null);
  return [...byLabel.entries()].map(([label, count]) => (count && count > 1 ? `${count} ${label}` : label));
}

/** True when any broker code or free-text mobility aid indicates a wheelchair. */
export function detectWheelchairFromPassengerConfig(trip = {}) {
  return [
    ...parseCodeTokens(trip.spaceTypes),
    ...parseCodeTokens(trip.mobilityAids),
  ].some((t) => t.code === 'WC' || t.code === 'WHEELCHAIR');
}
