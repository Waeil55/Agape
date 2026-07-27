import { openWellTransBrowser } from './welltrans.browser.js';
import { saveEncryptedSession } from './cryptoSession.js';

export async function performManualLogin() {
  const { browser, context, page } = await openWellTransBrowser({ headed: true, withoutSession: true });
  await page.goto(process.env.WELLTRANS_PORTAL_URL, { waitUntil: 'domcontentloaded' });
  process.stdout.write('Complete WellTrans login in the opened browser, then press Enter here.\n');
  await new Promise(resolve => process.stdin.once('data', resolve));
  await saveEncryptedSession(process.env.WELLTRANS_SESSION_FILE, await context.storageState());
  await browser.close();
  process.stdout.write('Encrypted WellTrans session saved. No password was stored.\n');
}

