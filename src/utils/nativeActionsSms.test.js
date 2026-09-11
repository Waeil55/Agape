import { describe, expect, it } from 'vitest';
import { buildSmsUrl } from './nativeActions';

describe('native driver SMS URLs', () => {
  it('uses the iOS addressed-message format with an encoded body', () => {
    expect(buildSmsUrl('(317) 555-0101', "I'm on my way.", true)).toBe(
      'sms:3175550101&body=I\'m%20on%20my%20way.',
    );
  });

  it('uses the Android query format and rejects an empty recipient', () => {
    expect(buildSmsUrl('+1 317 555 0101', 'Ready?', false)).toBe(
      'sms:+13175550101?body=Ready%3F',
    );
    expect(buildSmsUrl('', 'Ready?', false)).toBe('');
  });
});
