import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { findUniqueExactOption } from '../../../../automation/welltrans-worker/src/welltrans.trip';

const tripSourcePath = fileURLToPath(new URL(
  '../../../../automation/welltrans-worker/src/welltrans.trip.js',
  import.meta.url,
));
const workerSourcePath = fileURLToPath(new URL(
  '../../../../automation/welltrans-worker/src/index.js',
  import.meta.url,
));

describe('WellTrans staging safety contract', () => {
  it('accepts only a unique normalized-exact broker option', () => {
    const options = [
      'Rider Unable to Sign',
      'Rider Refused to Sign',
      'Rider Signature Received',
      'Signature Not Requested',
    ];

    expect(findUniqueExactOption(options, 'rider signature received'))
      .toBe('Rider Signature Received');
    expect(findUniqueExactOption(options, 'Rider Signature'))
      .toBeNull();
    expect(findUniqueExactOption(options, 'Signature Not Required'))
      .toBeNull();
  });

  it('contains no keyboard fallback that can choose the wrong signature reason', () => {
    const source = readFileSync(tripSourcePath, 'utf8');
    expect(source).not.toContain("keyboard.press('ArrowUp')");
    expect(source).toContain(
      "page, grid, pickup, 'Signature Captured?', 'Rider Signature Received'",
    );
    expect(source).toContain(
      "page, grid, dropoff, 'Signature Captured?', 'Rider Signature Received'",
    );
  });

  it('never silently requeues failed jobs after an agent upgrade', () => {
    const source = readFileSync(workerSourcePath, 'utf8');
    expect(source).not.toContain('migrateLegacyDateJobs');
    expect(source).not.toContain('queued_for_worker_upgrade');
    expect(source).toContain('failed_review_close_required');
  });
});
