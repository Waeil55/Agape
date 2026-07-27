import { openWellTransBrowser } from './welltrans.browser.js';
import { saveEncryptedSession } from './cryptoSession.js';

export async function performManualLogin({ keepOpen = false } = {}) {
  const { browser, context, page } = await openWellTransBrowser({ headed: true, withoutSession: true });
  await page.goto(process.env.WELLTRANS_PORTAL_URL, { waitUntil: 'domcontentloaded' });
  process.stdout.write('Complete WellTrans login, open TRIPS - ASSIGNED so the itinerary grid is visible, then press Enter here.\n');
  await new Promise(resolve => process.stdin.once('data', resolve));
  let itineraryPage = null;
  for (let attempt = 0; attempt < 20 && !itineraryPage; attempt += 1) {
    for (const candidatePage of context.pages()) {
      for (const frame of candidatePage.frames()) {
        const hasGrid = await frame.locator('core\\:grid[gridobject="Pass.UI.Grid.TripBrokerEventsGrid"]').count().catch(() => 0);
        const hasAssignedTask = await frame.locator('.ChangeSchedule, .BulkEdit, [title="Select Schedule"]').count().catch(() => 0);
        if (hasGrid || hasAssignedTask) {
          itineraryPage = candidatePage;
          break;
        }
      }
      if (itineraryPage) break;
    }
    if (!itineraryPage) await new Promise(resolve => setTimeout(resolve, 500));
  }
  if (!itineraryPage) {
    await browser.close();
    throw new Error('The Trips Assigned task was not detected in any open WellTrans page or frame. Keep the itinerary table visible for two seconds before pressing Enter.');
  }
  await saveEncryptedSession(process.env.WELLTRANS_SESSION_FILE, await context.storageState());
  process.stdout.write('Encrypted WellTrans session saved. No password was stored.\n');
  if (keepOpen) return { browser, context, page: itineraryPage };
  await browser.close();
  return null;
}
