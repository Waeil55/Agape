import { selectors } from './selectors.js';
import { fillActivityRow } from './welltrans.fields.js';

const locateActivityRow = async (page, bookingId, activity) => {
  const candidates = page.locator(selectors.resultRow).filter({ hasText: bookingId }).filter({ hasText: new RegExp(activity, 'i') });
  if (await candidates.count() !== 1) throw new Error(`Booking ${bookingId} ${activity} row match count was ${await candidates.count()}; expected exactly 1`);
  return candidates.first();
};

export async function syncWellTransTrip(page, payload, fieldMapping = {}) {
  await page.locator(selectors.bookingSearch).first().fill(payload.bookingId);
  await page.locator(selectors.searchButton).first().click();
  await page.waitForLoadState('networkidle').catch(() => {});
  const pickupRow = await locateActivityRow(page, payload.bookingId, 'Pickup');
  const dropoffRow = await locateActivityRow(page, payload.bookingId, 'Dropoff');
  await fillActivityRow(pickupRow, payload.pickup, payload, {
    ...fieldMapping, arrival: fieldMapping.pickupArrival, departure: fieldMapping.pickupDeparture,
  });
  await fillActivityRow(dropoffRow, payload.dropoff, payload, {
    ...fieldMapping, arrival: fieldMapping.dropoffArrival, departure: fieldMapping.dropoffDeparture,
  });
  await page.locator(selectors.save).first().click();
  await page.locator(selectors.success).first().waitFor({ state: 'visible', timeout: 15000 });
}
