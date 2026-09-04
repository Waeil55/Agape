import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
const manifest = JSON.parse(
  readFileSync(new URL('../../public/manifest.webmanifest', import.meta.url), 'utf8'),
);

const ruleBody = (selector) => {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`));
  expect(match, `Missing protected CSS rule: ${selector}`).not.toBeNull();
  return match[1];
};

describe('protected mobile viewport baseline from 839030d', () => {
  it('keeps the global shell on the verified 100vh sizing contract', () => {
    for (const selector of ['html', 'body', '#root', '#root > div,\n.app,\n.App']) {
      const rule = ruleBody(selector);
      expect(rule).toContain('height: 100%');
      expect(rule).toContain('height: 100vh');
      expect(rule).not.toContain('100dvh');
      expect(rule).not.toContain('min-height: 0');
    }

    expect(css).not.toContain('APPLICATION SCROLLING CONTRACT');
  });

  it('keeps the verified admin and mobile-login height behavior', () => {
    expect(ruleBody('.admin-app')).toContain('min-height: 100dvh');
    expect(ruleBody('.adm-sidebar')).toContain('height: 100dvh');
    expect(ruleBody('.adm-main')).toContain('height: 100dvh');

    const mobileLogin = css.match(
      /@media \(max-width: 1023px\)[\s\S]*?\.agape-login-stage\s*\{([^}]*)\}/,
    );
    expect(mobileLogin).not.toBeNull();
    expect(mobileLogin[1]).toContain('min-height: 100%');
    expect(mobileLogin[1]).not.toContain('min-height: 0');
  });

  it('keeps the installed PWA standalone instead of forcing fullscreen', () => {
    expect(manifest.display).toBe('standalone');
    expect(manifest.display_override).toEqual(['standalone', 'minimal-ui']);
    expect(manifest.display_override).not.toContain('fullscreen');
  });

  it('keeps the mobile navbar fixed to the approved bottom edge', () => {
    const bottomNav = ruleBody('.bottom-nav');
    expect(bottomNav).toContain('position: fixed');
    expect(bottomNav).toContain('bottom: 8px');
    expect(bottomNav).toContain('height: 56px');
    expect(bottomNav).not.toContain('position: absolute');
  });
});
