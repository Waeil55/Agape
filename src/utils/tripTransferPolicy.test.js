import { describe, expect, it } from 'vitest';
import {
  getTransferReturnStatus,
  isPendingTripTransferRecipient,
  isValidTripTransferDecision,
} from './tripTransferPolicy';

const request = {
  id: 'transfer-1',
  status: 'pending',
  previousStatus: 'In Transit',
  fromDriverId: 'DRV-1',
  fromDriverEmail: 'sender@x.com',
  toDriverId: 'DRV-2',
  toDriverEmail: 'target@x.com',
  reason: 'Emergency',
  requestedAt: '2026-09-14T10:00:00.000Z',
};
const trip = { id: 'T-1', status: 'Transferred', driverId: 'DRV-1', transferRequest: request };
const selfDriver = { id: 'DRV-2', email: 'target@x.com' };
const decided = (status) => ({ ...request, status, decidedAt: '2026-09-14T10:05:00.000Z', decidedBy: 'target@x.com' });

describe('trip transfer decision boundary', () => {
  it('requires every supplied target key to match one unambiguous recipient', () => {
    expect(isPendingTripTransferRecipient({ trip, currentUser: 'TARGET@x.com', driverIds: ['DRV-2'] })).toBe(true);
    expect(isPendingTripTransferRecipient({ trip, currentUser: 'other@x.com', driverIds: ['DRV-2'] })).toBe(false);
    expect(isPendingTripTransferRecipient({ trip, currentUser: 'other@x.com', driverIds: ['DRV-9'] })).toBe(false);
    expect(isPendingTripTransferRecipient({ trip, currentUser: 'target@x.com', driverIds: ['DRV-9'] })).toBe(false);
    expect(isPendingTripTransferRecipient({ trip, currentUser: 'target@x.com', driverIds: ['DRV-2', 'DRV-2-DUP'] })).toBe(false);
    expect(isPendingTripTransferRecipient({ trip: { ...trip, transferRequest: { ...request, status: 'accepted' } }, currentUser: 'target@x.com', driverIds: ['DRV-2'] })).toBe(false);
  });

  it('preserves the workflow step on accept and decline', () => {
    expect(getTransferReturnStatus(request)).toBe('In Transit');
    expect(getTransferReturnStatus({ previousStatus: 'Completed' })).toBe('Assigned');
  });

  it('allows an exact acceptance assigning the trip to the recipient', () => {
    expect(isValidTripTransferDecision({
      trip,
      currentUser: 'target@x.com',
      selfDriver,
      status: 'In Transit',
      extraData: {
        driverId: 'DRV-2',
        driverEmail: 'target@x.com',
        driverName: 'Target',
        transferStatus: 'accepted',
        transferRequest: decided('accepted'),
      },
    })).toBe(true);
  });

  it('allows an exact decline without changing assignment identity', () => {
    expect(isValidTripTransferDecision({
      trip,
      currentUser: 'target@x.com',
      selfDriver,
      status: 'In Transit',
      extraData: { transferStatus: 'declined', transferRequest: decided('declined') },
    })).toBe(true);
  });

  it('rejects arbitrary fields, stale requests, wrong steps, and name-only targets', () => {
    const base = {
      trip,
      currentUser: 'target@x.com',
      selfDriver,
      status: 'In Transit',
      extraData: { transferStatus: 'declined', transferRequest: decided('declined') },
    };
    expect(isValidTripTransferDecision({ ...base, extraData: { ...base.extraData, pickupOdometer: 999 } })).toBe(false);
    expect(isValidTripTransferDecision({ ...base, status: 'Completed' })).toBe(false);
    expect(isValidTripTransferDecision({ ...base, trip: { ...trip, transferRequest: { ...request, status: 'accepted' } } })).toBe(false);
    expect(isValidTripTransferDecision({ ...base, selfDriver: { id: '', name: 'Target' } })).toBe(false);
    expect(isValidTripTransferDecision({ ...base, selfDriver: { ...selfDriver, email: 'other@x.com' } })).toBe(false);
    expect(isValidTripTransferDecision({
      ...base,
      extraData: { ...base.extraData, transferRequest: { ...decided('declined'), decidedBy: 'other@x.com' } },
    })).toBe(false);
    expect(isValidTripTransferDecision({
      ...base,
      extraData: { ...base.extraData, transferRequest: { ...decided('declined'), reason: 'Changed' } },
    })).toBe(false);
  });
});
