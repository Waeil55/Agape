import React, { useMemo } from 'react';
import ChatMessage from './ChatMessage';
import { ChevronUp, Loader2 } from 'lucide-react';

const ChatMessages = ({ messages, currentUser, onlineUsers, onReaction, hasMore, loadingMore, onLoadMore, messagesEndRef, typingUsers }) => {
  const groupedMessages = useMemo(() => {
    const groups = [];
    let currentGroup = null;

    messages.forEach((msg) => {
      const msgDate = msg.timestamp?.toDate?.() || new Date();
      const dateKey = msgDate.toLocaleDateString('en-US', { year: 'numeric', month: 'numeric', day: 'numeric' });
      const isSameSender = currentGroup?.senderEmail === msg.senderEmail;
      const isWithin5Min = currentGroup?.lastTime && (msgDate - currentGroup.lastTime) < 300000;

      if (!currentGroup || currentGroup.dateKey !== dateKey || !isSameSender || !isWithin5Min) {
        if (currentGroup) groups.push(currentGroup);
        currentGroup = {
          dateKey,
          senderEmail: msg.senderEmail,
          senderName: msg.senderName,
          senderRole: msg.senderRole,
          messages: [msg],
          lastTime: msgDate,
        };
      } else {
        currentGroup.messages.push(msg);
        currentGroup.lastTime = msgDate;
      }
    });
    if (currentGroup) groups.push(currentGroup);
    return groups;
  }, [messages]);

  const relativeDateLabels = useMemo(() => {
    const today = new Date();
    const yesterday = new Date(today.getTime() - 86400000);
    const opts = { year: 'numeric', month: 'numeric', day: 'numeric' };
    return { today: today.toLocaleDateString('en-US', opts), yesterday: yesterday.toLocaleDateString('en-US', opts) };
  }, []);

  const formatDateSeparator = (dateKey) => {
    if (dateKey === relativeDateLabels.today) return 'Today';
    if (dateKey === relativeDateLabels.yesterday) return 'Yesterday';
    return dateKey;
  };

  return (
    <div className="agape-chat-messages">
      {hasMore && (
        <button onClick={onLoadMore} disabled={loadingMore}
          className="w-full flex items-center justify-center gap-1.5 py-2 mb-1 text-xs text-blue-500 hover:text-blue-600 font-medium transition-colors">
          {loadingMore ? <Loader2 size={14} className="animate-spin" /> : <ChevronUp size={14} />}
          {loadingMore ? 'Loading...' : 'Load earlier messages'}
        </button>
      )}

      {messages.length === 0 && !loadingMore && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-20 h-20 rounded-full bg-white shadow-sm flex items-center justify-center mb-4">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-blue-500">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-slate-600">No messages yet</p>
          <p className="text-xs text-slate-400 mt-1">Send a message to start the conversation</p>
        </div>
      )}

      {groupedMessages.map((group, gi) => {
        const isOwn = group.senderEmail === currentUser.email;
        const prevGroup = groupedMessages[gi - 1];
        const nextGroup = groupedMessages[gi + 1];
        const isFirstInSequence = !prevGroup || prevGroup.senderEmail !== group.senderEmail || prevGroup.dateKey !== group.dateKey;
        const isLastInSequence = !nextGroup || nextGroup.senderEmail !== group.senderEmail || nextGroup.dateKey !== group.dateKey;
        const showDateSeparator = gi === 0 || groupedMessages[gi - 1]?.dateKey !== group.dateKey;

        return (
          <div key={gi} className={isLastInSequence ? 'mb-3' : 'mb-0.5'}>
            {showDateSeparator && (
              <div className="flex justify-center py-3">
                <span className="px-3 py-1 rounded-full bg-white/80 shadow-sm text-[11px] font-semibold text-slate-500 backdrop-blur-sm">
                  {formatDateSeparator(group.dateKey)}
                </span>
              </div>
            )}
            <ChatMessage
              group={group}
              isOwn={isOwn}
              onlineUsers={onlineUsers}
              onReaction={onReaction}
              currentUserEmail={currentUser.email}
              isFirstInSequence={isFirstInSequence}
              isLastInSequence={isLastInSequence}
            />
          </div>
        );
      })}

      {typingUsers.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 mt-1">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${getAvatarColorFallback(typingUsers[0]?.email)}`}>
            <span className="text-white text-[9px] font-bold">{(typingUsers[0]?.name || '?')[0].toUpperCase()}</span>
          </div>
          <div className="bg-white rounded-2xl rounded-bl-md px-4 py-2.5 shadow-sm">
            <div className="flex gap-1">
              <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        </div>
      )}

      <div ref={messagesEndRef} className="h-1" />
    </div>
  );
};

function getAvatarColorFallback(email) {
  const colors = ['bg-blue-500','bg-emerald-500','bg-violet-500','bg-amber-500','bg-rose-500','bg-cyan-500','bg-pink-500','bg-indigo-500'];
  let hash = 0;
  for (let i = 0; i < (email || '').length; i++) hash = email.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

export default ChatMessages;
