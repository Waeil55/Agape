import { describe, expect, it } from 'vitest';
import { findRemovedDocumentIds } from './firestorePersistence';

describe('Firestore collection persistence', () => {
  it('identifies records that must be deleted remotely', () => {
    const previous = [{ id: 'DRV-1' }, { id: 'DRV-2' }, { id: 'DRV-3' }];
    const current = [{ id: 'DRV-1' }, { id: 'DRV-3' }];

    expect(findRemovedDocumentIds(previous, current)).toEqual(['DRV-2']);
  });

  it('ignores empty IDs and deduplicates deletion work', () => {
    const previous = [{ id: 'VHC-1' }, { id: 'VHC-1' }, { name: 'invalid' }];

    expect(findRemovedDocumentIds(previous, [])).toEqual(['VHC-1']);
  });
});
