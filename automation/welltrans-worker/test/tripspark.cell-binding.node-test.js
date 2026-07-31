import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { chromium } from 'playwright';
import { boundCellHandle, resolveCapabilityTarget } from '../src/welltrans.trip.js';

let browser;
let page;

const cell = ({ title = '', top, left, text = '', display = 'block' }) =>
  `<div class="GridCell" title="${title}" `
  + `style="position:absolute;display:${display};top:${top}px;left:${left}px;`
  + `width:100px;height:20px">${text}</div>`;

const gridMarkup = ({ duplicateTarget = false } = {}) => `
  <div id="grid" style="position:relative;width:1000px;height:300px">
    <div class="GridScroller" style="position:relative;width:1000px;height:300px;overflow:auto">
      ${cell({ title: 'Booking Id', top: 0, left: 0, text: 'Booking Id' })}
      ${cell({ title: 'Activity', top: 0, left: 110, text: 'Activity' })}
      ${cell({ title: 'Driver', top: 0, left: 220, text: 'Driver' })}
      ${cell({ title: 'Vehicle', top: 0, left: 330, text: 'Vehicle' })}
      ${cell({ title: 'Arrival Time', top: 0, left: 440, text: 'Arrival Time' })}
      ${cell({ title: 'Departure Time', top: 0, left: 550, text: 'Departure Time' })}
      ${cell({ title: 'Mileage/Odometer', top: 0, left: 660, text: 'Mileage/Odometer' })}
      ${cell({ title: 'Signature Captured?', top: 0, left: 770, text: 'Signature Captured?' })}
      ${cell({ title: 'Signature Captured', top: 0, left: 880, text: 'Signature Captured' })}
      ${cell({ title: 'Is Read Only', top: 0, left: 990, text: 'Is Read Only' })}

      ${cell({ title: '107433324', top: 0, left: 0, text: '107433324' })}
      ${cell({ title: 'Pickup', top: 0, left: 110, text: 'Pickup' })}
      ${cell({ top: 0, left: 220, text: 'Mikhaeil Waeil' })}
      ${duplicateTarget ? cell({ top: 0, left: 220, text: 'STALE VISIBLE CLONE' }) : ''}
      ${cell({ title: '107433415', top: 24, left: 0, text: '107433415' })}
      ${cell({ title: 'Pickup', top: 24, left: 110, text: 'Pickup' })}
      ${cell({ top: 24, left: 220, text: 'WRONG DRIVER' })}

      ${cell({
        title: '107433324',
        top: 0,
        left: 0,
        text: 'STALE BOOKING CLONE',
        display: 'none',
      })}
      ${cell({
        title: 'Pickup',
        top: 0,
        left: 110,
        text: 'Pickup',
        display: 'none',
      })}
      ${cell({
        top: 0,
        left: 220,
        text: 'STALE DRIVER',
        display: 'none',
      })}
    </div>
  </div>
`;

describe('TripSpark exact virtual-grid cell binding', () => {
  before(async () => {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();
  });

  after(async () => {
    await browser?.close();
  });

  it('binds the exact Booking ID + Activity + column despite same-coordinate stale nodes', async () => {
    await page.setContent(gridMarkup());
    const handle = await boundCellHandle(
      page.locator('#grid'),
      { bookingRaw: '107433324', activity: 'Pickup', scrollOffset: 0 },
      'Driver',
    );
    try {
      assert.equal(await handle.textContent(), 'Mikhaeil Waeil');
    } finally {
      await handle.dispose();
    }
  });

  it('never reuses another trip value from a text-editor capability cache', () => {
    assert.equal(resolveCapabilityTarget('text', { target: '10:25' }, '12:19'), '12:19');
    assert.equal(
      resolveCapabilityTarget('list', { target: 'Rider Signature Received' }, 'rider signature received'),
      'Rider Signature Received',
    );
  });

  it('fails closed when two visible target cells occupy the same bound row and column', async () => {
    await page.setContent(gridMarkup({ duplicateTarget: true }));
    await assert.rejects(
      () => boundCellHandle(
        page.locator('#grid'),
        { bookingRaw: '107433324', activity: 'Pickup', scrollOffset: 0 },
        'Driver',
      ),
      /Exact cell binding failed.*ambiguous_cell/,
    );
  });

  it('waits through a transient virtual-row recycle and binds the semantic row', async () => {
    await page.setContent(gridMarkup());
    await page.locator('#grid').evaluate(element => {
      const cells = [...element.querySelectorAll('.GridCell')]
        .filter(node => node.title === '107433324' || node.title === 'Pickup'
          || (node.style.top === '0px' && node.style.left === '220px' && !node.title))
        .filter(node => !String(node.textContent).includes('STALE'));
      for (const node of cells) node.style.display = 'none';
      setTimeout(() => {
        for (const node of cells) node.style.display = 'block';
      }, 180);
    });
    const handle = await boundCellHandle(
      page.locator('#grid'),
      { bookingRaw: '107433324', activity: 'Pickup', scrollOffset: 0 },
      'Driver',
    );
    try {
      assert.equal(await handle.textContent(), 'Mikhaeil Waeil');
    } finally {
      await handle.dispose();
    }
  });
});
