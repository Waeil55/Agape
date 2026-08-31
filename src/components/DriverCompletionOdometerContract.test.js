import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./DriverPage.jsx', import.meta.url), 'utf8');

const functionBody = (name, nextName) => source.slice(
  source.indexOf(`const ${name} =`),
  source.indexOf(`const ${nextName} =`),
);

describe('driver completion odometer contract', () => {
  it('shows pickup and final odometers as editable native-keyboard fields', () => {
    expect(source).toContain("const [completePickupOdometer, setCompletePickupOdometer] = useState('')");
    expect(source).toContain("openNativeOdometerKeyboard('completePickup')");
    expect(source).toContain("activeNativeOdometer === 'completePickup'");
    expect(source).toContain('Pickup odometer. Opens mobile numeric keyboard.');
    expect(source).toContain('completePickup: showCompleteModal ? {');
  });

  it('loads a recorded pickup reading but permits a missing reading to be entered', () => {
    const body = functionBody('openCompleteModal', 'updateCompletionDeparture');
    expect(body).toContain('const pickupOdometerSeed = sanitizeOdometerInput(');
    expect(body).toContain('trip.pickupOdometer');
    expect(body).toContain('currentVehicleOdometer > 0 ? currentVehicleOdometer : null');
    expect(body).toContain('lastOdometer > 0 ? lastOdometer : null');
    expect(body).toContain('setCompletePickupOdometer(pickupOdometerSeed)');
    expect(source).toContain('placeholder="Pickup reading"');
  });

  it('makes the final/dropoff odometer the only explicit initial focus target', () => {
    expect(source.match(/data-trip-initial-focus="true"/g)).toHaveLength(2);
    expect(source).toContain("openNativeOdometerKeyboard('complete')");
    const completionMarkup = source.slice(source.indexOf('{/* ===== COMPLETE TRIP MODAL ===== */'), source.indexOf('{/* ===== TRIP RECEIPT ===== */'));
    expect(completionMarkup.indexOf('data-trip-initial-focus="true"')).toBeGreaterThan(completionMarkup.indexOf('Final Odometer (mi)'));
    expect(completionMarkup.indexOf('data-trip-initial-focus="true"')).toBeLessThan(completionMarkup.indexOf("openNativeOdometerKeyboard('complete')"));
    expect(completionMarkup.slice(0, completionMarkup.indexOf('Final Odometer (mi)'))).not.toContain('data-trip-initial-focus="true"');
  });

  it('requires and persists the entered pickup reading with the final reading', () => {
    const body = functionBody('submitComplete', 'getPrimaryTripAction');
    expect(body).toContain('Enter the pickup odometer reading before completing this trip.');
    expect(body).toContain('pickupOdometer: pickupOdo');
    expect(body).toContain('dropoffOdometer: odo');
    expect(body).toContain("setCompletePickupOdometer('')");
    expect(source).toContain('disabled={!completePickupOdometer || !completeOdometer || completionBlocked}');
  });
});
