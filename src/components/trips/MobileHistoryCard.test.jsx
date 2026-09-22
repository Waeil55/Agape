// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MobileHistoryCardHeader, MobileHistoryStops } from './MobileHistoryCard';

function render(element) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(element));
  return { host, cleanup: () => act(() => { root.unmount(); host.remove(); }) };
}

describe('mobile history card design', () => {
  it('renders the compact driver summary and toggles with keyboard', () => {
    const onToggle = vi.fn();
    const view = render(
      <MobileHistoryCardHeader
        trip={{ id: 't1', patient: 'Jane Doe', bookingId: 'BK-1' }}
        time="9:30 AM"
        miles="12.4"
        driverName="Ann Driver"
        vehicleName="Van 2"
        onToggle={onToggle}
      />
    );
    expect(view.host.textContent).toContain('9:30 AM');
    expect(view.host.textContent).toContain('12.4 mi · Ann Driver');
    act(() => view.host.querySelector('[role="button"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(onToggle).toHaveBeenCalledOnce();
    view.cleanup();
  });

  it('adds multi-line admin details and keeps arrival time beside odometer', () => {
    const view = render(
      <>
        <MobileHistoryCardHeader
          trip={{ id: 't2', patient: 'John Doe', date: '2026-09-22', type: 'Ambulatory', pickupCity: 'Avon', dropoffCity: 'Indy' }}
          detailed
          status="Completed"
        />
        <MobileHistoryStops
          pickupAddress="1 Main St"
          dropoffAddress="2 Oak Ave"
          pickupClock="9:35 AM"
          pickupOdometer="42,500"
          dropoffClock="10:05 AM"
          dropoffOdometer="42,512"
        />
      </>
    );
    expect(view.host.textContent).toContain('2026-09-22 · Ambulatory');
    expect(view.host.textContent).toContain('Avon → Indy');
    expect(view.host.textContent).toContain('Arrived: 9:35 AMOdo: 42,500');
    expect(view.host.querySelectorAll('[data-testid="mobile-history-stops"] > div')).toHaveLength(2);
    view.cleanup();
  });
});
