// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { ManifestTripCard, ManifestKpiStrip } from './MobileTripManifest';

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

const sparse = { id: 'x1' };

describe('MobileTripManifest render smoke (sparse real-world trips)', () => {
  it('renders a card with almost no fields without crashing', () => {
    const html = renderEl(
      <ManifestTripCard trip={sparse} primaryAction={null} iconActions={[]} />
    );
    expect(html).toContain('Unknown client');
  });

  it('renders KPI strip', () => {
    const html = renderEl(
      <ManifestKpiStrip items={[{ id: 'all', label: 'All', value: 0, active: true, activeClass: 'x', onSelect: () => {} }]} />
    );
    expect(html).toContain('All');
  });

  it('shows the minutes-away countdown pill by default', () => {
    const html = renderEl(
      <ManifestTripCard trip={{ id: 't1', time: '14:00', date: new Date().toISOString(), pickup: '1 Main St', dropoff: '2 Main St' }} primaryAction={null} iconActions={[]} />
    );
    expect(html).toContain('away');
  });

  it('hides the minutes-away countdown pill on compact mobile trips cards', () => {
    const html = renderEl(
      <ManifestTripCard
        trip={{ id: 't1', time: '14:00', date: new Date().toISOString(), pickup: '1 Main St', dropoff: '2 Main St' }}
        primaryAction={null}
        iconActions={[]}
        hideCountdown
      />
    );
    expect(html).not.toContain('away');
  });

  it('keeps mileage visible when the countdown is hidden on compact mobile trips cards', () => {
    const html = renderEl(
      <ManifestTripCard
        trip={{ id: 't1', time: '14:00', date: new Date().toISOString(), pickup: '1 Main St', dropoff: '2 Main St' }}
        primaryAction={null}
        iconActions={[]}
        mileage="12 mi"
        hideCountdown
      />
    );
    expect(html).toContain('12 mi');
    expect(html).not.toContain('away');
  });

  it('keeps addresses dark by default and mutes them on compact mobile trips cards', () => {
    const trip = { id: 't1', time: '14:00', date: new Date().toISOString(), pickup: '1 Main St', dropoff: '2 Main St' };
    const defaultHtml = renderEl(<ManifestTripCard trip={trip} primaryAction={null} iconActions={[]} />);
    const mutedHtml = renderEl(<ManifestTripCard trip={trip} primaryAction={null} iconActions={[]} mutedAddress />);
    const addressClass = (html) => {
      const matches = html.match(/<span class="([^"]*text-slate-\d+[^"]*)" title="1 Main St">/);
      return matches ? matches[1] : '';
    };
    expect(addressClass(defaultHtml)).toContain('text-slate-700');
    expect(addressClass(mutedHtml)).toContain('text-slate-500');
  });
});
