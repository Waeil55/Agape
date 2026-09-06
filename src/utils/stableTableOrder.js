export const createStableRowOrder = (rows = []) => Object.fromEntries(
  rows
    .map((row, index) => [row?.id, index])
    .filter(([id]) => id !== undefined && id !== null && id !== ''),
);

export const compareStableRowOrder = (leftId, rightId, order = {}) => {
  const leftPosition = order[leftId];
  const rightPosition = order[rightId];
  const hasLeftPosition = Number.isInteger(leftPosition);
  const hasRightPosition = Number.isInteger(rightPosition);

  if (!hasLeftPosition && !hasRightPosition) return null;
  if (hasLeftPosition && hasRightPosition) return leftPosition - rightPosition;
  return hasLeftPosition ? -1 : 1;
};
