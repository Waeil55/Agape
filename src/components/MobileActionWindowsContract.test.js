import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

describe('mobile action windows and keyboard resilience contract', () => {
  it('enforces 3-zone structure in ScheduleEditorModal', () => {
    const editor = read('src/components/trips/ScheduleEditorModal.jsx');
    expect(editor).toContain('flex flex-col');
    expect(editor).toContain('shrink-0 flex items-center justify-between border-b');
    expect(editor).toContain('flex-1 min-h-0 overflow-y-auto');
    expect(editor).toContain('overscroll-contain touch-pan-y');
    expect(editor).toContain('shrink-0 flex gap-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))]');
  });

  it('standardizes driver and dispatch action prompts onto the authoritative trip-window architecture', () => {
    const driver = read('src/components/DriverPage.jsx');
    
    // cancelPrompt
    const cancelSlice = driver.slice(
      driver.indexOf('{/* ===== CANCEL / NO-SHOW LEG SELECTION MODAL ===== */}'),
      driver.indexOf('{/* ===== RESTORE LEG SELECTION MODAL ===== */}'),
    );
    expect(cancelSlice).toContain('className="trip-window-overlay bg-black/40"');
    expect(cancelSlice).toContain('className="trip-window-panel trip-window-panel-wide"');
    expect(cancelSlice).toContain('className="trip-window-header px-5 py-4 bg-blue-600 text-white"');
    expect(cancelSlice).toContain('className="trip-window-body p-4 space-y-2"');
    expect(cancelSlice).toContain('className="trip-window-footer px-4 pb-4"');

    // restorePrompt
    const restoreSlice = driver.slice(
      driver.indexOf('{/* ===== RESTORE LEG SELECTION MODAL ===== */}'),
      driver.indexOf('{/* ===== EMERGENCY TRANSFER MODAL ===== */}'),
    );
    expect(restoreSlice).toContain('className="trip-window-overlay bg-black/40"');
    expect(restoreSlice).toContain('className="trip-window-panel trip-window-panel-wide"');
    expect(restoreSlice).toContain('className="trip-window-header px-5 py-4 bg-blue-600 text-white"');
    expect(restoreSlice).toContain('className="trip-window-body p-4 space-y-2"');
    expect(restoreSlice).toContain('className="trip-window-footer px-4 pb-4"');

    // transferPrompt
    const transferSlice = driver.slice(
      driver.indexOf('{/* ===== EMERGENCY TRANSFER MODAL ===== */}'),
      driver.indexOf('{/* ===== PASSWORD CONFIRM MODAL ===== */}'),
    );
    expect(transferSlice).toContain('className="trip-window-overlay bg-black/40"');
    expect(transferSlice).toContain('className="trip-window-panel trip-window-panel-wide"');
    expect(transferSlice).toContain('className="trip-window-body p-4"');
    expect(transferSlice).toContain('className="trip-window-footer px-4 pb-4"');

    // passwordPrompt
    const passwordSlice = driver.slice(
      driver.indexOf('{/* ===== PASSWORD CONFIRM MODAL ===== */}'),
      driver.indexOf('{/* ===== DRIVER NATIVE QUICK SMS ===== */}'),
    );
    expect(passwordSlice).toContain('className="trip-window-overlay bg-black/40"');
    expect(passwordSlice).toContain('className="trip-window-panel trip-window-panel-wide"');
    expect(passwordSlice).toContain('className="trip-window-body p-4"');
    expect(passwordSlice).toContain('className="trip-window-footer px-4 pb-4"');

    // showLegsModal
    const legsSlice = driver.slice(
      driver.indexOf('{/* ===== LEGS DETAILS MODAL ===== */}'),
      driver.indexOf('{/* One fixed native input opens the phone keyboard'),
    );
    expect(legsSlice).toContain('className="trip-window-overlay bg-black/40"');
    expect(legsSlice).toContain('className="trip-window-panel trip-window-panel-wide"');
    expect(legsSlice).toContain('className="trip-window-header border-b border-slate-100 px-5 py-4"');
    expect(legsSlice).toContain('className="trip-window-body p-4 space-y-2"');

    // focusin listener for instantaneous keyboard unsuppression
    expect(driver).toContain('handlePanelFocusIn');
    expect(driver).toContain("document.addEventListener('focusin', handlePanelFocusIn, true)");
    expect(driver).toContain("document.removeEventListener('focusin', handlePanelFocusIn, true)");

    // contact selector safe area
    expect(driver).toContain('pb-[max(1rem,env(safe-area-inset-bottom,0px))] pt-2 border-t border-slate-100 bg-white');
  });

  it('provides authoritative classes in tripWindows.css', () => {
    const css = read('src/styles/tripWindows.css');
    expect(css).toContain('.trip-window-header {');
    expect(css).toContain('.trip-window-panel-wide {');
    expect(css).toContain('touch-action: pan-y;');
    expect(css).toContain('padding-bottom: max(0.75rem, env(safe-area-inset-bottom, 0px));');
  });
});
