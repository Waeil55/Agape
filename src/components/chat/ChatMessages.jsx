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
    <div className="agape-chat-messages flex-1 overflow-y-auto px-3 py-2 space-y-1">
      {hasMore && (
        <button
          onClick={onLoadMore}
          disabled={loadingMore}
          className="w-full flex items-center justify-center gap-1.5 py-2 text-xs text-blue-600 hover:text-blue-700 font-medium transition-colors"
        >
          {loadingMore ? <Loader2 size={14} className="animate-spin" /> : <ChevronUp size={14} />}
          {loadingMore ? 'Loading...' : 'Load earlier messages'}
        </button>
      )}

      {messages.length === 0 && !loadingMore && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mb-3">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-blue-400"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          </div>
          <p className="text-sm font-semibold text-slate-600">No messages yet</p>
          <p className="text-xs text-slate-400 mt-1">Start the conversation!</p>
        </div>
      )}

      {groupedMessages.map((group, gi) => {
        const isOwn = group.senderEmail === currentUser.email;
        return (
          <div key={gi}>
            {/* Date separator */}
            {gi === 0 || groupedMessages[gi - 1]?.dateKey !== group.dateKey ? (
              <div className="flex items-center gap-2 py-2">
                <div className="flex-1 h-px bg-slate-100" />
                <span className="text-[10px] font-semibold text-slate-400 px-2">{formatDateSeparator(group.dateKey)}</span>
                <div className="flex-1 h-px bg-slate-100" />
              </div>
            ) : null}

            <ChatMessage
              group={group}
              isOwn={isOwn}
              onlineUsers={onlineUsers}
              onReaction={onReaction}
              currentUserEmail={currentUser.email}
            />
          </div>
        );
      })}

      {typingUsers.length > 0 && (
        <div className="flex items-center gap-2 px-2 py-1">
          <div className="flex gap-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
          <span className="text-[11px] text-slate-400 italic">
            {typingUsers.map(u => u.name.split(' ')[0]).join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
          </span>
        </div>
      )}

      <div ref={messagesEndRef} />
    </div>
  );
};

export default ChatMessages;
