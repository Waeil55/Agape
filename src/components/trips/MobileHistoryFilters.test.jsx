// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import MobileHistoryFilters from './MobileHistoryFilters';

describe('MobileHistoryFilters', () => {
  it('keeps date, status, driver and count on the shared one-line filter bar', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const onStatusChange = vi.fn();
    act(() => root.render(<MobileHistoryFilters startDate="2026-09-22" status="all" driver="all" drivers={['waeil2']} count={5} onStatusChange={onStatusChange} />));
    expect(host.querySelector('[data-testid="mobile-history-filters"]')).not.toBeNull();
    expect(host.textContent).toContain('9/22');
    expect(host.textContent).toContain('All Trips');
    expect(host.textContent).toContain('All Drivers');
    expect(host.textContent).toContain('5 trips');
    act(() => host.querySelectorAll('button')[3].click());
    const completed = [...host.querySelectorAll('button')].find((button) => button.textContent.includes('Completed'));
    act(() => completed.click());
    expect(onStatusChange).toHaveBeenCalledWith('completed');
    act(() => root.unmount());
    host.remove();
  });
});
