import { chromium } from 'playwright';
import { loadEncryptedSession } from './cryptoSession.js';

export async function openWellTransBrowser({ headed = false, withoutSession = false } = {}) {
  const browser = await chromium.launch({ headless: headed ? false : process.env.WELLTRANS_HEADLESS !== 'false' });
  const options = { viewport: { width: 1600, height: 1000 } };
  if (!withoutSession) options.storageState = await loadEncryptedSession(process.env.WELLTRANS_SESSION_FILE);
  const context = await browser.newContext(options);
  context.setDefaultTimeout(30000);
  return { browser, context, page: await context.newPage() };
}

