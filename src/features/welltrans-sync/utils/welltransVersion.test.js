import { describe, expect, it } from 'vitest';
import { isWorkerVersionAtLeast } from './welltransVersion';

describe('WellTrans agent minimum version compatibility', () => {
  it('accepts the required version and newer patch releases', () => {
    expect(isWorkerVersionAtLeast('2.3.0', '2.3.0')).toBe(true);
    expect(isWorkerVersionAtLeast('2.3.1', '2.3.0')).toBe(true);
    expect(isWorkerVersionAtLeast('2.4.0', '2.3.0')).toBe(true);
  });

  it('rejects missing and older versions', () => {
    expect(isWorkerVersionAtLeast('', '2.3.0')).toBe(false);
    expect(isWorkerVersionAtLeast('2.2.9', '2.3.0')).toBe(false);
    expect(isWorkerVersionAtLeast('1.99.99', '2.3.0')).toBe(false);
  });
});
