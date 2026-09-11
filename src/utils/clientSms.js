import { localCalendarYmd, tripCalendarDateKey } from './tripDate';

export const CLIENT_SMS_BRAND = 'Agape Care';
export const CLIENT_SMS_OPT_OUT = 'Reply STOP to opt out.';

export const QUICK_SMS_TEMPLATES = Object.freeze([
  { id: 'tomorrow', label: 'Tomorrow Trip', body: "confirming your scheduled transportation for tomorrow. Please reply YES or NO." },
  { id: 'today', label: 'Today Trip', body: "confirming your scheduled transportation for today. Please reply YES or NO." },
  { id: 'soon', label: 'On My Way Soon', body: "your driver will be on the way shortly. Please reply if anything has changed." },
  { id: 'way', label: 'On My Way', body: 'your driver is on the way for your scheduled pickup.' },
  { id: 'ready', label: 'Pickup / Ready Time', body: "what time do you expect to be ready for pickup?" },
  { id: 'checkin', label: 'Checking In', body: 'checking in about your scheduled transportation. Please reply if anything has changed.' },
  { id: 'arrived', label: "I've Arrived", body: "your driver has arrived. Please reply when you're ready." },
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

export function suggestedQuickSmsTemplateId(trip = {}, now = new Date()) {
  const tripDate = tripCalendarDateKey(trip.date || trip.scheduleDate || trip.scheduledPickupAt);
  const today = localCalendarYmd(now);
  const tomorrow = localCalendarYmd(new Date(now.getTime() + 86_400_000));
  if (tripDate === today) return 'today';
  if (tripDate === tomorrow) return 'tomorrow';
  return null;
}
