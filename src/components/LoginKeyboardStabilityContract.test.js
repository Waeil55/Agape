import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

describe('login keyboard stability contract', () => {
  it('locks the login container so the keyboard never shifts content', () => {
    const css = read('src/index.css');
    const loginBlock = css.substring(css.indexOf('.agape-login {'), css.indexOf('.agape-login-backdrop'));
    expect(loginBlock).toContain('position: fixed !important');
    expect(loginBlock).toContain('height: 100%');
    expect(loginBlock).toContain('overflow: hidden !important');
    expect(loginBlock).toContain('touch-action: manipulation');
    expect(loginBlock).toContain('overscroll-behavior: none');
    expect(loginBlock).not.toContain('100vh');
    expect(loginBlock).not.toContain('translate3d');
  });

  it('uses native resize-none without a login visualViewport scroll listener', () => {
    const app = read('src/App.jsx');
    const platform = read('src/utils/platform.js');
    expect(app).not.toContain('useLoginKeyboardStability');
    expect(platform).toContain('Keyboard.setResizeMode({ mode: KeyboardResize.None })');
    expect(platform).not.toContain('visualViewport');
  });

  it('keeps keyboard Go submission and role selection fail-safe', () => {
    const app = read('src/App.jsx');
    expect(app).toContain('<form onSubmit={submitLogin}');
    expect(app).toContain('type="submit"');
    expect(app).toContain("console.warn('[Auth] Login workspace preload skipped:'");
  });
});
