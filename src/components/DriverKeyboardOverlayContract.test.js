import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

describe('driver odometer keyboard overlay contract', () => {
  it('does not allow web or native keyboards to resize the application shell', () => {
    const capacitor = JSON.parse(read('capacitor.config.json'));
    expect(capacitor.plugins.Keyboard.resize).toBe('none');
    expect(capacitor.plugins.Keyboard.resizeOnFullScreen).toBe(false);
    for (const generatedConfig of [
      'android/app/src/main/assets/capacitor.config.json',
      'ios/App/App/capacitor.config.json',
    ]) {
      expect(JSON.parse(read(generatedConfig)).plugins.Keyboard).toMatchObject({
        resize: 'none',
        resizeOnFullScreen: false,
      });
    }
    expect(read('index.html')).toContain('interactive-widget=overlays-content');
    expect(read('index.html')).toContain('UI-KB-STABLE-20260829B');
    expect(read('src/App.jsx')).toContain('interactive-widget=overlays-content');
  });

  it('uses keyboard bounds to move only the trip action window', () => {
    const driver = read('src/components/DriverPage.jsx');
    const css = read('src/index.css');
    expect(driver).toContain('virtualKeyboard.overlaysContent = true');
    expect(driver).toContain('Keyboard.setResizeMode({ mode: KeyboardResize.None })');
    expect(driver).toContain("classList.toggle('trip-window-keyboard-visible', keyboardVisible)");
    expect(driver).toContain('const mutationObserver = new MutationObserver((records) =>');
    expect(driver).toContain("node.matches?.('.trip-window-panel')");
    expect(css).toContain('html.trip-window-keyboard-visible .trip-window-overlay');
    expect(css).toContain('bottom: var(--trip-window-keyboard-inset, 0px)');
    expect(driver).not.toContain('trip-window-kb-open');
    expect(driver).not.toContain('trip-window-kb-native');
    expect(driver).not.toContain('trip-window-kb-bounds');
    expect(driver).not.toContain("window.setInterval(poll, 100)");
    expect(css).not.toContain('html.trip-window-kb-open');
    expect(css).not.toContain('html.trip-window-kb-native');
    expect(css).not.toContain('html.trip-window-kb-bounds');
  });
});
