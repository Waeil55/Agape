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
const installerPath = fileURLToPath(new URL(
  '../../../../automation/welltrans-worker/launcher/Install-AgapeWellTransAgent.ps1',
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

  it('never replaces a live Agent from a duplicate protocol launch', () => {
    const launcher = readFileSync(launcherPath, 'utf8');
    expect(launcher).toContain('if ($ownerProcess)');
    expect(launcher).toContain('if ($visibleBrowser)');
    expect(launcher).toContain('A duplicate protocol launch only updates the requested date/scope files');
    expect(launcher).not.toContain('$replacementRequired');
    expect(launcher).not.toContain('Stop-Process -Id $ownerPid');
    expect(launcher).toContain('if ($orphanWorker)');
    expect(launcher).toContain('$workerExitCode -eq 43');
    expect(launcher).toContain('Browser interruption detected; opening a clean headed session');
    expect(launcher).not.toContain('$workerExitCode -eq 42');
    expect(launcher).not.toContain('Clean review session restart requested.');
  });

  it('checks and installs updates silently without closing an open review', () => {
    const launcher = readFileSync(launcherPath, 'utf8');
    const updater = readFileSync(updaterPath, 'utf8');
    const installer = readFileSync(installerPath, 'utf8');
    expect(launcher).toContain('& $updater');
    expect(launcher.indexOf('if (Test-Path -LiteralPath $lockPath)'))
      .toBeLessThan(launcher.indexOf('& $updater'));
    expect(updater).toContain("$releaseRoot = 'https://agape5.web.app/welltrans-agent'");
    expect(launcher).toContain("$ConfirmPreference = 'None'");
    expect(updater).toContain("$ConfirmPreference = 'None'");
    expect(launcher).toContain('It must never');
    expect(launcher).toContain('replace or terminate the active process tree');
    expect(launcher).toContain('& $updater -AuthorizedLauncherPid $PID');
    expect(updater).toContain('-AuthorizedLauncherPid $AuthorizedLauncherPid');
    expect(installer).toContain('$ownerPid -ne $AuthorizedLauncherPid');
    expect(installer).toContain('$AuthorizedLauncherPid -ne $PID');
    expect(installer).toContain('or $liveWorker');
    expect(installer).not.toContain('Stop-Process -Id $ownerPid');
  });

  it('starts the encrypted settings sidecar before preserving an open review window', () => {
    const launcher = readFileSync(launcherPath, 'utf8');
    const sidecarStart = launcher.indexOf('welltrans.settings-host.js');
    const reviewWindowGuard = launcher.indexOf('if ($visibleBrowser)');
    expect(sidecarStart).toBeGreaterThan(0);
    expect(reviewWindowGuard).toBeGreaterThan(sidecarStart);
    expect(launcher).toContain("-WindowStyle Hidden -PassThru");
    expect(launcher).toContain('This process has no Firebase credential');
  });
});
