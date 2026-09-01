import { describe, expect, it, vi } from 'vitest';
import {
  sanitizeFirestoreUpdateArguments,
  sanitizeFirestoreWriteData,
  wrapFirestoreWriteContext,
} from './firestoreWriteSafety';

describe('Firestore write safety boundary', () => {
  it('removes undefined fields from direct write data at every depth', () => {
    expect(sanitizeFirestoreWriteData({
      status: 'Cancelled',
      cancellationReason: undefined,
      audit: { actor: 'driver', discarded: undefined },
    })).toEqual({
      status: 'Cancelled',
      audit: { actor: 'driver' },
    });
  });

  it('sanitizes object-form updates and fails closed for undefined field/value updates', () => {
    expect(sanitizeFirestoreUpdateArguments([{
      cancellationReason: undefined,
      status: 'Completed',
    }])).toEqual([{ status: 'Completed' }]);

    expect(() => sanitizeFirestoreUpdateArguments(['cancellationReason', undefined]))
      .toThrow('Firestore update contains undefined');
  });

  it('sanitizes batched and transactional set and update calls', () => {
    const context = {
      set: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };
    const safeContext = wrapFirestoreWriteContext(context);

    expect(safeContext.set('trip-ref', {
      tripId: '107847209',
      cancellationReason: undefined,
    }, { merge: true })).toBe(safeContext);
    expect(context.set).toHaveBeenCalledWith(
      'trip-ref',
      { tripId: '107847209' },
      { merge: true },
    );

    safeContext.update('trip-ref', { status: 'Completed', stale: undefined });
    expect(context.update).toHaveBeenCalledWith('trip-ref', { status: 'Completed' });

    expect(safeContext.delete('trip-ref')).toBe(safeContext);
    expect(context.delete).toHaveBeenCalledWith('trip-ref');

    safeContext.delete('trip-ref').set('trip-ref', { stale: undefined, status: 'Assigned' });
    expect(context.set).toHaveBeenLastCalledWith('trip-ref', { status: 'Assigned' });
  });
});
