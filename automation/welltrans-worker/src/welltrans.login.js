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

async function detectAndOpenAssignedTask(context) {
  for (const candidatePage of context.pages()) {
    for (const frame of candidatePage.frames()) {
      const hasGrid = await frame.locator('core\\:grid[gridobject="Pass.UI.Grid.TripBrokerEventsGrid"]').count().catch(() => 0);
      const hasAssignedTask = await frame.locator('.ChangeSchedule, .BulkEdit, [title="Select Schedule"]').count().catch(() => 0);
      if (hasGrid || hasAssignedTask) return candidatePage;

      const tripsLink = frame.getByRole('button', { name: /trips.*assigned|assigned.*trips/i }).first()
        .or(frame.locator('[title*="TRIPS - ASSIGNED"], [title*="Trips - Assigned"]').first());
      if (await tripsLink.count() && await tripsLink.isVisible().catch(() => false)) {
        await tripsLink.click().catch(() => {});
        await candidatePage.waitForTimeout(1000);
      }
    }
  }
  return null;
}

export async function performManualLogin({
  keepOpen = false,
  reuseSession = false,
  onWaiting = null,
  onBrowserReady = null,
} = {}) {
  const { browser, context, page } = await openWellTransBrowser({ headed: true, withoutSession: !reuseSession });
  await page.goto(process.env.WELLTRANS_PORTAL_URL, { waitUntil: 'domcontentloaded' });
  await onBrowserReady?.(page);

  const username = process.env.WELLTRANS_USERNAME || '';
  const password = process.env.WELLTRANS_PASSWORD || '';

  if (username && password) {
    process.stdout.write('Attempting auto-login with credentials stored on this worker computer...\n');
    try {
      const loggedIn = await autoLogin(page, username, password);
      if (loggedIn) {
        process.stdout.write('Auto-login successful. Searching for TRIPS - ASSIGNED...\n');
        const found = await detectAndOpenAssignedTask(context);
        if (found) {
          await saveEncryptedSession(process.env.WELLTRANS_SESSION_FILE, await context.storageState());
          process.stdout.write('Encrypted WellTrans session saved from auto-login.\n');
          if (keepOpen) return { browser, context, page: found };
          await browser.close();
          return null;
        }
        process.stdout.write('Auto-login succeeded. Waiting for the assigned itinerary workspace.\n');
      }
    } catch (error) {
      process.stdout.write(`Auto-login was unavailable: ${error.message}. Waiting for an authorized browser sign-in.\n`);
    }
  }

  process.stdout.write('WellTrans agent is monitoring the browser. Sign in when required; no terminal confirmation is needed.\n');
  let itineraryPage = null;
  while (browser.isConnected() && !itineraryPage) {
    itineraryPage = await detectAndOpenAssignedTask(context);
    if (itineraryPage) break;
    await onWaiting?.();
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  if (!itineraryPage) {
    throw new Error('The WellTrans browser was closed before the TRIPS - ASSIGNED itinerary workspace became available.');
  }
  await saveEncryptedSession(process.env.WELLTRANS_SESSION_FILE, await context.storageState());
  process.stdout.write('TRIPS - ASSIGNED detected automatically. Encrypted session saved; no password was stored.\n');
  if (keepOpen) return { browser, context, page: itineraryPage };
  await browser.close();
  return null;
}
