export const ODOMETER_MAX_DIGITS = 10;

export const sanitizeOdometerInput = (value, maxDigits = ODOMETER_MAX_DIGITS) => (
  String(value ?? '').replace(/\D/g, '').slice(0, maxDigits)
);
