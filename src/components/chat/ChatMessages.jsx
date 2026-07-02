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
    const todayDate = new Date();
    const yesterdayDate = new Date(todayDate.getTime() - 86400000);
    const options = { year: 'numeric', month: 'numeric', day: 'numeric' };
    return {
      today: todayDate.toLocaleDateString('en-US', options),
      yesterday: yesterdayDate.toLocaleDateString('en-US', options),
    };
  }, []);

  const formatDateSeparator = (dateKey) => {
    if (dateKey === relativeDateLabels.today) return 'Today';
    if (dateKey === relativeDateLabels.yesterday) return 'Yesterday';
    return dateKey;
  };

  return (
    <div className="agape-chat-messages flex-1 min-h-0 overflow-y-auto overscroll-contain bg-[#f6f8fb] px-3 sm:px-4 py-2">
      {hasMore && (
        <button
          onClick={onLoadMore}
          disabled={loadingMore}
          className="w-full flex items-center justify-center gap-1.5 py-2.5 mb-1 text-xs text-blue-600 hover:text-blue-700 font-medium transition-colors"
        >
          {loadingMore ? <Loader2 size={14} className="animate-spin" /> : <ChevronUp size={14} />}
          {loadingMore ? 'Loading...' : 'Load earlier messages'}
        </button>
      )}

      {messages.length === 0 && !loadingMore && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mb-3">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-blue-400">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-slate-600">No messages yet</p>
          <p className="text-xs text-slate-400 mt-1">Start the conversation!</p>
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
              <div className="flex items-center gap-3 py-3">
                <div className="flex-1 h-px bg-slate-200/60" />
                <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-400 shadow-sm ring-1 ring-slate-200/60">{formatDateSeparator(group.dateKey)}</span>
                <div className="flex-1 h-px bg-slate-200/60" />
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
        <div className="flex items-center gap-2 px-2 py-2 mt-1">
          <div className="w-8 h-8 rounded-full bg-white shadow-sm ring-1 ring-slate-200 flex items-center justify-center shrink-0">
            <div className="flex gap-0.5">
              <span className="w-1 h-1 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1 h-1 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1 h-1 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
          <span className="text-[11px] text-slate-400 italic">
            {typingUsers.map(u => u.name.split(' ')[0]).join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
          </span>
        </div>
      )}

      <div ref={messagesEndRef} className="h-1" />
    </div>
  );
};

export default ChatMessages;
