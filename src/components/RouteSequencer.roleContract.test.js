import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('RouteSequencer driver read-only source contract', () => {
  it('hides shared save and reassign affordances from drivers', () => {
    const source = readFileSync(new URL('./RouteSequencer.jsx', import.meta.url), 'utf8');

    expect(source).toContain('{canMutateSharedRoutes && sequence.length > 0 && (');
    expect(source).toContain('{showSaveModal && canMutateSharedRoutes && (');
    expect(source).toContain('{canMutateSharedRoutes && reassigningId === tpl.id ? (');
    expect(source).not.toContain('Save Today Route');
    expect(source).not.toContain("setCurrentDay('All')");
  });
});
