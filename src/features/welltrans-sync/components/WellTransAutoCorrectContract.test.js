import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('WellTrans per-trip auto-correct contract', () => {
  it('offers a one-click fix on the exact invalid row, reusing the batch auto-correct logic', () => {
    const page = read('src/features/welltrans-sync/components/WellTransSyncPage.jsx');
    // Single-row fix shares the same mechanical swap/fill routine as the
    // toolbar's bulk "Auto-correct" action — it never invents a new value.
    expect(page).toContain('const runAutoCorrect = useCallback(async (tripIds) => {');
    expect(page).toContain('const autoCorrectSelected = useCallback(() => runAutoCorrect(selectedIds)');
    expect(page).toContain('const autoCorrectSingle = useCallback((tripId) => runAutoCorrect([tripId])');
    expect(page).toContain('onClick={(event) => { event.stopPropagation(); autoCorrectSingle(trip.id); }}');
  });

  it('still lets a dispatcher open the manual editor from the same row', () => {
    const page = read('src/features/welltrans-sync/components/WellTransSyncPage.jsx');
    expect(page).toContain('onClick={(event) => { event.stopPropagation(); beginTripEdit(trip); }}');
  });
});
