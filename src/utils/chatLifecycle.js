export const CHAT_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const CHAT_ATTACHMENT_TYPES = /^(image\/|application\/pdf$|text\/plain$)/;

export function isRealChatChannel(channel) {
  const message = channel?.lastMessage;
  return Boolean(message && message.senderId !== 'system' && message.text !== 'Started a new chat');
}

export function isAllowedChatAttachment(file) {
  return Boolean(file && file.size > 0 && file.size <= CHAT_ATTACHMENT_MAX_BYTES && CHAT_ATTACHMENT_TYPES.test(file.type || ''));
}

export function isMessageSeen(message, readerTimestamp) {
  const sentAt = message?.timestamp?.toMillis?.() || 0;
  return Boolean(sentAt && readerTimestamp >= sentAt);
}
