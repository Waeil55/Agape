// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeAll } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import TaskCard from '../TaskCard';

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

const todayKey = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
})();

const task = {
  id: 't1',
  date: todayKey,
  time: '14:00',
  patient: 'Jane Doe',
  patientName: 'Jane Doe',
  status: 'Assigned',
  bookingId: 'BK-1',
  driverId: 'd1',
  pickup: { address: '1 Main St', phone: '', city: '' },
  dropoff: { address: '2 Oak Ave', phone: '', city: '' },
  pickupCity: '',
  dropoffCity: '',
  driverName: 'Jane Doe',
};

describe('TaskCard mobile compact contract (driver portal trips card)', () => {
  beforeAll(() => {
    if (typeof window !== 'undefined') {
      window.matchMedia = (query) => ({
        matches: String(query).includes('max-width: 767px'),
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      });
    }
  });

  it('renders the compact mobile card without the minutes-away countdown', () => {
    const html = renderEl(
      <TaskCard
        task={task}
        expandedId={null}
        onToggle={() => {}}
        isSelected={false}
        onSelect={() => {}}
        role="driver"
        actions={{}}
      />
    );
    expect(html).toContain('Jane Doe');
    expect(html).not.toContain('away');
    expect(html).toMatch(/(?:title="1 Main St")/);
  });

  it('mutes the address color on the compact mobile card', () => {
    const html = renderEl(
      <TaskCard
        task={task}
        expandedId={null}
        onToggle={() => {}}
        isSelected={false}
        onSelect={() => {}}
        role="driver"
        actions={{}}
      />
    );
    const matches = html.match(/<span class="([^"]*text-slate-\d+[^"]*)" title="1 Main St">/);
    expect(matches ? matches[1] : '').toContain('text-slate-500');
  });
});