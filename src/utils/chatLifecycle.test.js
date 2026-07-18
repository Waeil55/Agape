import { describe, expect, it } from 'vitest';
import { isAllowedChatAttachment, isMessageSeen, isRealChatChannel } from './chatLifecycle';

describe('chat lifecycle', () => {
  it('does not treat placeholder channels as conversations', () => {
    expect(isRealChatChannel({ lastMessage: { senderId: 'system', text: 'Started a new chat' } })).toBe(false);
    expect(isRealChatChannel({})).toBe(false);
  });

  it('recognizes a user message as a real conversation', () => {
    expect(isRealChatChannel({ lastMessage: { senderId: 'user-1', text: 'Hello' } })).toBe(true);
  });

  it('enforces attachment size and type', () => {
    expect(isAllowedChatAttachment({ size: 1024, type: 'image/png' })).toBe(true);
    expect(isAllowedChatAttachment({ size: 11 * 1024 * 1024, type: 'image/png' })).toBe(false);
    expect(isAllowedChatAttachment({ size: 1024, type: 'application/x-msdownload' })).toBe(false);
  });

  it('derives seen state from timestamps', () => {
    const message = { timestamp: { toMillis: () => 100 } };
    expect(isMessageSeen(message, 100)).toBe(true);
    expect(isMessageSeen(message, 99)).toBe(false);
  });
});
