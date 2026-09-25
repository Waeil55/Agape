import { describe, expect, it, vi } from 'vitest';

const firebaseMock = vi.hoisted(() => ({
  db: {},
  doc: vi.fn((_db, collectionName, id) => `${collectionName}/${id}`),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  collection: vi.fn((_db, name) => name),
  setDoc: vi.fn(),
  serverTimestamp: vi.fn(() => 'server-timestamp'),
  arrayUnion: vi.fn((value) => ({ __arrayUnion: value })),
}));

vi.mock('../config/firebase', () => firebaseMock);

import { reportBadClient, getFlaggedClient, listFlaggedClients, unflagClient } from './flaggedClients';

describe('reportBadClient', () => {
  it('does nothing for a blank client name', async () => {
    const result = await reportBadClient('', { reason: 'x' });
    expect(result).toBeNull();
    expect(firebaseMock.setDoc).not.toHaveBeenCalled();
  });

  it('creates a new flagged record with a report entry on first report', async () => {
    firebaseMock.getDoc.mockResolvedValueOnce({ exists: () => false });
    const entry = await reportBadClient('Jane Doe', { reason: 'No Show', note: 'twice this month', tripId: 't1', bookingId: 'BK1' }, 'dispatcher@agape');

    expect(entry.reason).toBe('No Show');
    expect(firebaseMock.setDoc).toHaveBeenCalledWith(
      'flaggedClients/jane doe',
      expect.objectContaining({ active: true, reportCount: 1, patientName: 'Jane Doe' }),
      { merge: true },
    );
  });

  it('increments reportCount for a repeat report', async () => {
    firebaseMock.getDoc.mockResolvedValueOnce({ exists: () => true, data: () => ({ reportCount: 2 }) });
    await reportBadClient('Jane Doe', { reason: 'No Show' }, 'dispatcher@agape');

    expect(firebaseMock.setDoc).toHaveBeenCalledWith(
      'flaggedClients/jane doe',
      expect.objectContaining({ reportCount: 3 }),
      { merge: true },
    );
  });
});

describe('getFlaggedClient', () => {
  it('returns null when the client was never flagged', async () => {
    firebaseMock.getDoc.mockResolvedValueOnce({ exists: () => false });
    expect(await getFlaggedClient('Nobody')).toBeNull();
  });

  it('returns null once a flagged client has been cleared', async () => {
    firebaseMock.getDoc.mockResolvedValueOnce({ exists: () => true, data: () => ({ active: false }) });
    expect(await getFlaggedClient('Jane Doe')).toBeNull();
  });

  it('returns the record for an active flag', async () => {
    firebaseMock.getDoc.mockResolvedValueOnce({ exists: () => true, data: () => ({ active: true, lastReason: 'No Show' }) });
    expect(await getFlaggedClient('Jane Doe')).toEqual({ active: true, lastReason: 'No Show' });
  });
});

describe('listFlaggedClients / unflagClient', () => {
  it('maps every document with its id', async () => {
    firebaseMock.getDocs.mockResolvedValueOnce({
      docs: [{ id: 'jane doe', data: () => ({ patientName: 'Jane Doe' }) }],
    });
    expect(await listFlaggedClients()).toEqual([{ id: 'jane doe', patientName: 'Jane Doe' }]);
  });

  it('marks a client inactive without deleting the record', async () => {
    await unflagClient('Jane Doe');
    expect(firebaseMock.setDoc).toHaveBeenCalledWith(
      'flaggedClients/jane doe',
      expect.objectContaining({ active: false }),
      { merge: true },
    );
  });
});
