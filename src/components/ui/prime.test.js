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

describe('active shared loading primitive', () => {
  it('skeleton renders shimmer blocks without layout animation', () => {
    const source = readComponent('Skeleton.jsx');
    expect(source).toContain('ui-skeleton');
    expect(source).toContain('aria-hidden="true"');
    expect(source).not.toContain('width:');
  });

});
