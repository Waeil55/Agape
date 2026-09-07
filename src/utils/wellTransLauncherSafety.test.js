import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('../../automation/welltrans-worker/launcher/Start-AgapeWellTrans.ps1', import.meta.url),
  'utf8',
);

describe('WellTrans launcher session ownership', () => {
  it('preserves the validated live Agent even when no browser handle is available', () => {
    expect(source).toMatch(
      /if \(\$ownerProcess\) \{[\s\S]*if \(\$visibleBrowser\) \{[\s\S]*A duplicate protocol launch only updates[\s\S]*exit 0\s*\}/,
    );
  });

  it('never terminates or replaces the live process tree from a duplicate launch', () => {
    expect(source).not.toContain('$replacementRequired');
    expect(source).not.toContain('Stop-Process -Id $ownerPid');
    expect(source).toContain('if ($orphanWorker)');
  });

  it('confirms a pending update while its worker is still healthy', () => {
    expect(source).toMatch(
      /while \(-not \$workerProcess\.HasExited\)[\s\S]*TotalSeconds -ge 60[\s\S]*Remove-Item -LiteralPath \$pendingUpdatePath/,
    );
  });

  it('forces PowerShell to materialize a reliable child exit code', () => {
    const handleRead = source.indexOf('[void]$workerProcess.Handle');
    const exitPoll = source.indexOf('while (-not $workerProcess.HasExited)');
    const exitCodeRead = source.indexOf('$workerExitCode = $workerProcess.ExitCode');
    expect(handleRead).toBeGreaterThan(-1);
    expect(exitPoll).toBeGreaterThan(handleRead);
    expect(exitCodeRead).toBeGreaterThan(handleRead);
  });
});
