import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

describe('login keyboard stability contract', () => {
  it('keeps the login container fixed and does not use dynamic viewport units', () => {
    const css = read('src/index.css');
    expect(css).toContain('position: fixed !important');
    expect(css).toContain('height: 100vh');
    expect(css).not.toContain('.agape-login {\n  height: 100dvh');
  });

  it('applies KeyboardResize.None on native shell without counter-pan transforms', () => {
    const hook = read('src/hooks/useLoginKeyboardStability.js');
    const css = read('src/index.css');
    expect(hook).toContain('Keyboard.setResizeMode({ mode: KeyboardResize.None })');
    expect(hook).toContain('isNativeShell()');
    expect(css).not.toContain('--login-keyboard-counter-pan');
    const loginBlock = css.substring(css.indexOf('.agape-login {'), css.indexOf('.agape-login-backdrop'));
    expect(loginBlock).not.toContain('translate3d');
  });
});
