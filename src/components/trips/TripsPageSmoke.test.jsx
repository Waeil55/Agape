// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import TripsPage from '../TripsPage';

function renderEl(el) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => { root.render(el); });
  const html = host.innerHTML;
  act(() => { root.unmount(); });
  host.remove();
  return html;
}

const drivers = [
  { id: 'd1', name: 'Ann', email: 'ann@x.com', vehicle: 'VAN 1' },
  { id: 'd2', name: 'Bob', email: 'bob@x.com', vehicle: '' },
];

const todayKey = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
})();

const trips = [
  { id: 't1', patient: 'Jane Doe', bookingId: 'BK-1', date: todayKey, time: '09:30', status: 'Assigned', driverId: 'd1', pickup: '1 Main St', dropoff: '2 Oak Ave', distance: '8.2', type: 'AM1', pickupPhone: '5551112222' },
  { id: 't2', patient: 'John Smith', date: todayKey, time: 'Will Call', status: 'Unassigned', pickup: '3 Elm St', dropoff: '4 Pine St' },
  { id: 't3' },
  { id: 't4', patient: 'Zed', status: 'Completed', driverId: 'd2', time: '08:00', date: todayKey, pickup: 'A', dropoff: 'B' },
];

describe('TripsPage render smoke (dispatcher/admin portal entry)', () => {
  it.each(['dispatcher', 'admin'])('renders queue for role=%s without crashing', (role) => {
    const html = renderEl(
      <TripsPage trips={trips} role={role} currentUser="boss@x.com" drivers={drivers} />
    );
    expect(html).toContain('Jane Doe');
    expect(html).toContain('Drive trip');
  });

  it('shows driver chips, KPI strip, and on-time KPI', () => {
    const html = renderEl(
      <TripsPage trips={trips} role="dispatcher" currentUser="d@x.com" drivers={drivers} />
    );
    expect(html).toContain('Filter by driver');
    expect(html).toContain('Wait pool');
    expect(html).toContain('On-time');
  });

  it('shows empty state with no trips', () => {
    const html = renderEl(<TripsPage trips={[]} role="dispatcher" drivers={drivers} />);
    expect(html).toContain('Queue is empty');
  });
});
