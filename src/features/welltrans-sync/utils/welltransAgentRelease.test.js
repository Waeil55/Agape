import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const updaterPath = fileURLToPath(new URL(
  '../../../../automation/welltrans-worker/launcher/Update-AgapeWellTransAgent.ps1',
  import.meta.url,
));
const launcherPath = fileURLToPath(new URL(
  '../../../../automation/welltrans-worker/launcher/Start-AgapeWellTrans.ps1',
  import.meta.url,
));

describe('WellTrans Agent release safety', () => {
  it('verifies release integrity and retains a last-known-good backup', () => {
    const updater = readFileSync(updaterPath, 'utf8');
    expect(updater).toContain('Get-FileHash -LiteralPath $archivePath -Algorithm SHA256');
    expect(updater).toContain('WellTransAgentRollback');
    expect(updater).toContain('welltrans-update-pending.json');
    expect(updater).toContain('the previous release was restored');
  });

  it('rolls back a release that fails during its startup health window', () => {
    const launcher = readFileSync(launcherPath, 'utf8');
    expect(launcher).toContain('$workerRuntimeSeconds -lt 180');
    expect(launcher).toContain('Automatic rollback failed');
    expect(launcher).toContain('failed its startup health window and was rolled back');
  });
});
