import { describe, it, expect } from 'vitest';
import { designTokens } from './designTokens';

const isNonEmptyString = (value) => typeof value === 'string' && value.length > 0;

describe('designTokens surface', () => {
  it('exposes elevation at the top level for the shared layout components', () => {
    expect(designTokens.elevation).toBeTruthy();
    expect(isNonEmptyString(designTokens.elevation.sm)).toBe(true);
    expect(isNonEmptyString(designTokens.elevation.md)).toBe(true);
    expect(isNonEmptyString(designTokens.elevation.lg)).toBe(true);
    expect(isNonEmptyString(designTokens.elevation.bottomSheet)).toBe(true);
  });

  it('does not define elevation under colors', () => {
    expect(designTokens.colors.elevation).toBeUndefined();
  });

  it('keeps every token read by the shared layout and trip-detail components defined', () => {
    expect(isNonEmptyString(designTokens.colors.border.hairline)).toBe(true);
    expect(isNonEmptyString(designTokens.colors.background.secondary)).toBe(true);
    expect(isNonEmptyString(designTokens.zIndex.sticky)).toBe(true);
    expect(isNonEmptyString(designTokens.spacing.md)).toBe(true);
    expect(isNonEmptyString(designTokens.typography.body)).toBe(true);
    expect(isNonEmptyString(designTokens.radius.card)).toBe(true);
  });
});
