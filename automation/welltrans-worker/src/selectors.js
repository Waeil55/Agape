const defaults = {
  bookingSearch: 'input[placeholder*="Booking" i], input[aria-label*="Booking" i]',
  searchButton: 'button:has-text("Search")',
  resultRow: 'tr',
  activityCell: 'td',
  driver: 'input[aria-label*="Driver" i], select[aria-label*="Driver" i]',
  vehicle: 'input[aria-label*="Vehicle" i], select[aria-label*="Vehicle" i]',
  arrival: 'input[aria-label*="Arrival" i]',
  departure: 'input[aria-label*="Departure" i]',
  mileage: 'input[aria-label*="Mileage" i], input[aria-label*="Odometer" i]',
  signature: 'select[aria-label*="Signature" i], input[aria-label*="Signature" i]',
  save: 'button:has-text("Apply"), button:has-text("Save")',
  success: 'text=/saved|updated|success/i',
};

export const selectors = (() => {
  try { return { ...defaults, ...JSON.parse(process.env.WELLTRANS_SELECTORS_JSON || '{}') }; }
  catch { throw new Error('WELLTRANS_SELECTORS_JSON is not valid JSON'); }
})();

