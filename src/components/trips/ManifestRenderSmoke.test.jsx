// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { ManifestTripCard, ManifestKpiStrip, formatManifestMileage, getManifestActionBox } from './MobileTripManifest';

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
const futureTrip = () => {
  const scheduled = new Date(Date.now() + 30 * 60 * 1000);
  return {
    id: 't1',
    time: `${String(scheduled.getHours()).padStart(2, '0')}:${String(scheduled.getMinutes()).padStart(2, '0')}`,
    date: scheduled.toISOString(),
    pickup: '1 Main St',
    dropoff: '2 Main St',
  };
};

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
      <ManifestTripCard trip={futureTrip()} primaryAction={null} iconActions={[]} />
    );
    expect(html).toContain('away');
  });

  it('hides the minutes-away countdown pill on compact mobile trips cards', () => {
    const html = renderEl(
      <ManifestTripCard
        trip={futureTrip()}
        primaryAction={null}
        iconActions={[]}
        hideCountdown
      />
    );
    expect(html).not.toContain('away');
    expect(html).toContain('— mi');
  });

  it('keeps mileage visible when the countdown is hidden on compact mobile trips cards', () => {
    const html = renderEl(
      <ManifestTripCard
        trip={futureTrip()}
        primaryAction={null}
        iconActions={[]}
        mileage="12 mi"
        hideCountdown
      />
    );
    expect(html).toContain('12 mi');
    expect(html).not.toContain('away');
  });

  it('falls back to trip distance and never duplicates the miles unit', () => {
    expect(formatManifestMileage(undefined, { distance: 8 })).toBe('8 mi');
    expect(formatManifestMileage('12 miles', {})).toBe('12 miles');
    expect(formatManifestMileage(undefined, {})).toBe('— mi');
  });

  it('uses a solid green action box when a trip is in progress', () => {
    expect(getManifestActionBox('In Progress').cls).toContain('bg-emerald-600');
    const html = renderEl(
      <ManifestTripCard
        trip={{ id: 't1', status: 'In Progress', distance: 6, pickup: '1 Main St', dropoff: '2 Main St' }}
        primaryAction={{ label: 'Drive', onClick: () => {} }}
        hideCountdown
      />
    );
    expect(html).toContain('bg-emerald-600');
    expect(html).toContain('6 mi');
  });

  it('places the shared options menu in the top-right header exactly once', () => {
    const html = renderEl(
      <ManifestTripCard
        trip={{ id: 't1', bookingId: 'BK-1', pickup: '1 Main St', dropoff: '2 Main St' }}
        onMore={() => {}}
        moreLabel="Trip options"
      />
    );
    expect(html.match(/aria-label="Trip options"/g)).toHaveLength(1);
    expect(html.indexOf('aria-label="Trip options"')).toBeLessThan(html.indexOf('1 Main St'));
  });

  it('places the leg-details control after the SMS action', () => {
    const html = renderEl(
      <ManifestTripCard
        trip={{ id: 't1', patient: 'Jane', pickup: '1 Main St', dropoff: '2 Main St' }}
        iconActions={[{ id: 'message', onClick: () => {} }]}
        legs={2}
        legsLabel="2 Legs"
        onLegsClick={() => {}}
      />
    );
    expect(html).toContain('aria-label="Chat Passenger"');
    expect(html).toContain('aria-label="View 2 Legs details"');
    expect(html.indexOf('aria-label="Chat Passenger"')).toBeLessThan(html.indexOf('aria-label="View 2 Legs details"'));
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
