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
    expect(body).toContain('setCompletePickupOdometer(sanitizeOdometerInput(trip.pickupOdometer))');
    expect(source).toContain('placeholder="Pickup reading"');
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
