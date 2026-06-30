/**
 * Normalize any date input to YYYY-MM-DD string.
 * Handles ISO (YYYY-MM-DD), US (MM/DD/YYYY), and other parseable formats.
 *
 * IMPORTANT: ISO dates are parsed via regex to avoid UTC day-shift bugs.
 * This function is shared across upload and display logic.
 */
export function normalizeDateValue(value) {
  if (!value) return '';
  const raw = String(value).trim();

  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    return `${iso[1]}-${String(iso[2]).padStart(2, '0')}-${String(iso[3]).padStart(2, '0')}`;
  }

  const simple = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (simple) {
    const month = String(simple[1]).padStart(2, '0');
    const day = String(simple[2]).padStart(2, '0');
    const year = simple[3].length === 2 ? `20${simple[3]}` : simple[3];
    return `${year}-${month}-${day}`;
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
  }
  return '';
}
