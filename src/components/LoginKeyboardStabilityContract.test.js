import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { calculateLoginKeyboardCounterPan } from '../utils/loginKeyboardLayout';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

describe('login keyboard stability contract', () => {
  it('counteracts browser visual-viewport panning without moving the layout viewport', () => {
    expect(calculateLoginKeyboardCounterPan({ baselinePageTop: 0, currentPageTop: 74 })).toBe(74);
    expect(calculateLoginKeyboardCounterPan({ baselinePageTop: 20, currentPageTop: 8 })).toBe(0);
    expect(calculateLoginKeyboardCounterPan({ baselinePageTop: 10, currentPageTop: 10 })).toBe(0);
  });

  it('locks only focused login fields and restores the shell after focus leaves', () => {
    const app = read('src/App.jsx');
    const hook = read('src/hooks/useLoginKeyboardStability.js');
    const css = read('src/index.css');
    expect(app).toContain('useLoginKeyboardStability(!isAuthenticated)');
    expect(hook).toContain("event.target?.closest?.('.agape-login')");
    expect(hook).toContain("document.addEventListener('focusin', handleFocusIn, true)");
    expect(hook).toContain("visualViewport?.addEventListener('scroll', scheduleLock)");
    expect(hook).toContain('Keyboard.setResizeMode({ mode: KeyboardResize.None })');
    expect(css).toContain('position: fixed !important');
    expect(css).toContain('height: 100vh');
    expect(css).toContain('var(--login-keyboard-counter-pan, 0px)');
    expect(css).not.toContain('.agape-login {\n  height: 100dvh');
  });
});
