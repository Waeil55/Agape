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
