import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const chatSource = readFileSync(new URL('./ChatPage.jsx', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../../index.css', import.meta.url), 'utf8');

describe('modern secure chat experience', () => {
  it('keeps production chat actions while adding pinned messages and calendar grouping', () => {
    expect(chatSource).toContain('latestPinnedMessage');
    expect(chatSource).toContain('formatMessageDate(msg.timestamp)');
    expect(chatSource).toContain('toggleReaction(msg');
    expect(chatSource).toContain('forwardMessage');
  });

  it('uses an accessible multiline composer and touch-friendly message actions', () => {
    expect(chatSource).toContain('<textarea');
    expect(chatSource).toContain("e.preventDefault(); handleSend();");
    expect(cssSource).toContain('.agape-message-actions > button');
    expect(cssSource).toContain('min-height: 1.875rem');
    expect(cssSource).toContain('Premium secure-chat visual surface');
    expect(cssSource).toContain('linear-gradient(135deg, #2a52ac 0%, #3969ce 100%)');
    expect(chatSource).toContain('className="agape-chat-composer-textarea"');
    expect(cssSource).toContain('height: 100% !important');
    expect(cssSource).toContain('min-height: 3rem');
  });

  it('keeps the mobile message feed as a real touch-scroll viewport', () => {
    expect(cssSource).toMatch(/\.agape-messenger-thread-messages \{[\s\S]*?min-height: 0;[\s\S]*?overflow-y: auto;[\s\S]*?touch-action: pan-y;[\s\S]*?-webkit-overflow-scrolling: touch;/);
    expect(cssSource).toMatch(/\.agape-messenger-container,[\s\S]*?\.agape-messenger-thread \{\s*min-height: 0;/);
  });
});
