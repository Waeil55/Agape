import { describe, expect, it } from 'vitest';
import { sanitizeFirestorePayload } from './firestorePayload';

describe('sanitizeFirestorePayload', () => {
  it('removes undefined object fields recursively without changing the source', () => {
    const source = {
      status: 'Cancelled',
      cancellationReason: undefined,
      nested: { valid: 'kept', invalid: undefined },
    };

    expect(sanitizeFirestorePayload(source)).toEqual({
      status: 'Cancelled',
      nested: { valid: 'kept' },
    });
    expect(Object.prototype.hasOwnProperty.call(source, 'cancellationReason')).toBe(true);
  });

  it('preserves array positions by replacing undefined entries with null', () => {
    expect(sanitizeFirestorePayload({ evidence: ['first', undefined, 'third'] }))
      .toEqual({ evidence: ['first', null, 'third'] });
  });

  it('preserves Firestore SDK values and rejects circular plain data', () => {
    class FirestoreSentinel {}
    const sentinel = new FirestoreSentinel();
    expect(sanitizeFirestorePayload({ updatedAt: sentinel }).updatedAt).toBe(sentinel);

    const circular = {};
    circular.self = circular;
    expect(() => sanitizeFirestorePayload(circular)).toThrow('circular value at $.self');
  });
});
