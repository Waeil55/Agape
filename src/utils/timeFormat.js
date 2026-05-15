/**
 * Robustly parses a time string into hours and minutes.
 * Supports: "08:30", "8:30", "08:30 PM", "8 PM", "14:20", etc.
 * @param {string} timeStr 
 * @returns {{hours: number, minutes: number} | null}
 */
export function parseTime(timeStr) {
  if (!timeStr) return null;
  let clean = String(timeStr).toUpperCase().trim();
  
  // If it's an ISO string (contains T), extract the time part
  if (clean.includes('T')) {
    const parts = clean.split('T');
    if (parts.length > 1) {
      // Extract HH:mm from HH:mm:ss.sssZ
      clean = parts[1].substring(0, 5);
    }
  }

  if (clean === 'WILL CALL' || clean === 'WC') return null;

  // Regex to match HH:MM AM/PM or HH AM/PM or HH:MM
  // Supports shorthands like "8P", "8PM", "8A", "8AM"
  const match = clean.match(/^(\d{1,2})(?::(\d{1,2}))?\s*([AP]M?|[AP])?/);
  if (!match) return null;

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2] || '0', 10);
  let meridiem = match[3];

  if (meridiem) {
    if (meridiem === 'P' || meridiem === 'PM') {
      if (hours < 12) hours += 12;
    } else if (meridiem === 'A' || meridiem === 'AM') {
      if (hours === 12) hours = 0;
    }
  }

  return { hours, minutes };
}

/**
 * Converts a time string to 24-hour formal format (HH:mm).
 * @param {string} timeStr 
 * @returns {string}
 */
export function to24h(timeStr) {
  const parsed = parseTime(timeStr);
  if (!parsed) return timeStr || '';
  return `${String(parsed.hours).padStart(2, '0')}:${String(parsed.minutes).padStart(2, '0')}`;
}

/**
 * Converts a time string to 12-hour AM/PM format (hh:mm AM/PM).
 * @param {string} timeStr 
 * @returns {string}
 */
export function to12h(timeStr) {
  const parsed = parseTime(timeStr);
  if (!parsed) return timeStr || '';

  let h = parsed.hours % 12;
  if (h === 0) h = 12;
  const m = String(parsed.minutes).padStart(2, '0');
  const p = parsed.hours >= 12 ? 'PM' : 'AM';

  return `${h}:${m} ${p}`;
}

/**
 * Converts a time string to total minutes from midnight for sorting.
 * @param {string} timeStr 
 * @returns {number}
 */
export function timeToMinutes(timeStr) {
  const parsed = parseTime(timeStr);
  if (!parsed) return 1440; // Default to end of day for unknown/will-call
  return parsed.hours * 60 + parsed.minutes;
}
