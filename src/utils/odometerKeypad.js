export const ODOMETER_KEYPAD_MAX_DIGITS = 10;

export const applyOdometerKey = (currentValue, key, maxDigits = ODOMETER_KEYPAD_MAX_DIGITS) => {
  const digits = String(currentValue ?? '').replace(/\D/g, '').slice(0, maxDigits);

  if (key === 'clear') return '';
  if (key === 'backspace') return digits.slice(0, -1);
  if (!/^\d$/.test(String(key))) return digits;
  if (digits.length >= maxDigits) return digits;

  return `${digits}${key}`;
};
