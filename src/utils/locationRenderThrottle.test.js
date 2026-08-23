import { describe, expect, it } from 'vitest';
import {
  POSITION_RENDER_INTERVAL_MS,
  shouldPublishPositionUpdate,
} from './locationRenderThrottle';

describe('driver position render throttling', () => {
  const origin = { lat: 39.7684, lng: -86.1581 };

  it('publishes the first valid position and rejects malformed samples', () => {
    expect(shouldPublishPositionUpdate(null, origin, 1000)).toBe(true);
    expect(shouldPublishPositionUpdate(null, { lat: NaN, lng: -86 }, 1000)).toBe(false);
  });

  it('coalesces stationary GPS callbacks until the render interval elapses', () => {
    const previous = { position: origin, notifiedAt: 1000 };
    expect(shouldPublishPositionUpdate(previous, { ...origin }, 1500)).toBe(false);
    expect(shouldPublishPositionUpdate(previous, { ...origin }, 1000 + POSITION_RENDER_INTERVAL_MS)).toBe(true);
  });

  it('publishes meaningful movement immediately', () => {
    const previous = { position: origin, notifiedAt: 1000 };
    expect(shouldPublishPositionUpdate(
      previous,
      { lat: 39.7685, lng: -86.1480 },
      1200,
    )).toBe(true);
  });
});
