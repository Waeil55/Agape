import { chromium } from 'playwright';
import { loadEncryptedSession } from './cryptoSession.js';

export async function openWellTransBrowser({ headed = false, withoutSession = false } = {}) {
  const browser = await chromium.launch({ headless: headed ? false : process.env.WELLTRANS_HEADLESS !== 'false' });
  try {
    const options = { viewport: { width: 1600, height: 1000 } };
    if (!withoutSession) {
      const storageState = await loadEncryptedSession(process.env.WELLTRANS_SESSION_FILE);
      if (storageState) options.storageState = storageState;
    }
    const context = await browser.newContext(options);
    context.setDefaultTimeout(30000);
    return { browser, context, page: await context.newPage() };
  } catch (error) {
    await browser.close().catch(() => {});
    throw error;
  }
}
