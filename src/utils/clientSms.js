import { localCalendarYmd, tripCalendarDateKey } from './tripDate';

export const CLIENT_SMS_BRAND = 'Agape Care';
export const CLIENT_SMS_OPT_OUT = 'Reply STOP to opt out.';
export const AGAPE_BUSINESS_SMS_NUMBER = '+18552223330';

export const QUICK_SMS_TEMPLATES = Object.freeze([
  { id: 'tomorrow', label: 'Tomorrow Trip', body: "confirming your scheduled transportation for tomorrow. Please reply YES or NO.", driverBody: "I'm confirming your scheduled transportation for tomorrow. Please reply YES or NO." },
  { id: 'today', label: 'Today Trip', body: "confirming your scheduled transportation for today. Please reply YES or NO.", driverBody: "I'm confirming your scheduled transportation for today. Please reply YES or NO." },
  { id: 'soon', label: 'On My Way Soon', body: "your driver will be on the way shortly. Please reply if anything has changed.", driverBody: "I'll be on the way shortly. Please reply if anything has changed." },
  { id: 'way', label: 'On My Way', body: 'your driver is on the way for your scheduled pickup.', driverBody: "I'm on the way for your scheduled pickup." },
  { id: 'ready', label: 'Pickup / Ready Time', body: "what time do you expect to be ready for pickup?", driverBody: 'What time do you expect to be ready for pickup?' },
  { id: 'checkin', label: 'Checking In', body: 'checking in about your scheduled transportation. Please reply if anything has changed.', driverBody: "I'm checking in about your scheduled transportation. Please reply if anything has changed." },
  { id: 'arrived', label: "I've Arrived", body: "your driver has arrived. Please reply when you're ready.", driverBody: "I've arrived. Please reply when you're ready." },
]);

export function clientFirstName(trip = {}) {
  return String(trip.patient || trip.clientName || trip.memberName || '')
    .trim()
    .split(/\s+/)[0] || 'there';
}

export function prepareClientSmsText(message, trip = {}) {
  const compact = String(message || '').replace(/\s+/g, ' ').trim();
  if (!compact) return '';
  const greeting = `Hi ${clientFirstName(trip)},`;
  const branded = /^agape care\b/i.test(compact)
    ? compact
    : `${CLIENT_SMS_BRAND}: ${/^hi\b/i.test(compact) ? compact : `${greeting} ${compact}`}`;
  return /\breply\s+stop\b/i.test(branded)
    ? branded
    : `${branded} ${CLIENT_SMS_OPT_OUT}`;
}

export function buildQuickSmsText(template, trip = {}) {
  return prepareClientSmsText(template?.body || '', trip);
}

export function buildDriverQuickSmsText(template, trip = {}) {
  const body = String(template?.driverBody || template?.body || '').replace(/\s+/g, ' ').trim();
  if (!body) return '';
  return `Hi ${clientFirstName(trip)}, this is your Agape Care driver. ${body}`;
}

export function businessSmsErrorPresentation(error = {}) {
  const code = String(error?.code || '').replace(/^functions\//i, '').toLowerCase();
  const raw = String(error?.message || '')
    .replace(/^Firebase(?:Error)?:\s*/i, '')
    .replace(/^\[functions\/[^\]]+\]\s*/i, '')
    .replace(/^Error:\s*/i, '')
    .trim();

  if (code === 'unauthenticated') return { message: 'Your session expired. Sign in again before sending business SMS.', retryable: false };
  if (code === 'permission-denied') return { message: 'Business SMS is available only to administrators and dispatchers.', retryable: false };
  if (code === 'aborted') return { message: raw || 'This exact message is still processing. Check the conversation before retrying.', retryable: true };
  if (code === 'invalid-argument' || code === 'not-found' || code === 'failed-precondition' || code === 'data-loss') {
    return { message: raw || 'Business SMS is blocked until its required data is corrected.', retryable: false };
  }
  if (code === 'unavailable') return { message: raw || 'Business SMS is temporarily unavailable. Retry the same message once.', retryable: true };
  if (code === 'internal' || /^internal(?:\s*\[\d+\])?$/i.test(raw) || /internal\s*\[\d+\]/i.test(raw)) {
    return { message: 'Business SMS could not complete the request. Run Business SMS diagnostics in Settings before trying again.', retryable: false };
  }
  return { message: raw || 'Business SMS could not complete the request. Run Business SMS diagnostics in Settings.', retryable: false };
}

export function businessSmsErrorMessage(error = {}) {
  return businessSmsErrorPresentation(error).message;
}

export function createSmsRequestId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function suggestedQuickSmsTemplateId(trip = {}, now = new Date()) {
  const tripDate = tripCalendarDateKey(trip.date || trip.scheduleDate || trip.scheduledPickupAt);
  const today = localCalendarYmd(now);
  const tomorrow = localCalendarYmd(new Date(now.getTime() + 86_400_000));
  if (tripDate === today) return 'today';
  if (tripDate === tomorrow) return 'tomorrow';
  return null;
}
