export type WellTransBrowserConfig = {
  portalUrl: string;
  headless: boolean;
  timeoutMs: number;
  screenshotBucketPrefix: string;
};

export const DEFAULT_BROWSER_CONFIG: WellTransBrowserConfig = {
  portalUrl: '',
  headless: true,
  timeoutMs: 30_000,
  screenshotBucketPrefix: 'welltrans_sync_screenshots',
};

