import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readComponent = (name) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const readCss = () => readFileSync(new URL('../../index.css', import.meta.url), 'utf8');

describe('agape prime motion tokens', () => {
  const css = () => readCss();

  it('defines the shared easing and duration scale', () => {
    expect(css()).toContain('--ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1)');
    expect(css()).toContain('--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1)');
    expect(css()).toContain('--dur-sheet:');
    expect(css()).toMatch(/--elev-4:/);
    expect(css()).toMatch(/--gradient-accent:/);
  });

  it('provides transform-only keyframes with reduced-motion fallback', () => {
    expect(css()).toContain('@keyframes agape-fade-up');
    expect(css()).toContain('@keyframes agape-sheet-in');
    expect(css()).toContain('@keyframes agape-shimmer');
    expect(css()).toContain('prefers-reduced-motion: reduce');
  });

  it('staggered lists animate children with capped delays', () => {
    expect(css()).toContain('.agape-stagger > *:nth-child(n+8)');
  });
});

describe('agape prime ui primitives', () => {
  it('skeleton renders shimmer blocks without layout animation', () => {
    const source = readComponent('Skeleton.jsx');
    expect(source).toContain('ui-skeleton');
    expect(source).toContain('aria-hidden="true"');
    expect(source).not.toContain('width:');
  });

  it('pressable card is keyboard operable and transform-based', () => {
    const source = readComponent('PressableCard.jsx');
    expect(source).toContain("role={interactive ? 'button' : undefined}");
    expect(source).toContain("event.key === 'Enter'");
    expect(source).toContain('active:scale-');
    expect(source).not.toContain('transition-all');
  });

  it('segmented control exposes tablist semantics with sliding pill', () => {
    const source = readComponent('SegmentedControl.jsx');
    expect(source).toContain('role="tablist"');
    expect(source).toContain('aria-selected={active}');
    expect(source).toContain('translateX(');
  });

  it('sheet is a modal dialog with drag-to-dismiss and escape support', () => {
    const source = readComponent('Sheet.jsx');
    expect(source).toContain('role="dialog" aria-modal="true"');
    expect(source).toContain("'Escape'");
    expect(source).toContain('> 96');
    expect(source).toContain('rounded-t-3xl');
    expect(source).toContain('overscroll-contain');
  });

  it('stat tile uses tabular numerals and semantic tones', () => {
    const source = readComponent('StatTile.jsx');
    expect(source).toContain('tabular-nums');
    expect(source).toContain('TONES[tone]');
  });

  it('sparkline stays dependency-free inline svg', () => {
    const source = readComponent('Sparkline.jsx');
    const externalImports = [...source.matchAll(/from '([^']+)'/g)].map((match) => match[1]).filter((module) => module !== 'react');
    expect(externalImports).toEqual([]);
    expect(source).toContain('<path');
  });

  it('empty state offers action affordance and focus ring', () => {
    const source = readComponent('EmptyState.jsx');
    expect(source).toContain('actionLabel');
    expect(source).toContain('focus-visible:ring-2');
  });
});
