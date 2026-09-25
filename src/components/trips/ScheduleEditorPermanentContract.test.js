import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

// ScheduleEditorModal marks a payload with saveAsProfile when the operator
// picks "Permanent", but every screen that renders the modal used to just
// write that flag onto the single trip document and drop it — nothing ever
// saved it as the client's default, so "Permanent" behaved identically to
// "One-Time". Each caller must now persist it via saveClientProfile.
describe('ScheduleEditorModal "Permanent" persistence contract', () => {
  const callers = [
    'src/components/DriverPage.jsx',
    'src/components/MobileDispatchView.jsx',
    'src/components/TripsPage.jsx',
    'src/components/MobileReportsPage.jsx',
    'src/components/ArchivesPage.jsx',
  ];

  it.each(callers)('%s saves the schedule as the client default when Permanent is chosen', (file) => {
    const source = read(file);
    const scheduleEditorBlock = source.slice(source.indexOf('<ScheduleEditorModal'));
    expect(scheduleEditorBlock).toContain('payload.saveAsProfile');
    expect(scheduleEditorBlock).toContain('saveClientProfile(');
  });
});
