export function findRemovedDocumentIds(previous = [], current = []) {
  const currentIds = new Set(
    (current || []).map((item) => String(item?.id || '')).filter(Boolean),
  );
  return [...new Set(
    (previous || [])
      .map((item) => String(item?.id || ''))
      .filter((id) => id && !currentIds.has(id)),
  )];
}

function comparableValue(value) {
  if (value === undefined) return null;
  if (value === null || typeof value !== 'object') return value;
  if (typeof value.toMillis === 'function') return { __timestampMillis: value.toMillis() };
  if (value instanceof Date) return { __dateIso: value.toISOString() };
  if (Array.isArray(value)) return value.map(comparableValue);
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = comparableValue(value[key]);
    return result;
  }, {});
}

export function firestoreRecordFingerprint(value) {
  return JSON.stringify(comparableValue(value));
}

export function planCollectionMutations(previous = [], current = [], { allowDeletes = true } = {}) {
  const previousById = new Map(
    (previous || []).filter((item) => item?.id).map((item) => [String(item.id), item]),
  );
  const currentById = new Map(
    (current || []).filter((item) => item?.id).map((item) => [String(item.id), item]),
  );
  const upserts = [];
  currentById.forEach((item, id) => {
    const prior = previousById.get(id);
    if (!prior || firestoreRecordFingerprint(prior) !== firestoreRecordFingerprint(item)) {
      upserts.push(item);
    }
  });
  const removedIds = allowDeletes
    ? [...previousById.keys()].filter((id) => !currentById.has(id))
    : [];
  return {
    upserts,
    removedIds,
    changed: upserts.length > 0 || removedIds.length > 0,
  };
}

export function applyFirestoreDocumentChanges(previous = [], changes = [], mapDocument = (itemDoc) => ({ id: itemDoc.id, ...itemDoc.data() })) {
  const recordsById = new Map(
    (previous || []).filter((item) => item?.id).map((item) => [String(item.id), item]),
  );
  (changes || []).forEach((change) => {
    const id = String(change?.doc?.id || '');
    if (!id) return;
    if (change.type === 'removed') {
      recordsById.delete(id);
      return;
    }
    const mapped = mapDocument(change.doc, change);
    if (mapped == null) recordsById.delete(id);
    else recordsById.set(id, { ...mapped, id });
  });
  return [...recordsById.values()];
}

export function rollbackOptimisticValue(currentValue, previousValue, attemptedValue, mutationPlan = {}) {
  if (!Array.isArray(attemptedValue)) {
    return firestoreRecordFingerprint(currentValue) === firestoreRecordFingerprint(attemptedValue)
      ? previousValue
      : currentValue;
  }

  const currentRecords = Array.isArray(currentValue) ? currentValue : [];
  const previousRecords = Array.isArray(previousValue) ? previousValue : [];
  const attemptedRecords = Array.isArray(attemptedValue) ? attemptedValue : [];
  const records = new Map(currentRecords.filter((item) => item?.id).map((item) => [String(item.id), item]));
  const previousById = new Map(previousRecords.filter((item) => item?.id).map((item) => [String(item.id), item]));
  const attemptedById = new Map(attemptedRecords.filter((item) => item?.id).map((item) => [String(item.id), item]));

  for (const item of mutationPlan.upserts || []) {
    const id = String(item?.id || '');
    if (!id) continue;
    const current = records.get(id);
    const attempted = attemptedById.get(id);
    // A listener may deliver a newer remote value while a local write fails.
    // Preserve that value instead of replacing it with stale pre-write state.
    if (firestoreRecordFingerprint(current) !== firestoreRecordFingerprint(attempted)) continue;
    if (previousById.has(id)) records.set(id, previousById.get(id));
    else records.delete(id);
  }

  for (const idValue of mutationPlan.removedIds || []) {
    const id = String(idValue || '');
    if (!id || records.has(id) || !previousById.has(id)) continue;
    records.set(id, previousById.get(id));
  }

  const orderedIds = [
    ...currentRecords.map((item) => String(item?.id || '')).filter(Boolean),
    ...previousRecords.map((item) => String(item?.id || '')).filter(Boolean),
  ];
  return [...new Set(orderedIds)].map((id) => records.get(id)).filter(Boolean);
}
