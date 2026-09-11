'use strict';

function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return String(value || '').trim();
}

function verificationRows(response) {
  const payload = response?.data || response || {};
  if (Array.isArray(payload.records)) return payload.records;
  if (Array.isArray(payload.data)) return payload.data;
  if (payload.data && typeof payload.data === 'object') return [payload.data];
  return [];
}

function rowPhoneNumbers(row) {
  const values = row?.phone_numbers || row?.phoneNumbers || [];
  return (Array.isArray(values) ? values : [values])
    .map((value) => normalizePhone(value?.phone_number || value?.phoneNumber || value))
    .filter(Boolean);
}

function rowTime(row) {
  const parsed = Date.parse(row?.updated_at || row?.updatedAt || row?.created_at || row?.createdAt || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseTollFreeVerification(response, phoneNumber) {
  const target = normalizePhone(phoneNumber);
  const rows = verificationRows(response)
    .filter((row) => {
      const phones = rowPhoneNumbers(row);
      return phones.length === 0 || phones.includes(target);
    })
    .sort((a, b) => rowTime(b) - rowTime(a));
  const row = rows.find((entry) => String(
    entry?.verification_status || entry?.verificationStatus || entry?.status || '',
  ).trim().toLowerCase() === 'verified') || rows[0] || null;
  if (!row) return null;

  const status = String(row.verification_status || row.verificationStatus || row.status || '').trim();
  return {
    id: String(row.id || row.verification_request_id || row.verificationRequestId || '').trim(),
    status,
    normalizedStatus: status.toLowerCase(),
    reason: String(row.reason || row.rejection_reason || row.rejectionReason || '').replace(/\s+/g, ' ').trim(),
    businessName: String(row.business_name || row.businessName || '').trim(),
  };
}

module.exports = {
  parseTollFreeVerification,
};
