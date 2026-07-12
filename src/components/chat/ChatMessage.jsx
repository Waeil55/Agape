import React, { useState, useEffect, useRef, memo } from 'react';
import { getInitials, getAvatarColor, formatChatMessageTime, EMOJI_QUICK } from '../../utils/chatHelpers';
import { FileText, Download, SmilePlus, Check, CheckCheck, X } from 'lucide-react';

const URL_REGEX = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/g;

function renderTextWithLinks(text, isOwn) {
  const parts = String(text || '').split(URL_REGEX);
  return parts.map((part, i) => {
    if (part.match(URL_REGEX)) {
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className={`${isOwn ? 'text-white underline decoration-white/60 hover:text-white' : 'text-blue-600 hover:text-blue-700 underline decoration-blue-300'}`}
        >
          {part}
        </a>
      );
    }
    return part;
  });
}

const ChatMessage = memo(function ChatMessage({
  group, isOwn, onReaction, currentUserEmail,
  isFirstInSequence, isLastInSequence,
}) {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  const emojiRef = useRef(null);
  const lastMessage = group.messages[group.messages.length - 1];
  const readBy = Array.isArray(lastMessage?.readBy) ? lastMessage.readBy : [];
  const readByOther = readBy.some(email => String(email || '').toLowerCase() !== String(currentUserEmail || '').toLowerCase());

  useEffect(() => {
    if (!showEmojiPicker) return undefined;
    const handleClickOutside = (e) => {
      if (emojiRef.current && !emojiRef.current.contains(e.target)) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [showEmojiPicker]);

  return (
    <div
      className={`flex ${isOwn ? 'justify-end' : 'justify-start'} ${isFirstInSequence ? 'mt-3' : 'mt-[2px]'}`}
    >
      {!isOwn && (
        <div className="shrink-0 w-8 mr-1.5 self-end pb-[2px]">
          {isLastInSequence ? (
            <div className={`w-8 h-8 rounded-full ${getAvatarColor(group.senderEmail)} flex items-center justify-center text-white text-[10px] font-semibold`}>
              {getInitials(group.senderName)}
            </div>
          ) : (
            <div className="w-8" />
          )}
        </div>
      )}

      <div className={`flex flex-col gap-[2px] max-w-[78%] ${isOwn ? 'items-end' : 'items-start'}`}>
        {!isOwn && isFirstInSequence && (
          <span className="text-[11px] font-semibold text-slate-500 px-1 mb-0.5">
            {group.senderName}
          </span>
        )}

        {group.messages.map((msg, mi) => {
          const isFirst = mi === 0;
          const isLast = mi === group.messages.length - 1;
          const ownRadius = isFirst && isLast
            ? 'rounded-[20px] rounded-br-[5px]'
            : isFirst
            ? 'rounded-[20px] rounded-br-[8px]'
            : isLast
            ? 'rounded-[20px] rounded-tr-[8px] rounded-br-[5px]'
            : 'rounded-[20px] rounded-r-[8px]';
          const otherRadius = isFirst && isLast
            ? 'rounded-[20px] rounded-bl-[5px]'
            : isFirst
            ? 'rounded-[20px] rounded-bl-[8px]'
            : isLast
            ? 'rounded-[20px] rounded-tl-[8px] rounded-bl-[5px]'
            : 'rounded-[20px] rounded-l-[8px]';

          return (
            <div
              key={msg.id || mi}
              className="relative group"
              style={{ alignSelf: isOwn ? 'flex-end' : 'flex-start', maxWidth: '100%' }}
            >
              <div className={`agape-chat-bubble relative inline-block ${isOwn ? ownRadius : otherRadius} ${
                msg.type === 'image' ? 'overflow-hidden p-0.5' : 'px-[14px] py-[8px]'
              } ${
                isOwn
                  ? 'bg-[#0084ff] text-white shadow-[0_2px_10px_rgba(0,132,255,0.18)]'
                  : 'bg-[#f0f2f5] text-slate-950 shadow-[0_2px_10px_rgba(15,23,42,0.06)]'
              }`}>
                {msg.type === 'image' && msg.fileUrl && (
                  <img
                    src={msg.fileUrl}
                    alt={msg.fileName || 'Image'}
                    className="max-h-[260px] max-w-[260px] rounded-[18px] object-cover cursor-pointer block"
                    onClick={() => setPreviewImage(msg.fileUrl)}
                    loading="lazy"
                  />
                )}

                {msg.type === 'file' && msg.fileUrl && (
                  <a
                    href={msg.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`flex items-center gap-2.5 p-1 rounded-xl mb-1 ${
                      isOwn ? 'hover:bg-blue-400/20' : 'hover:bg-slate-50'
                    } transition-colors`}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isOwn ? 'bg-white/50' : 'bg-blue-50'}`}>
                      <FileText size={18} className={isOwn ? 'text-blue-600' : 'text-blue-500'} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-[13px] font-semibold truncate max-w-[160px] ${isOwn ? 'text-blue-700' : 'text-slate-700'}`}>
                        {msg.fileName || 'File'}
                      </p>
                      {msg.fileSize > 0 && (
                        <p className={`text-[10px] mt-0.5 ${isOwn ? 'text-blue-500' : 'text-slate-400'}`}>
                          {msg.fileSize < 1024 ? `${msg.fileSize} B`
                            : msg.fileSize < 1048576 ? `${(msg.fileSize / 1024).toFixed(1)} KB`
                            : `${(msg.fileSize / 1048576).toFixed(1)} MB`}
                        </p>
                      )}
                    </div>
                    <Download size={14} className={isOwn ? 'text-blue-500' : 'text-slate-400'} />
                  </a>
                )}

                {msg.text && (
                  <p className="agape-chat-text text-[15px] leading-[1.4] whitespace-pre-wrap break-words">
                    {renderTextWithLinks(msg.text, isOwn)}
                  </p>
                )}
              </div>

              <div className={`opacity-0 group-hover:opacity-100 transition-opacity ${isOwn ? 'text-right' : 'text-left'} mt-0.5 px-1 hidden md:block`}>
                <span className="text-[10px] text-slate-400">{formatChatMessageTime(msg.timestamp)}</span>
              </div>

              {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                <div className={`flex flex-wrap gap-1 mt-0.5 ${isOwn ? 'justify-end' : 'justify-start'}`}>
                  {Object.entries(msg.reactions).map(([emoji, users]) => (
                    <button
                      key={emoji}
                      onClick={() => onReaction(msg.id, emoji)}
                      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[11px] border shadow-sm transition-colors ${
                        users.includes(currentUserEmail)
                          ? 'bg-blue-50 border-blue-200 text-blue-700'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span>{emoji}</span>
                      <span className="font-medium">{users.length}</span>
                    </button>
                  ))}
                </div>
              )}

              <div ref={emojiRef} className={`absolute top-1/2 -translate-y-1/2 ${isOwn ? '-left-9' : '-right-9'} md:opacity-0 md:group-hover:opacity-100 transition-opacity z-10`}>
                <button
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className="p-1.5 rounded-full bg-white shadow-md hover:bg-slate-50 text-slate-400 hover:text-slate-600 transition-colors"
                  title="React"
                  aria-label="React"
                >
                  <SmilePlus size={14} />
                </button>
              </div>

              {showEmojiPicker && (
                <div className={`absolute z-50 top-full mt-1 ${isOwn ? 'right-0' : 'left-0'} bg-white rounded-2xl border border-slate-200 shadow-xl p-2 flex flex-wrap gap-1 w-[200px]`}>
                  {EMOJI_QUICK.map(emoji => (
                    <button
                      key={emoji}
                      onClick={() => { onReaction(msg.id, emoji); setShowEmojiPicker(false); }}
                      className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-slate-100 text-xl transition-colors active:scale-90"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {isLastInSequence && (
          <div className={`mt-1 flex items-center gap-1 px-1 text-[10px] text-slate-400 ${isOwn ? 'justify-end text-right' : 'justify-start'}`}>
            <span>{lastMessage?._localPending ? 'Sending' : formatChatMessageTime(lastMessage?.timestamp)}</span>
            {isOwn && (
              <span className="inline-flex items-center gap-0.5 text-[#0084ff]" title={lastMessage?._localPending ? 'Sending' : readByOther ? 'Read' : 'Sent'}>
                {readByOther ? <CheckCheck size={12} /> : <Check size={12} />}
                <span>{lastMessage?._localPending ? 'Sending' : readByOther ? 'Read' : 'Sent'}</span>
              </span>
            )}
          </div>
        )}
      </div>

      {previewImage && (
        <div
          className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setPreviewImage(null)}
        >
          <img src={previewImage} alt="Preview" className="max-w-full max-h-full rounded-lg shadow-2xl object-contain" />
          <button
            onClick={() => setPreviewImage(null)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm text-white flex items-center justify-center hover:bg-white/30 transition"
            aria-label="Close preview"
          >
            <X size={20} />
          </button>
        </div>
      )}
    </div>
  );
});

export default ChatMessage;
