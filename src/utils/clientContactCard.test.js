import { describe, expect, it } from 'vitest';
import { buildClientContactVCard, clientContactFileName } from './clientContactCard';

describe('client contact card', () => {
  it('builds an importable vCard with the canonical client phone', () => {
    const card = buildClientContactVCard('Dana Howard', '(317) 555-0100');
    expect(card).toContain('FN:Dana Howard\r\n');
    expect(card).toContain('TEL;TYPE=CELL:+13175550100\r\n');
    expect(card).toMatch(/^BEGIN:VCARD\r\nVERSION:3\.0/);
    expect(card).toMatch(/END:VCARD\r\n$/);
  });

  it('escapes contact fields and rejects invalid phone numbers', () => {
    const card = buildClientContactVCard('Dana\r\nTEL:911, Sr.;', '317-555-0100');
    expect(card).not.toContain('\r\nTEL:911');
    expect(card).toContain('Dana\\nTEL:911\\, Sr.\\;');
    expect(buildClientContactVCard('Dana', '555')).toBe('');
    expect(clientContactFileName('Dana / Howard')).toBe('Dana-Howard.vcf');
  });
});
