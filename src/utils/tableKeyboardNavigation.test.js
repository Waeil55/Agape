// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installTableKeyboardNavigation } from './tableKeyboardNavigation';

const renderTable = () => {
  document.body.innerHTML = '<table><tbody><tr><td>One</td></tr><tr><td>Two</td></tr><tr><td><input aria-label="Mileage"></td></tr></tbody></table>';
  document.querySelectorAll('tr').forEach((row) => { row.scrollIntoView = vi.fn(); });
  return [...document.querySelectorAll('tr')];
};

afterEach(() => { document.body.innerHTML = ''; });

describe('global table keyboard navigation', () => {
  it('makes one row tabbable and moves focus with ArrowUp, ArrowDown, Home, and End', () => {
    const rows = renderTable();
    const cleanup = installTableKeyboardNavigation(document);
    expect(rows.map((row) => row.tabIndex)).toEqual([0, -1, -1]);

    rows[0].focus();
    rows[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(rows[1]);
    expect(rows[1].getAttribute('data-agape-selected')).toBe('true');

    rows[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(document.activeElement).toBe(rows[2]);
    rows[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(document.activeElement).toBe(rows[0]);
    cleanup();
  });

  it('does not take arrow keys away from inputs inside table rows', () => {
    const rows = renderTable();
    const cleanup = installTableKeyboardNavigation(document);
    const input = document.querySelector('input');
    input.focus();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(document.activeElement).toBe(input);
    expect(rows[2].tabIndex).toBe(0);
    cleanup();
  });
});
