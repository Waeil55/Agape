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

  it('sets native keyboard resize mode without scroll lock', () => {
    const hook = read('src/hooks/useLoginKeyboardStability.js');
    expect(hook).toContain('Keyboard.setResizeMode({ mode: KeyboardResize.None })');
    expect(hook).toContain('isNativeShell');
    expect(hook).not.toContain('el.scrollTop = 0');
    expect(hook).not.toContain('visualViewport');
  });
});
