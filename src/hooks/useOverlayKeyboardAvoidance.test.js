import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('overlay keyboard avoidance contract', () => {
  it('lifts shared overlays above the keyboard without touching login or driver trip windows', () => {
    const hook = read('src/hooks/useOverlayKeyboardAvoidance.js');
    expect(hook).toContain("const EXCLUDED = '.trip-window-overlay, .agape-login'");
    expect(hook).toContain('overlay.style.paddingBottom');
    expect(hook).toContain("'keyboardWillShow'");
    expect(hook).not.toContain('scrollTop = 0');
    expect(read('src/App.jsx')).toContain('useOverlayKeyboardAvoidance(isAuthenticated)');
  });

  it('animates overlays without retaining a transform', () => {
    const css = read('src/index.css');
    expect(css).toContain('agape-panel-in 220ms cubic-bezier(0.2, 0.8, 0.2, 1) backwards');
    expect(css).toContain('prefers-reduced-motion');
  });
});
