// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import MobileReportsPage from '../MobileReportsPage';

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
  { id: 'd1', name: 'Ann', email: 'ann@x.com' },
];

const trips = [
  { id: 't1', patient: 'Jane Doe', bookingId: 'BK-1', date: '2026-09-18', time: '09:30', status: 'Completed', driverId: 'd1', pickup: '1 Main St', dropoff: '2 Oak Ave' },
];

describe('MobileReportsPage smoke', () => {
  it('renders without crashing and includes Tools & Export button (SlidersHorizontal)', () => {
    const html = renderEl(
      <MobileReportsPage trips={trips} drivers={drivers} />
    );
    expect(html).toContain('Tools &amp; Export');
  });

  it('toggles Tools drawer when SlidersHorizontal button is clicked', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => {
      root.render(<MobileReportsPage trips={trips} drivers={drivers} />);
    });
    const toolsBtn = host.querySelector('button[aria-label*="Tools"]');
    expect(toolsBtn).not.toBeNull();
    act(() => {
      toolsBtn.click();
    });
    expect(host.innerHTML).toContain('Export CSV');
    act(() => { root.unmount(); });
    host.remove();
  });
});
