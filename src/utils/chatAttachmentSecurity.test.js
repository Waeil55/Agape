import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const chatPagePath = fileURLToPath(new URL('../components/chat/ChatPage.jsx', import.meta.url));
const storageRulesPath = fileURLToPath(new URL('../../storage.rules', import.meta.url));

describe('chat attachment tenant boundary', () => {
  it('stores every new attachment beneath its verified channel and uploader', () => {
    const source = readFileSync(chatPagePath, 'utf8');
    expect(source).toContain('chat_attachments/${activeChannelId}/${currentUser.id}/');
    expect(source).toContain('A verified chat channel is required before uploading attachments.');
    expect(source).not.toContain('`chat_attachments/${currentUser.id}/${Date.now()}');
  });

  it('allows new attachment reads only to channel participants', () => {
    const rules = readFileSync(storageRulesPath, 'utf8');
    expect(rules).toContain('match /chat_attachments/{channelId}/{userId}/{fileName}');
    expect(rules).toContain('allow read: if isChannelParticipant(channelId);');
    expect(rules).toContain('allow create: if isChannelParticipant(channelId) && request.auth.uid == userId');
    expect(rules).toContain('allow create, update: if false;');
  });
});
