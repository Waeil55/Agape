import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (name) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');

describe('desktop workspace navigation contract', () => {
  it('keeps Settings navigation reachable, contextual, and free of retired destinations', () => {
    const settings = read('SettingsPage.jsx');

    expect(settings).not.toContain("'appearance'");
    expect(settings).toContain('Workspace settings');
    expect(settings).toContain("aria-current={isActive ? 'page' : undefined}");
    expect(settings).toContain('type="button"');
  });

  it('persists only role-visible Admin sections and supplies useful page context', () => {
    const admin = read('DesktopAdminPage.jsx');

    expect(admin).toContain('agape_desktopAdminSection_');
    expect(admin).toContain('visibleSections.some((section) => section.id === activeSection)');
    expect(admin).toContain('localStorage.setItem(adminSectionStorageKey, activeSection)');
    expect(admin).toContain('subtitle={activeSubtitle}');
  });
});
