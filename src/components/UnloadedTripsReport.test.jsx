/**
 * @vitest-environment jsdom
 */

import React, { act } from 'react';
import ReactDOM from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import UnloadedTripsReport from './UnloadedTripsReport';

const completed = (bookingId, date, overrides = {}) => ({
  id: bookingId, bookingId, date, status: 'Completed', patient: 'Rider',
  pickup: 'Rushville, IN', dropoff: 'Carmel, IN', ...overrides,
});

describe('UnloadedTripsReport weekly review', () => {
  let container;
  let root;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = ReactDOM.createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it('shows week-by-week history and marks loaded-distance-only trips as missing data', async () => {
    await act(async () => {
      root.render(<UnloadedTripsReport trips={[
        completed('107769193', '2026-08-17', { originalTripCost: 65.28, unloadedMileageMiles: 59, overrideWaitingHours: 3.5 }),
        completed('loaded-only', '2026-08-24', { distance: 62.5, originalTripCost: 50 }),
      ]} />);
    });

    const weekOptions = [...container.querySelectorAll('select option')].map(option => option.textContent);
    expect(weekOptions.some(text => text.includes('Aug 24, 2026') && text.includes('1 completed'))).toBe(true);
    expect(weekOptions.some(text => text.includes('Aug 17, 2026') && text.includes('1 completed'))).toBe(true);
    expect(container.textContent).toContain('Missing source data');
    expect(container.querySelector('input[aria-label="Unloaded miles loaded-only"]').value).toBe('');
  });

  it('shows Indianapolis-only trips as no override and does not offer confirmation', async () => {
    await act(async () => {
      root.render(<UnloadedTripsReport trips={[completed('indy-only', '2026-08-25', {
        pickup: 'Indianapolis, IN 46219',
        dropoff: 'Indianapolis, IN 46203',
        originalTripCost: 50,
        unloadedMileageMiles: 40,
        waitingTimeMinutes: 120,
        waitingNoInterveningTrips: true,
      })]} />);
    });
    expect(container.textContent).toContain('No override');
    expect([...container.querySelectorAll('button')].some(button => button.textContent.includes('Confirm'))).toBe(false);
  });
});
