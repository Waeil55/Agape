import React, { useMemo } from 'react';
import { db } from '../config/firebase';
import AgapeCareChat from './AgapeCareChat';

function normalizeEmail(value = '') {
  return String(value || '').trim().toLowerCase();
}

function nameFromEmail(value = '') {
  const prefix = String(value || '').split('@')[0] || 'Agape User';
  return prefix
    .replace(/[._-]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function normalizeRole(role = '') {
  const normalized = String(role || '').trim().toLowerCase();
  return ['admin', 'dispatcher', 'driver'].includes(normalized) ? normalized : 'driver';
}

function toTeamUser(item = {}, fallbackRole = 'driver') {
  const email = normalizeEmail(item.email || item.uid || item.id || '');
  const uid = item.uid || email || item.id || item.name;
  if (!uid) return null;
  return {
    uid,
    name: item.name || item.displayName || item.username || nameFromEmail(email || uid),
    role: normalizeRole(item.role || fallbackRole),
    online: item.online ?? item.clockedIn ?? item.status === 'Available',
  };
}

export default function ChatPage({
  user,
  currentUser,
  drivers = [],
  dispatchers = [],
  role,
}) {
  const currentUserEmail = normalizeEmail(user?.email || currentUser || '');
  const inferredRole = useMemo(() => {
    const explicitRole = normalizeRole(role);
    if (role && explicitRole) return explicitRole;
    if (drivers.some(driver => normalizeEmail(driver.email || driver.uid || driver.id) === currentUserEmail)) return 'driver';
    if (dispatchers.some(dispatcher => normalizeEmail(dispatcher.email || dispatcher.uid || dispatcher.id) === currentUserEmail)) return 'dispatcher';
    return 'driver';
  }, [currentUserEmail, dispatchers, drivers, role]);

  const currentUserProfile = useMemo(() => ({
    uid: user?.uid || currentUserEmail || 'agape_user',
    name: user?.displayName || user?.name || nameFromEmail(currentUserEmail),
    role: inferredRole,
    avatar: user?.photoURL || user?.avatar || '',
  }), [currentUserEmail, inferredRole, user]);

  const teamUsers = useMemo(() => {
    const map = new Map();
    [...dispatchers.map(item => toTeamUser(item, item.role || 'dispatcher')), ...drivers.map(item => toTeamUser(item, item.role || 'driver'))]
      .filter(Boolean)
      .forEach(item => map.set(item.uid, item));
    map.set(currentUserProfile.uid, { ...currentUserProfile, online: true });
    return Array.from(map.values());
  }, [currentUserProfile, dispatchers, drivers]);

  return (
    <AgapeCareChat
      db={db}
      currentUser={currentUserProfile}
      teamUsers={teamUsers}
    />
  );
}
