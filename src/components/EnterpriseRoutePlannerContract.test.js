import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readComponent = (relPath) => readFileSync(new URL(`./${relPath}`, import.meta.url), 'utf8');

describe('Enterprise Route Planner & Compact Card Contracts', () => {
  it('ensures ManifestTripCard resets button min-heights and enforces compact padding on mobile', () => {
    const cardSource = readComponent('trips/MobileTripManifest.jsx');
    expect(cardSource).toContain('[&_button]:!min-h-0');
    expect(cardSource).toContain('max-md:[&_button]:!min-h-0');
    expect(cardSource).toContain('px-3.5 py-2.5 bg-slate-200 border-b border-slate-300 flex items-center justify-between');
    expect(cardSource).toContain('px-3 py-1.5 bg-slate-50/20 border-t border-slate-100/70');
  });

  it('ensures TripsPage and MobileDispatchView enforce compact card spacing and min-height resets', () => {
    const tripsSource = readComponent('TripsPage.jsx');
    expect(tripsSource).toContain('[&_button]:!min-h-0 max-md:[&_button]:!min-h-0 mb-1.5');
    expect(tripsSource).toContain('!w-5 !h-5 !min-h-0');

    const dispatchSource = readComponent('MobileDispatchView.jsx');
    expect(dispatchSource).toContain('[&_button]:!min-h-0 max-md:[&_button]:!min-h-0');
    expect(dispatchSource).toContain('!w-5 !h-5 !min-h-0');
    expect(dispatchSource).toContain('selectedTripIds.length > 0');
    expect(dispatchSource).toContain('<Route size={12} /> Plan');
  });

  it('ensures EnterpriseRoutePlanner provides segmented mobile views, deep tools, and touch scrolling', () => {
    const plannerSource = readComponent('EnterpriseRoutePlanner.jsx');

    // Mobile segmented switcher tabs
    expect(plannerSource).toContain("setMobileTab('available')");
    expect(plannerSource).toContain("setMobileTab('sequence')");
    expect(plannerSource).toContain("setMobileTab('tools')");

    // Deep route tools
    expect(plannerSource).toContain('addAllFiltered');
    expect(plannerSource).toContain('autoFixPickupBeforeDropoff');
    expect(plannerSource).toContain('clusterByLocality');
    expect(plannerSource).toContain('handleDispatchToDriver');

    // Touch momentum scrolling and safe area padding
    expect(plannerSource).toContain('touch-pan-y');
    expect(plannerSource).toContain('WebkitOverflowScrolling');
    expect(plannerSource).toContain('pb-[calc(88px+env(safe-area-inset-bottom,0px))]');

    // Reactivity to initialStops
    expect(plannerSource).toContain('initialStops');
    expect(plannerSource).toContain('useEffect');
  });

  it('ensures MobileEnterpriseDashboard wires plannedRouteStops and handleSendToPlan to Route Planner', () => {
    const dashSource = readComponent('MobileEnterpriseDashboard.jsx');
    expect(dashSource).toContain('plannedRouteStops');
    expect(dashSource).toContain('handleSendToPlan');
    expect(dashSource).toContain('initialStops={plannedRouteStops}');
    expect(dashSource).toContain('onSendToPlan={handleSendToPlan}');
  });
});
