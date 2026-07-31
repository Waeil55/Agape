import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('../../automation/welltrans-worker/launcher/Start-AgapeWellTrans.ps1', import.meta.url),
  'utf8',
);

describe('WellTrans launcher session ownership', () => {
  it('never replaces a healthy worker because the browser handle is unavailable', () => {
    expect(source).toMatch(/if \(\$workerNode -and -not \$replacementRequired\) \{\s*exit 0\s*\}/);
  });

  it('keeps process-tree termination after the healthy-worker guard', () => {
    const guard = source.indexOf('if ($workerNode -and -not $replacementRequired)');
    const termination = source.indexOf('Stop-Process -Id $ownerPid');
    expect(guard).toBeGreaterThan(-1);
    expect(termination).toBeGreaterThan(guard);
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
