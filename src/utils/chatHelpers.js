export const getDMChannelId = (email1, email2) => {
  const sorted = [String(email1 || '').toLowerCase(), String(email2 || '').toLowerCase()].sort();
  return `dm_${sorted[0]}_${sorted[1]}`;
};

export const EMOJI_QUICK = [
  '\u{1F44D}', '\u2764\uFE0F', '\u{1F602}', '\u{1F62E}',
  '\u{1F622}', '\u{1F621}', '\u{1F389}', '\u{1F525}',
  '\u2705', '\u274C', '\u{1F64F}', '\u{1F4AA}',
];

export const formatChatTime = (timestamp) => {
  if (!timestamp) return '';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export const formatChatMessageTime = (timestamp) => {
  if (!timestamp) return '';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
};

export const formatFileSize = (bytes) => {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
};

export const getFileIcon = (fileName) => {
  const ext = (fileName || '').split('.').pop()?.toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return 'Image';
  if (['pdf', 'doc', 'docx'].includes(ext)) return 'FileText';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'Sheet';
  if (['mp4', 'mov', 'avi'].includes(ext)) return 'Video';
  if (['mp3', 'wav', 'ogg'].includes(ext)) return 'Music';
  return 'File';
};

export const getInitials = (name) => {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
};

export const getRoleColor = (role) => {
  switch (String(role || '').toLowerCase()) {
    case 'admin': return 'bg-rose-100 text-rose-700';
    case 'dispatcher': return 'bg-blue-100 text-blue-700';
    case 'driver': return 'bg-emerald-100 text-emerald-700';
    default: return 'bg-slate-100 text-slate-700';
  }
};

export const getAvatarColor = (email) => {
  const colors = [
    'bg-blue-500', 'bg-emerald-500', 'bg-violet-500', 'bg-amber-500',
    'bg-rose-500', 'bg-cyan-500', 'bg-pink-500', 'bg-indigo-500',
    'bg-teal-500', 'bg-orange-500',
  ];
  let hash = 0;
  for (let i = 0; i < (email || '').length; i++) {
    hash = email.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};
