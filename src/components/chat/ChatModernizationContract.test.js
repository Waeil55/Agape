import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const chatSource = readFileSync(new URL('./ChatPage.jsx', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../../index.css', import.meta.url), 'utf8');

describe('modern secure chat experience', () => {
  it('keeps production chat actions while adding pinned messages and calendar grouping', () => {
    expect(chatSource).toContain('toggleReaction(msg');
    expect(chatSource).toContain('forwardMessage');
    expect(chatSource).toContain('togglePin');
  });

  it('uses an accessible multiline composer and touch-friendly message actions', () => {
    expect(chatSource).toContain('agape-messenger-input-wrap');
    expect(chatSource).toContain('handleSend');
    expect(cssSource).toContain('.agape-messenger-bubble');
    expect(chatSource).toContain('className="agape-messenger-composer');
  });

  it('keeps the mobile message feed as a real touch-scroll viewport', () => {
    expect(cssSource).toMatch(/\.agape-messenger-thread-messages \{[\s\S]*?overflow-y: auto;[\s\S]*?touch-action: pan-y;/);
  });
});
