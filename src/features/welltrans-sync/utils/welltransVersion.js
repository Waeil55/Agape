const versionParts = value => String(value || '0.0.0')
  .split('.')
  .slice(0, 3)
  .map(part => Number.parseInt(part, 10) || 0);

export const isWorkerVersionAtLeast = (actual, minimum) => {
  const actualParts = versionParts(actual);
  const minimumParts = versionParts(minimum);
  for (let index = 0; index < 3; index += 1) {
    if (actualParts[index] > minimumParts[index]) return true;
    if (actualParts[index] < minimumParts[index]) return false;
  }
  return true;
};
