const SERVICE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const isValidWellTransServiceDate = (value) => {
  const normalized = String(value || '').trim();
  if (!SERVICE_DATE_PATTERN.test(normalized)) return false;

  const parsed = new Date(`${normalized}T12:00:00`);
  return !Number.isNaN(parsed.getTime())
    && parsed.toISOString().slice(0, 10) === normalized;
};
