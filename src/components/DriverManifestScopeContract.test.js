import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(path.join(process.cwd(), 'src/components/DriverPage.jsx'), 'utf8');
const manifestHeader = source.slice(
  source.indexOf('{/* Manifest Header */}'),
  source.indexOf('{/* Trip Cards */}')
);

describe('driver manifest scope contract', () => {
  it('derives conflicts synchronously from the visible current service date', () => {
    expect(source).toContain('const conflicts = useMemo(() => buildDriverTimeConflicts(todayTrips), [todayTrips]);');
    expect(source).not.toContain('setConflicts(');
  });

  it('uses the same today/tomorrow scope for the manifest empty state', () => {
    expect(source).toContain('const visibleManifestTripCount = todayTrips.length + tomorrowTrips.length;');
    expect(source).toContain('visibleManifestTripCount === 0 && assignedRoutePlanStops.length === 0');
  });

  it('keeps the mobile toolbar within the screen and removes the duplicate export action', () => {
    expect(manifestHeader).toContain('flex w-full items-center justify-between gap-2');
    expect(manifestHeader).toContain('text-slate-500');
    expect(manifestHeader).not.toContain('Export');
    expect(manifestHeader).not.toContain('text-white/70');
  });
});
