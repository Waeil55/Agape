import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('driver workspace premium redesign contract', () => {
  it('keeps mobile connectivity compact in the driver identity header', () => {
    const appSource = readSource('../App.jsx');
    const driverSource = readSource('./DriverPage.jsx');
    const indicatorSource = readSource('./pwa/OfflineIndicator.jsx');

    expect(appSource).toContain("role !== 'driver' && <OfflineIndicator />");
    expect(driverSource).toContain('<OfflineIndicator compact />');
    expect(driverSource).toContain("isGpsTracking ? 'GPS active' : 'GPS paused'");
    expect(indicatorSource).toContain('hidden shrink-0 z-[9997] md:block');
    expect(indicatorSource).toContain("recentlyRestored ? 'Back online' : 'Online'");
  });

  it('presents Tools as one focused route workspace', () => {
    const source = readSource('./DriverToolsPage.jsx');

    expect(source).toContain('Route studio');
    expect(source).toContain('Open full planner');
    expect(source).toContain('Route builder');
    expect(source).toContain('pb-24');
    expect(source).not.toContain('gray-');
  });

  it('keeps Messages truthful, local and free of duplicate directory actions', () => {
    const source = readSource('./chat/ChatPage.jsx');

    expect(source).toContain('const ChatAvatar');
    expect(source).not.toContain('ui-avatars.com');
    expect(source).not.toContain('Team directory');
    expect(source).toContain('{presenceLabel}');
    expect(source).toContain('aria-label="Start new conversation"');
  });

  it('keeps Settings focused on account, workday and preferences', () => {
    const source = readSource('./DriverPage.jsx');

    expect(source).toContain('Driver settings');
    expect(source).toContain('Navigation & display');
    expect(source).toContain('Account & access');
    expect(source).not.toContain("Today's Analytics");
    expect(source).not.toContain('buildDriverDailyAnalytics');
  });
});
