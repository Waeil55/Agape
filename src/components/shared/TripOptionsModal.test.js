import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

describe('TripOptionsModal design and integration contract', () => {
  it('implements the exact unified options mockup in TripOptionsModal.jsx', () => {
    const modal = read('src/components/shared/TripOptionsModal.jsx');

    // Header with trip number and close button
    expect(modal).toContain('Trip #{tripNumber} Options');
    expect(modal).toContain('<X size={18} />');

    // Summary Card: Passenger, Driver, Status badge
    expect(modal).toContain('Passenger:');
    expect(modal).toContain('Driver:');
    expect(modal).toContain('badgeStyle.badge');
    expect(modal).toContain('badgeStyle.dot');

    // 7 Styled Action Rows matching user mockup
    expect(modal).toContain('Edit Trip Details');
    expect(modal).toContain('Reassign Driver');
    expect(modal).toContain('Transfer Trip');
    expect(modal).toContain('Mark Completed');
    expect(modal).toContain('Mark Rerouted');
    expect(modal).toContain('Passenger No Show');
    expect(modal).toContain('Cancel Trip');
    expect(modal).toContain('Archive Trip');

    // Chevron indicators on each action row
    expect(modal).toContain('<ChevronRight size={18}');

    // Role-gated capabilities
    expect(modal).toContain("const isAdmin = role === 'admin' || role === 'dispatcher';");
    expect(modal).toContain("const isDriver = role === 'driver';");
    expect(modal).toContain('isAdmin && onReassignDriver');
    expect(modal).toContain('isAdmin && onArchiveTrip');
    expect(modal).toContain('isDriver && onTransferTrip');
  });

  it('unifies options presentation across TripsPage and DriverPage', () => {
    const tripsPage = read('src/components/TripsPage.jsx');
    expect(tripsPage).toContain("<TripOptionsModal");
    expect(tripsPage).toContain("isOpen={Boolean(detailModalTrip && canOpenDetailMenu)}");
    expect(tripsPage).toContain("trip={detailModalTrip}");

    const driverPage = read('src/components/DriverPage.jsx');
    expect(driverPage).toContain("<TripOptionsModal");
    expect(driverPage).toContain("isOpen={Boolean(showMoreOptions?.id === trip.id)}");
    expect(driverPage).toContain("trip={trip}");

    const sharedIndex = read('src/components/shared/index.js');
    expect(sharedIndex).toContain("export { TripOptionsModal } from './TripOptionsModal';");
  });

  it('enforces reduced window width matching standard trip dialogs and multi-portal multi-trip selection', () => {
    const modal = read('src/components/shared/TripOptionsModal.jsx');
    expect(modal).toContain('trip-window-panel max-w-[23.5rem]');
    expect(modal).not.toContain('trip-window-panel-wide');

    const driverPage = read('src/components/DriverPage.jsx');
    expect(driverPage).toContain('onOptions: (t) => setShowMoreOptions(t)');

    const taskCard = read('src/components/TaskCard.jsx');
    expect(taskCard).toContain('selected={isSelected}');
    expect(taskCard).toContain('role="checkbox"');
    expect(taskCard).toContain('bg-blue-600 border-blue-600');
    expect(taskCard).toContain('actions?.onOptions ? () => actions.onOptions(task)');

    const tripsPage = read('src/components/TripsPage.jsx');
    expect(tripsPage).toContain('role="checkbox"');
    expect(tripsPage).toContain('bg-blue-600 border-blue-600');

    const dispatchView = read('src/components/MobileDispatchView.jsx');
    expect(dispatchView).toContain('selectedTripIds');
    expect(dispatchView).toContain('toggleSelectTrip');
    expect(dispatchView).toContain('role="checkbox"');
    expect(dispatchView).toContain('bg-blue-600 border-blue-600');
  });
});
