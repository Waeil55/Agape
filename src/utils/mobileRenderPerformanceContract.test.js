import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
const policyMarker = '/* ===== FINAL MOBILE RENDER PERFORMANCE POLICY =====';

describe('mobile render performance policy', () => {
  it('is the final cascade policy so later premium styles cannot restore heavy effects', () => {
    const policyStart = css.lastIndexOf(policyMarker);

    expect(policyStart).toBeGreaterThan(-1);
    expect(policyStart).toBeGreaterThan(css.lastIndexOf('backdrop-filter: blur'));
    expect(policyStart).toBeGreaterThan(css.lastIndexOf('transition: all'));
  });

  it('removes mobile backdrop compositing and broad transition work', () => {
    const policy = css.slice(css.lastIndexOf(policyMarker));

    expect(policy).toContain('@media (pointer: coarse), (max-width: 900px)');
    expect(policy).toContain('[class*="backdrop-blur"]');
    expect(policy).toContain('backdrop-filter: none !important');
    expect(policy).toContain('[class~="transition-all"]');
    expect(policy).toContain('transition-property: color, background-color, border-color, opacity !important');
  });

  it('stops decorative loops without disabling functional loading spinners', () => {
    const policy = css.slice(css.lastIndexOf(policyMarker));

    expect(policy).toContain('.animate-gradient-mesh');
    expect(policy).toContain('.premium-loading-logo');
    expect(policy).toContain('animation: none !important');
    expect(policy).not.toContain('.animate-spin,');
  });
});
