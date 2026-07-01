import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Info, Phone, ChevronDown, Loader2 } from 'lucide-react';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';
import { clock, sameDay, dayLabel } from './helpers';

export default function ChatConversation({
  messages, activeConvo, uid, typing, onlineMap, newMsg, setNewMsg,
  onSend, replyTo, setReplyTo, onDelete, onBack, showInfo, setShowInfo,
  getDisplayName, pickColor, messagesEnd, inputRef, onTyping, loadingMore, hasMore
}) {
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState(null);
  const messagesContainerRef = useRef(null);

  const convo = messages.length > 0 ? messages[0] : null;
  const otherParticipant = convo?.senderId === uid
    ? messages.find(m => m.senderId !== uid)?.senderId
    : convo?.senderId;
  const otherName = getDisplayName(otherParticipant);
  const isOnline = onlineMap[otherParticipant];
  const color = pickColor(activeConvo);

  const handleScroll = () => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 120;
    setShowScrollBtn(!isNearBottom);
  };

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToBottom = () => {
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth' });
    setShowScrollBtn(false);
  };

  const getReplyTarget = (replyToId) => {
    return messages.find(m => m.id === replyToId);
  };

  const handleReply = (msg) => {
    setReplyTo(msg);
  };

  const clickReplyTo = (replyToId) => {
    const target = getReplyTarget(replyToId);
    if (target) {
      const container = messagesContainerRef.current;
      const el = container?.querySelector(`[data-msg-id="${replyToId}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el?.classList.add('bg-blue-50');
      setTimeout(() => el?.classList.remove('bg-blue-50'), 1500);
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="shrink-0 bg-white border-b border-gray-100 px-3 py-2.5 flex items-center gap-2 safe-area-top">
        <button onClick={onBack} className="p-2 -ml-1 text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-50 lg:hidden">
          <ArrowLeft size={20} />
        </button>
        <div className="relative">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-white"
            style={{ backgroundColor: color }}
          >
            {otherName?.split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase() || '?'}
          </div>
          {isOnline && (
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-bold text-gray-900 truncate">{otherName || 'Chat'}</h2>
          <p className="text-[10px] text-gray-400">
            {typing[activeConvo]?.length
              ? `${typing[activeConvo].join(', ')} typing...`
              : isOnline ? 'Online' : 'Offline'}
          </p>
        </div>
        <button
          onClick={() => setShowInfo(!showInfo)}
          className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-50"
        >
          <Info size={18} />
        </button>
      </div>

      {/* Info Panel */}
      {showInfo && (
        <div className="shrink-0 bg-white border-b border-gray-100 px-4 py-3 animate-slide-in-top">
          <div className="flex items-center gap-3 mb-2">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold text-white"
              style={{ backgroundColor: color }}
            >
              {otherName?.split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase() || '?'}
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900">{otherName}</h3>
              <p className="text-[10px] text-gray-400">{isOnline ? 'Online' : 'Offline'}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button className="flex-1 h-10 rounded-xl bg-blue-50 border border-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 transition-all">
              <Phone size={14} /> Call
            </button>
          </div>
        </div>
      )}

      {/* Messages */}
      <div
        ref={messagesContainerRef}
        data-chat-messages
        className="flex-1 overflow-y-auto px-0 py-3"
        style={{ paddingBottom: 'calc(80px + env(safe-area-inset-bottom, 0px))' }}
      >
        {loadingMore && (
          <div className="flex justify-center py-2">
            <Loader2 size={18} className="animate-spin text-gray-400" />
          </div>
        )}
        {messages.map((msg, i) => {
          const prev = messages[i - 1];
          const showDate = !prev || !sameDay(prev.createdAt, msg.createdAt);
          return (
            <React.Fragment key={msg.id}>
              {showDate && (
                <div className="flex justify-center py-3">
                  <span className="px-3 py-1 rounded-full bg-white border border-gray-100 text-[10px] font-semibold text-gray-400 shadow-sm">
                    {dayLabel(msg.createdAt)}
                  </span>
                </div>
              )}
              <div data-msg-id={msg.id}>
                <ChatMessage
                  msg={msg}
                  uid={uid}
                  onReply={handleReply}
                  onDelete={onDelete}
                  getDisplayName={getDisplayName}
                  onClickReply={clickReplyTo}
                />
              </div>
            </React.Fragment>
          );
        })}
        <div ref={messagesEnd} />
      </div>

      {/* Scroll to bottom */}
      {showScrollBtn && (
        <button
          onClick={scrollToBottom}
          className="fixed z-30 right-4 w-10 h-10 rounded-full bg-white border border-gray-200 shadow-lg flex items-center justify-center text-gray-500 active:scale-95 transition-all"
          style={{ bottom: 'calc(90px + env(safe-area-inset-bottom, 0px))' }}
        >
          <ChevronDown size={18} />
        </button>
      )}

      {/* Input */}
      <div className="shrink-0">
        <ChatInput
          value={newMsg}
          onChange={setNewMsg}
          onSend={onSend}
          replyTo={replyTo}
          onClearReply={() => setReplyTo(null)}
          onTyping={onTyping}
          getDisplayName={getDisplayName}
        />
      </div>
    </div>
  );
}
