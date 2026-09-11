function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return '';
}

function escapeVCardValue(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .trim();
}

export function buildClientContactVCard(name, phone) {
  const safePhone = normalizePhone(phone);
  if (!safePhone) return '';
  const safeName = escapeVCardValue(name || 'Agape Care Client');
  return [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${safeName}`,
    `N:;${safeName};;;`,
    `TEL;TYPE=CELL:${safePhone}`,
    'NOTE:Agape Care transportation client',
    'END:VCARD',
    '',
  ].join('\r\n');
}

export function clientContactFileName(name) {
  const safeBase = String(name || 'Agape Care Client')
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9 _-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60) || 'Agape-Care-Client';
  return `${safeBase}.vcf`;
}

export function openClientContactCard(name, phone) {
  const vCard = buildClientContactVCard(name, phone);
  if (!vCard || typeof document === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return false;

  const objectUrl = URL.createObjectURL(new Blob([vCard], { type: 'text/vcard;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = clientContactFileName(name);
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
  return true;
}
