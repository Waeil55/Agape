const COLOR_CLASSES = [
  'bg-blue-600',
  'bg-emerald-600',
  'bg-amber-600',
  'bg-rose-600',
  'bg-cyan-600',
  'bg-violet-600',
  'bg-teal-600',
  'bg-slate-700',
];

export const CHAT_PAGE_SIZE = 60;

export function normalizeEmail(value = '') {
  return String(value || '').trim().toLowerCase();
}

export function normalizePhone(value = '') {
  return String(value || '').replace(/\D/g, '');
}

export function readableName(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return 'Unknown';
  const withoutDomain = raw.includes('@') ? raw.split('@')[0] : raw;
  return withoutDomain
    .replace(/[._-]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || raw;
}

export function getInitials(name = '') {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function avatarColor(seed = '') {
  const source = String(seed || 'unknown');
  let hash = 0;
  for (let i = 0; i < source.length; i += 1) {
    hash = ((hash << 5) - hash) + source.charCodeAt(i);
    hash |= 0;
  }
  return COLOR_CLASSES[Math.abs(hash) % COLOR_CLASSES.length];
}

export function toDate(value) {
  if (!value) return null;
  if (typeof value?.toDate === 'function') return value.toDate();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatClock(value) {
  const date = toDate(value);
  if (!date) return '';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function formatConversationTime(value) {
  const date = toDate(value);
  if (!date) return '';
  const now = new Date();
  const today = now.toDateString();
  const yesterday = new Date(now.getTime() - 86400000).toDateString();
  if (date.toDateString() === today) return formatClock(date);
  if (date.toDateString() === yesterday) return 'Yesterday';
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function formatDateDivider(value) {
  const date = toDate(value);
  if (!date) return '';
  const now = new Date();
  const today = now.toDateString();
  const yesterday = new Date(now.getTime() - 86400000).toDateString();
  if (date.toDateString() === today) return 'Today';
  if (date.toDateString() === yesterday) return 'Yesterday';
  return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

export function isDifferentDay(a, b) {
  const first = toDate(a);
  const second = toDate(b);
  if (!first || !second) return false;
  return first.toDateString() !== second.toDateString();
}

export function formatPhoneNumber(value = '') {
  const phone = normalizePhone(value);
  if (phone.length === 10) return `(${phone.slice(0, 3)}) ${phone.slice(3, 6)}-${phone.slice(6)}`;
  if (phone.length === 11 && phone.startsWith('1')) {
    return `+1 (${phone.slice(1, 4)}) ${phone.slice(4, 7)}-${phone.slice(7)}`;
  }
  return value || '';
}

export function truncateText(value = '', max = 90) {
  const text = typeof value === 'string' ? value : String(value?.text || '');
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}...`;
}

export function buildConversationTitle(conversation, contactsByEmail, currentUserEmail) {
  if (!conversation) return 'Select a conversation';
  if (conversation.name) return conversation.name;
  if (conversation.isClient) return conversation.clientName || formatPhoneNumber(conversation.phone) || 'Client conversation';
  const others = (conversation.participants || [])
    .map(normalizeEmail)
    .filter(email => email && email !== normalizeEmail(currentUserEmail));
  if (others.length === 0) return 'Personal notes';
  return others.map(email => contactsByEmail.get(email)?.name || readableName(email)).join(', ');
}

export function buildConversationSubtitle(conversation, contactsByEmail, currentUserEmail) {
  if (!conversation) return '';
  if (conversation.isClient) return formatPhoneNumber(conversation.phone) || 'Client SMS';
  const others = (conversation.participants || [])
    .map(normalizeEmail)
    .filter(email => email && email !== normalizeEmail(currentUserEmail));
  if (others.length === 0) return 'Only you';
  return others.map(email => contactsByEmail.get(email)?.role || 'team').join(' + ');
}

export function shouldGroupMessage(previous, current, currentUserEmail) {
  if (!previous || !current) return false;
  if (previous.sender !== current.sender) return false;
  if (isDifferentDay(previous.timestamp, current.timestamp)) return false;
  const prevDate = toDate(previous.timestamp);
  const currDate = toDate(current.timestamp);
  if (!prevDate || !currDate) return false;
  return Math.abs(currDate.getTime() - prevDate.getTime()) < 5 * 60 * 1000
    && normalizeEmail(current.sender) === normalizeEmail(previous.sender)
    && normalizeEmail(current.sender) !== normalizeEmail(currentUserEmail);
}

export function makeConversationId(prefix = 'team') {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return `${prefix}_${crypto.randomUUID()}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function uniqueContacts(...groups) {
  const map = new Map();
  groups.flat().forEach(item => {
    const email = normalizeEmail(item?.email || item?.id);
    if (!email) return;
    const name = item?.name || item?.displayName || item?.username || readableName(email);
    const role = item?.role || item?.type || 'team';
    map.set(email, { ...item, email, name, role });
  });
  return Array.from(map.values()).sort((a, b) => String(a.name).localeCompare(String(b.name)));
}
