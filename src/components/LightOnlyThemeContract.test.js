import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

describe('light-only application contract', () => {
  it('has no runtime theme selector or dark-mode style variants', () => {
    const app = read('src/App.jsx');
    const settings = read('src/components/SettingsPage.jsx');
    const driver = read('src/components/DriverPage.jsx');
    const css = read('src/index.css');
    const tailwind = read('tailwind.config.js');

    expect(app).not.toContain('dataset.theme');
    expect(app).not.toContain("classList.toggle('dark'");
    expect(settings).not.toContain('THEME_OPTIONS');
    expect(settings).not.toContain("id: 'appearance'");
    expect(driver).not.toContain("value: 'dark', label: 'Dark'");
    expect(css).not.toContain('[data-theme="dark"]');
    expect(css).not.toContain('theme-dark');
    expect(tailwind).not.toContain('darkMode:');
  });

  it('removes legacy stored theme values while preserving current preferences', () => {
    const app = read('src/App.jsx');
    expect(app).toContain('withoutLegacyTheme');
    expect(app).toContain('theme: deleteField()');
    expect(app).toContain("fontScale: 'md'");
    expect(app).toContain("readability: 'normal'");
  });
});
