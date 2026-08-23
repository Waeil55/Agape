/**
 * @vitest-environment jsdom
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PayrollReportPage from './PayrollReportPage';
import { eventMatchesPayrollServiceDate, tripMatchesPayrollServiceDate } from '../utils/portalSelectors';
import { isoToLocalDateKey } from '../utils/tripDate';

describe('payroll report service-date scope', () => {
  const selectedDate = '2026-08-13';

  it('normalizes stored trip timestamps before applying the selected date', () => {
    expect(tripMatchesPayrollServiceDate({ date: '2026-08-13T11:45:00.000Z' }, selectedDate)).toBe(true);
    expect(tripMatchesPayrollServiceDate({ date: '2026-08-14T11:45:00.000Z' }, selectedDate)).toBe(false);
  });

  it('includes Firestore timestamp-form trip dates for the correct local calendar day', () => {
    const timestamp = { toDate: () => new Date(2026, 7, 13, 8, 30) };
    expect(tripMatchesPayrollServiceDate({ date: timestamp }, selectedDate)).toBe(true);
  });

  it('uses operational timestamps only when the trip service date is absent', () => {
    expect(tripMatchesPayrollServiceDate({ arrivalTime: '2026-08-13T12:00:00' }, selectedDate)).toBe(true);
    expect(tripMatchesPayrollServiceDate({ date: '2026-08-14', arrivalTime: '2026-08-13T12:00:00' }, selectedDate)).toBe(false);
  });

  it('fails closed for missing or invalid trip dates when a date is selected', () => {
    expect(tripMatchesPayrollServiceDate({}, selectedDate)).toBe(false);
    expect(tripMatchesPayrollServiceDate({ date: 'not-a-date' }, selectedDate)).toBe(false);
  });

  it('normalizes timestamp-form clock events to the same payroll date scope', () => {
    const timestamp = { seconds: Math.floor(new Date(2026, 7, 13, 10, 0).getTime() / 1000) };
    expect(eventMatchesPayrollServiceDate({ timestamp }, selectedDate)).toBe(true);
    expect(eventMatchesPayrollServiceDate({ timestamp: '2026-08-14T10:00:00' }, selectedDate)).toBe(false);
  });

  it('uses the local calendar day for UTC clock events near midnight', () => {
    const boundaryTimestamp = '2026-08-14T02:00:00.000Z';
    const localDateKey = isoToLocalDateKey(boundaryTimestamp);
    expect(eventMatchesPayrollServiceDate({ timestamp: boundaryTimestamp }, localDateKey)).toBe(true);
    if (localDateKey !== '2026-08-14') {
      expect(eventMatchesPayrollServiceDate({ timestamp: boundaryTimestamp }, '2026-08-14')).toBe(false);
    }
  });

  it('preserves the all-date behavior when no payroll date is selected', () => {
    expect(tripMatchesPayrollServiceDate({}, '')).toBe(true);
    expect(eventMatchesPayrollServiceDate({}, '')).toBe(true);
  });

  it('blocks CSV export when any source record has no valid date', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    const createObjectUrl = vi.fn(() => 'blob:payroll');
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectUrl });

    await act(async () => {
      root.render(React.createElement(PayrollReportPage, {
        drivers: [{ id: 'driver-1', name: 'Driver One', email: 'driver@example.com' }],
        trips: [{ id: 'trip-without-date', driverId: 'driver-1' }],
      }));
    });

    const exportButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent.includes('Export CSV'));
    expect(exportButton).toBeTruthy();
    expect(exportButton.disabled).toBe(true);
    exportButton.click();
    expect(createObjectUrl).not.toHaveBeenCalled();

    await act(async () => root.unmount());
    container.remove();
  });
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});
