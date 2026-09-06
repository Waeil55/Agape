import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { chromium } from 'playwright';
import {
  installWellTransOperatorConsole,
  updateWellTransOperatorConsole,
} from '../src/welltrans.operator-console.js';

let browser;
let page;
const commands = [];

describe('WellTrans one-line operator toolbar', () => {
  before(async () => {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    await page.setContent('<main>TripSpark test workspace</main>');
    await installWellTransOperatorConsole(page, async (action, payload) => {
      commands.push({ action, payload });
      return { accepted: true, message: `${action} accepted` };
    });
    await updateWellTransOperatorConsole(page, {
      version: '3.8.7',
      selectedDate: '2026-07-27',
      state: 'calibrated',
      staged: 4,
      pending: 3,
      failed: 1,
      blocked: 1,
      expected: 8,
      reviewed: 4,
      verifierState: 'verified',
      verifierChecked: 4,
      verifierVerified: 4,
      scopeType: 'driver',
      scopeDriverId: 'driver-1',
      driverOptions: [
        { id: 'driver-1', name: 'Mikhaeil Waeil', tripCount: 4 },
        { id: 'driver-2', name: 'Waeil Driver', tripCount: 3, state: 'done' },
      ],
      allDriverTripCount: 7,
      message: 'Ready for commands.',
    });
  });

  it('offers authoritative all-driver and single-driver scopes in the same row', async () => {
    const result = await page.locator('#agape-welltrans-operator-console').evaluate(host => {
      const select = host.shadowRoot.querySelector('[data-role="driver"]');
      return {
        value: select.value,
        labels: [...select.options].map(option => option.textContent),
      };
    });
    assert.equal(result.value, 'driver-1');
    assert.deepEqual(result.labels, [
      'All drivers (7)', 'Mikhaeil Waeil (4)', 'Waeil Driver (3) - DONE',
    ]);
  });

  after(async () => {
    await browser?.close();
  });

  it('renders every control in one compact top row', async () => {
    const layout = await page.locator('#agape-welltrans-operator-console').evaluate(host => {
      const bar = host.shadowRoot.querySelector('.bar');
      const children = [...bar.children].filter(child => !child.hidden).map(child => child.getBoundingClientRect());
      const barRect = bar.getBoundingClientRect();
      return {
        height: barRect.height,
        top: barRect.top,
        rows: new Set(children.map(rect => Math.round(rect.top + rect.height / 2))).size,
        labels: [...bar.querySelectorAll('button[data-action]:not([hidden])')].map(button => button.textContent.trim()),
      };
    });
    assert.equal(layout.height, 42);
    assert.ok(layout.top <= 8);
    assert.equal(layout.rows, 1);
    assert.deepEqual(layout.labels, [
      'Fill Date', 'Use Open Date', 'Verify Review', 'Pause',
    ]);
  });

  it('does not block manual WellTrans controls outside its own inputs and buttons', async () => {
    const interaction = await page.locator('#agape-welltrans-operator-console').evaluate(host => ({
      host: host.style.pointerEvents,
      bar: getComputedStyle(host.shadowRoot.querySelector('.bar')).pointerEvents,
      fill: getComputedStyle(host.shadowRoot.querySelector('[data-action="fill-date"]')).pointerEvents,
    }));
    assert.deepEqual(interaction, { host: 'none', bar: 'none', fill: 'auto' });
  });

  it('shows a persistent independent-reviewer result', async () => {
    const result = await page.locator('#agape-welltrans-operator-console').evaluate(host => ({
      state: host.shadowRoot.querySelector('[data-role="verifier"]').dataset.state,
      count: host.shadowRoot.querySelector('[data-role="verified"]').textContent,
      verifyDisabled: host.shadowRoot.querySelector('[data-action="verify"]').disabled,
    }));
    assert.deepEqual(result, { state: 'blocked', count: '4/8', verifyDisabled: true });
  });

  it('reports date coverage without double-counting manifest blockers', async () => {
    await updateWellTransOperatorConsole(page, {
      expected: 15,
      reviewed: 13,
      staged: 13,
      pending: 0,
      failed: 2,
      blocked: 2,
      missing: 0,
      verifierState: 'verified',
    });
    const result = await page.locator('#agape-welltrans-operator-console').evaluate(host => ({
      state: host.shadowRoot.querySelector('[data-role="verifier"]').dataset.state,
      reviewed: host.shadowRoot.querySelector('[data-role="verified"]').textContent,
      blocked: host.shadowRoot.querySelector('[data-role="failed"]').textContent,
    }));
    assert.deepEqual(result, { state: 'blocked', reviewed: '13/15', blocked: '2' });
  });

  it('stays pinned when live status and message lengths change', async () => {
    const host = page.locator('#agape-welltrans-operator-console');
    const before = await host.boundingBox();
    await updateWellTransOperatorConsole(page, {
      state: 'reconciliation_blocked_do_not_apply',
      message: 'A much longer operational message must not shift the toolbar across the viewport.',
    });
    const after = await host.boundingBox();
    assert.equal(Math.round(after.x), Math.round(before.x));
    assert.equal(Math.round(after.width), Math.round(before.width));
  });

  it('navigates immediately when the operator chooses a different date and waits for verification', async () => {
    const host = page.locator('#agape-welltrans-operator-console');
    await updateWellTransOperatorConsole(page, { scopeLocked: true });
    assert.equal(await host.locator('[data-role="date"]').isEnabled(), true);
    await host.locator('[data-action="fill-date"]').click();
    await host.locator('[data-role="date"]').fill('2026-07-28');
    await host.locator('[data-role="date"]').press('Tab');
    const switching = await host.evaluate(element => ({
      label: element.shadowRoot.querySelector('[data-action="fill-date"]').textContent,
      disabled: element.shadowRoot.querySelector('[data-action="fill-date"]').disabled,
    }));
    assert.deepEqual(switching, { label: 'Retry Date', disabled: false });
    await updateWellTransOperatorConsole(page, {
      selectedDate: '2026-07-28',
      requestedDate: '2026-07-28',
      expected: 4,
      reviewed: 4,
      staged: 4,
      completed: 0,
      pending: 0,
      processing: 0,
      failed: 0,
      blocked: 0,
      missing: 0,
      scopeLocked: false,
    });
    await host.locator('[data-action="detect-date"]').click();
    await host.locator('[data-action="verify"]').click();
    await host.locator('[data-action="pause"]').click();
    assert.equal(page.isClosed(), false);
    await host.locator('[data-role="driver"]').selectOption('driver-2');
    await updateWellTransOperatorConsole(page, { state: 'review_error' });
    await host.locator('[data-action="restart"]').click();
    assert.deepEqual(commands.map(item => item.action), [
      'reconcile', 'switch-date', 'detect-date', 'verify', 'pause', 'switch-driver', 'restart',
    ]);
    assert.equal(commands[1].payload.serviceDate, '2026-07-28');
    assert.deepEqual(commands[5].payload, {
      type: 'driver', driverId: 'driver-2', driverName: 'Waeil Driver',
    });
  });

  it('can be moved vertically without drifting sideways', async () => {
    const host = page.locator('#agape-welltrans-operator-console');
    const before = await host.boundingBox();
    const drag = host.locator('[data-role="drag"]');
    const handle = await drag.boundingBox();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + 120, handle.y + 80, { steps: 4 });
    await page.mouse.up();
    const afterMove = await host.boundingBox();
    assert.equal(Math.round(afterMove.x), Math.round(before.x));
    assert.ok(afterMove.y > before.y + 30);
  });

  it('can collapse without covering the portal workspace', async () => {
    const host = page.locator('#agape-welltrans-operator-console');
    await host.locator('[data-role="collapse"]').click();
    const result = await host.evaluate(element => ({
      collapsed: element.dataset.collapsed,
      optionalVisible: [...element.shadowRoot.querySelectorAll('.optional')]
        .some(item => getComputedStyle(item).display !== 'none'),
      label: element.shadowRoot.querySelector('[data-role="collapse"]').getAttribute('aria-label'),
    }));
    assert.deepEqual(result, { collapsed: 'true', optionalVisible: false, label: 'Expand toolbar' });
  });
});
