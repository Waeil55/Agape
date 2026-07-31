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
      version: '3.8.5',
      selectedDate: '2026-07-27',
      state: 'calibrated',
      staged: 4,
      pending: 3,
      failed: 1,
      verifierState: 'verified',
      verifierChecked: 4,
      verifierVerified: 4,
      message: 'Ready for commands.',
    });
  });

  after(async () => {
    await browser?.close();
  });

  it('renders every control in one compact top row', async () => {
    const layout = await page.locator('#agape-welltrans-operator-console').evaluate(host => {
      const bar = host.shadowRoot.querySelector('.bar');
      const children = [...bar.children].map(child => child.getBoundingClientRect());
      const barRect = bar.getBoundingClientRect();
      return {
        height: barRect.height,
        top: barRect.top,
        rows: new Set(children.map(rect => Math.round(rect.top + rect.height / 2))).size,
        labels: [...bar.querySelectorAll('button[data-action]')].map(button => button.textContent.trim()),
      };
    });
    assert.equal(layout.height, 42);
    assert.ok(layout.top <= 8);
    assert.equal(layout.rows, 1);
    assert.deepEqual(layout.labels, [
      'Fill Selected', 'Fill Opened Date', 'Run Reviewer', 'Pause', 'New Safe Session',
    ]);
  });

  it('shows a persistent independent-reviewer result', async () => {
    const result = await page.locator('#agape-welltrans-operator-console').evaluate(host => ({
      state: host.shadowRoot.querySelector('[data-role="verifier"]').dataset.state,
      count: host.shadowRoot.querySelector('[data-role="verified"]').textContent,
    }));
    assert.deepEqual(result, { state: 'verified', count: '4/4' });
  });

  it('delivers opened-date, selected-date, verify, pause and restart commands', async () => {
    const host = page.locator('#agape-welltrans-operator-console');
    await host.locator('[data-action="reconcile"]').click();
    await host.locator('[data-role="date"]').fill('2026-07-28');
    await host.locator('[data-action="switch-date"]').click();
    await host.locator('[data-action="verify"]').click();
    await host.locator('[data-action="pause"]').click();
    await host.locator('[data-action="restart"]').click();
    assert.deepEqual(commands.map(item => item.action), [
      'reconcile', 'switch-date', 'verify', 'pause', 'restart',
    ]);
    assert.equal(commands[1].payload.serviceDate, '2026-07-28');
  });

  it('can be dragged and keeps the new position on screen', async () => {
    const host = page.locator('#agape-welltrans-operator-console');
    const before = await host.boundingBox();
    const drag = host.locator('[data-role="drag"]');
    const handle = await drag.boundingBox();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + 120, handle.y + 80, { steps: 4 });
    await page.mouse.up();
    const afterMove = await host.boundingBox();
    assert.ok(afterMove.x > before.x + 50);
    assert.ok(afterMove.y > before.y + 30);
  });
});
