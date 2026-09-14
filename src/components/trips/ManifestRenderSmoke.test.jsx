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
});
