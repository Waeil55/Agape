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

  it('treats TripSpark listboxes as exact-option editors before their internal text inputs', () => {
    const source = readFileSync(tripSourcePath, 'utf8');
    const setTextCell = source.slice(
      source.indexOf('async function setTextCell'),
      source.indexOf('async function setListCell'),
    );
    expect(setTextCell.indexOf('if (await listbox.count())'))
      .toBeLessThan(setTextCell.indexOf('if (await editor.count())'));
    expect(source).toContain('if (equalCellValue(entry.column, current, entry.original)) return;');
  });

  it('uses a trusted pointer click for exact custom-dropdown options', () => {
    const source = readFileSync(tripSourcePath, 'utf8');
    const clickListOption = source.slice(
      source.indexOf('async function clickListOption'),
      source.indexOf('async function selectListOption'),
    );
    expect(clickListOption).toContain('page.getByText(optionStr, { exact: true })');
    expect(clickListOption).toContain('candidate.click({ force: true })');
    expect(clickListOption.indexOf('candidate.click({ force: true })'))
      .toBeLessThan(clickListOption.indexOf('page.evaluate'));
  });

  it('keeps vehicle matching optional and can restore an originally blank list cell', () => {
    const source = readFileSync(tripSourcePath, 'utf8');
    expect(source).toContain("entry.reason = 'portal_rejected_optional_exact_match'");
    expect(source).toContain('getListDropdownOptions(page, { strict: optionalExactList })');
    expect(source).toContain('if (strictOnly) return [...new Set(results)]');
    expect(source).toContain("await editor.fill('')");
    expect(source).toContain('await restorePlanEntry(page, grid, entry)');
  });

  it('stages exact signature reasons before required fields and optional vehicles last', () => {
    const source = readFileSync(tripSourcePath, 'utf8');
    const syncTrip = source.slice(source.indexOf('export async function syncWellTransTrip'));
    const signature = syncTrip.indexOf(
      "page, grid, pickup, 'Signature Captured?', 'Rider Signature Received'",
    );
    const driver = syncTrip.indexOf(
      "preflightCell(page, grid, pickup, 'Driver', payload.driver",
    );
    const vehicle = syncTrip.indexOf(
      "preflightCell(page, grid, pickup, 'Vehicle', payload.vehicle",
    );
    expect(signature).toBeGreaterThan(-1);
    expect(signature).toBeLessThan(driver);
    expect(driver).toBeLessThan(vehicle);
  });

  it('resolves a virtual-grid cell in one browser pass', () => {
    const source = readFileSync(tripSourcePath, 'utf8');
    const exactCell = source.slice(
      source.indexOf('async function exactCell'),
      source.indexOf('async function resolveColumnLeft'),
    );
    expect(exactCell).toContain('cells.evaluateAll');
    expect(exactCell).not.toContain('await cell.evaluate');
  });
});
