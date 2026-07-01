export const TELNYX_NUMBER = '+18552223330';

const PALETTE = ['#2b4c7e', '#e8455b', '#059669', '#7c3aed', '#ea580c', '#0891b2', '#be185d', '#65a30d', '#9333ea', '#0284c7'];

export const pickColor = (seed) => PALETTE[Math.abs([...(seed || '')].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0)) % PALETTE.length];

export const normalizeDialable = (raw) => {
  if (!raw) return '';
  const d = raw.replace(/\D/g, '');
  if (d.length === 10) return '+1' + d;
  if (d.length === 11 && d[0] === '1') return '+' + d;
  return '+' + d;
};

export const toDate = (ts) => {
  if (!ts) return null;
  if (ts?.toDate) return ts.toDate();
  const d = new Date(ts);
  return isNaN(d.getTime()) ? null : d;
};

export const ms = (ts) => toDate(ts)?.getTime() || 0;

export const clock = (ts) => {
  const d = toDate(ts);
  return d ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
};

export const stamp = (ts) => {
  const d = toDate(ts);
  if (!d) return '';
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return clock(ts);
  const y = new Date(now); y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'numeric', day: 'numeric' });
};

export const dayLabel = (ts) => {
  const d = toDate(ts);
  if (!d) return '';
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Today';
  const y = new Date(now); y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
};

export const sameDay = (a, b) => toDate(a)?.toDateString() === toDate(b)?.toDateString();
