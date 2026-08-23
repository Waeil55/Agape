const normalizeIdentity = (value) => String(value || '').trim().toLowerCase();

const addUnique = (map, value, driver) => {
  const key = normalizeIdentity(value);
  if (!key) return;
  if (!map.has(key)) {
    map.set(key, driver);
    return;
  }
  if (map.get(key) !== driver) map.set(key, null);
};

/**
 * Build exact, ambiguity-aware driver indexes once for read-heavy mobile views.
 * A duplicate identity resolves to null instead of silently selecting one record.
 */
export const buildDriverIndex = (drivers = []) => {
  const byId = new Map();
  const byEmail = new Map();
  const byName = new Map();

  drivers.forEach((driver) => {
    if (!driver) return;
    addUnique(byId, driver.id, driver);
    addUnique(byId, driver.driverId, driver);
    addUnique(byId, driver.uid, driver);
    addUnique(byEmail, driver.email, driver);
    addUnique(byName, driver.name, driver);
  });

  return { byId, byEmail, byName };
};

export const findDriverInIndex = (index, identity = {}) => {
  if (!index) return null;
  // Do not fall back to identity.id: trip records use id for the trip itself,
  // and a coincidental collision must never be treated as a driver match.
  const id = normalizeIdentity(identity.driverId || identity.assignedDriverId);
  const email = normalizeIdentity(identity.driverEmail || identity.assignedDriverEmail || identity.email);
  const name = normalizeIdentity(identity.driverName || identity.assignedDriverName || identity.name);

  if (id && index.byId.has(id)) return index.byId.get(id);
  if (email && index.byEmail.has(email)) return index.byEmail.get(email);
  if (name && index.byName.has(name)) return index.byName.get(name);
  return null;
};
