import { describe, expect, it } from 'vitest';
import {
  buildQuickSmsText,
  prepareClientSmsText,
  QUICK_SMS_TEMPLATES,
  suggestedQuickSmsTemplateId,
} from './clientSms';

describe('client SMS policy', () => {
  it('identifies Agape Care and includes opt-out instructions in every quick message', () => {
    const trip = { patient: 'Dana Howard' };
    QUICK_SMS_TEMPLATES.forEach((template) => {
      const message = buildQuickSmsText(template, trip);
      expect(message).toMatch(/^Agape Care: Hi Dana,/);
      expect(message).toMatch(/Reply STOP to opt out\.$/);
    });
  });

  it('normalizes manual text without duplicating brand or opt-out language', () => {
    const trip = { patient: 'Dana Howard' };
    expect(prepareClientSmsText('Please call your driver.', trip)).toBe(
      'Agape Care: Hi Dana, Please call your driver. Reply STOP to opt out.',
    );
    expect(prepareClientSmsText('Agape Care: Update. Reply STOP to opt out.', trip)).toBe(
      'Agape Care: Update. Reply STOP to opt out.',
    );
  });

  it('suggests today or tomorrow only for the matching service date', () => {
    const now = new Date(2026, 8, 11, 12, 0, 0);
    expect(suggestedQuickSmsTemplateId({ date: '2026-09-11' }, now)).toBe('today');
    expect(suggestedQuickSmsTemplateId({ date: '2026-09-12' }, now)).toBe('tomorrow');
    expect(suggestedQuickSmsTemplateId({ date: '2026-09-13' }, now)).toBeNull();
  });
});
