import { openWellTransBrowser } from './welltrans.browser.js';
import { saveEncryptedSession } from './cryptoSession.js';

async function autoLogin(page, username, password) {
  const loginInput = page.getByRole('textbox', { name: /login name|username|email/i }).first();
  const passwordInput = page.getByRole('textbox', { name: /password/i }).first()
    .or(page.locator('input[type="password"]').first());
  const loginButton = page.getByRole('button', { name: /log\s*in|sign\s*in|submit/i }).first();

  if (await loginInput.count() && await passwordInput.count()) {
    await loginInput.click();
    await loginInput.fill(username);
    await page.waitForTimeout(100);
    await passwordInput.click();
    await passwordInput.fill(password);
    await page.waitForTimeout(100);
    if (await loginButton.count()) {
      await loginButton.click();
    } else {
      await page.keyboard.press('Enter');
    }
    await page.waitForNavigation({ timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);

    const stillOnLogin = await page.getByRole('textbox', { name: /login name|username|email/i }).count();
    if (stillOnLogin) {
      throw new Error('Auto-login failed: still on login page after credentials were submitted');
    }
    return true;
  }
  return false;
}

async function detectAndOpenAssignedTask(page) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    for (const frame of page.frames()) {
      const hasGrid = await frame.locator('core\\:grid[gridobject="Pass.UI.Grid.TripBrokerEventsGrid"]').count().catch(() => 0);
      const hasAssignedTask = await frame.locator('.ChangeSchedule, .BulkEdit, [title="Select Schedule"]').count().catch(() => 0);
      if (hasGrid || hasAssignedTask) return true;

      const tripsLink = frame.getByRole('button', { name: /trips.*assigned|assigned.*trips/i }).first()
        .or(frame.locator('[title*="TRIPS - ASSIGNED"], [title*="Trips - Assigned"]').first());
      if (await tripsLink.count() && await tripsLink.isVisible().catch(() => false)) {
        await tripsLink.click().catch(() => {});
        await page.waitForTimeout(2000);
      }
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  return false;
}

export async function performManualLogin({ keepOpen = false, reuseSession = false } = {}) {
  let settings = {};
  try {
    const { getFirestore } = await import('firebase-admin/firestore');
    const db = getFirestore();
    const settingsSnap = await db.doc('welltrans_settings/primary').get();
    if (settingsSnap.exists) settings = settingsSnap.data() || {};
  } catch {}

  const { browser, context, page } = await openWellTransBrowser({ headed: true, withoutSession: !reuseSession });
  await page.goto(process.env.WELLTRANS_PORTAL_URL, { waitUntil: 'domcontentloaded' });

  const username = settings.portalUsername || process.env.WELLTRANS_USERNAME || '';
  const password = settings.portalPassword || process.env.WELLTRANS_PASSWORD || '';

  if (username && password) {
    process.stdout.write('Attempting auto-login with saved credentials...\n');
    try {
      const loggedIn = await autoLogin(page, username, password);
      if (loggedIn) {
        process.stdout.write('Auto-login successful. Searching for TRIPS - ASSIGNED...\n');
        const found = await detectAndOpenAssignedTask(page);
        if (found) {
          await saveEncryptedSession(process.env.WELLTRANS_SESSION_FILE, await context.storageState());
          process.stdout.write('Encrypted WellTrans session saved from auto-login.\n');
          if (keepOpen) return { browser, context, page };
          await browser.close();
          return null;
        }
        process.stdout.write('Auto-login succeeded but TRIPS - ASSIGNED was not found. Falling back to manual login.\n');
      }
    } catch (error) {
      process.stdout.write(`Auto-login failed: ${error.message}. Falling back to manual login.\n`);
    }
  }

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
