import React, { useState, memo } from 'react';
import { getInitials, getAvatarColor, formatChatMessageTime, EMOJI_QUICK } from '../../utils/chatHelpers';
import { FileText, Download, SmilePlus } from 'lucide-react';

const ChatMessage = memo(function ChatMessage({
  group, isOwn, onlineUsers, onReaction, currentUserEmail,
  isFirstInSequence, isLastInSequence,
}) {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  return (
    <div
      className={`chat-bubble-enter flex ${isOwn ? 'justify-end' : 'justify-start'} ${isFirstInSequence ? 'mt-3' : 'mt-[2px]'}`}
    >
      {/* Sender avatar — only for incoming, only on last message in group */}
      {!isOwn && (
        <div className="shrink-0 w-8 mr-1.5 self-end pb-[2px]">
          {isLastInSequence ? (
            <div className={`w-8 h-8 rounded-full ${getAvatarColor(group.senderEmail)} flex items-center justify-center text-white text-[10px] font-bold`}>
              {getInitials(group.senderName)}
            </div>
          ) : (
            <div className="w-8" /> // placeholder to keep alignment
          )}
        </div>
      )}

      {/* Message column */}
      <div className={`flex flex-col gap-[2px] max-w-[78%] ${isOwn ? 'items-end' : 'items-start'}`}>
        {/* Sender name — only first in group for incoming */}
        {!isOwn && isFirstInSequence && (
          <span className="text-[11px] font-semibold text-slate-500 px-1 mb-0.5">
            {group.senderName}
          </span>
        )}

        {/* Bubble(s) */}
        {group.messages.map((msg, mi) => {
          const isFirst = mi === 0;
          const isLast = mi === group.messages.length - 1;

          // Corner rounding: iMessage-style grouped bubbles
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
              <div className={`relative inline-block ${isOwn ? ownRadius : otherRadius} ${
                msg.type === 'image' ? 'overflow-hidden p-0.5' : 'px-[14px] py-[8px]'
              } ${
                isOwn
                  ? 'bg-[#0084ff] text-white shadow-sm shadow-blue-500/20'
                  : 'bg-white text-slate-800 shadow-sm shadow-slate-200/80'
              }`}>
                {/* Image attachment */}
                {msg.type === 'image' && msg.fileUrl && (
                  <img
                    src={msg.fileUrl}
                    alt={msg.fileName || 'Image'}
                    className="max-h-[260px] max-w-[260px] rounded-[18px] object-cover cursor-pointer block"
                    onClick={() => window.open(msg.fileUrl, '_blank')}
                    loading="lazy"
                  />
                )}

                {/* File attachment */}
                {msg.type === 'file' && msg.fileUrl && (
                  <a
                    href={msg.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`flex items-center gap-2.5 p-1 rounded-xl mb-1 ${
                      isOwn ? 'hover:bg-blue-400/20' : 'hover:bg-slate-50'
                    } transition-colors`}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isOwn ? 'bg-white/20' : 'bg-blue-50'}`}>
                      <FileText size={18} className={isOwn ? 'text-white' : 'text-blue-500'} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-[13px] font-semibold truncate max-w-[160px] ${isOwn ? 'text-white' : 'text-slate-700'}`}>
                        {msg.fileName || 'File'}
                      </p>
                      {msg.fileSize > 0 && (
                        <p className={`text-[10px] mt-0.5 ${isOwn ? 'text-white/70' : 'text-slate-400'}`}>
                          {msg.fileSize < 1024 ? `${msg.fileSize} B`
                            : msg.fileSize < 1048576 ? `${(msg.fileSize / 1024).toFixed(1)} KB`
                            : `${(msg.fileSize / 1048576).toFixed(1)} MB`}
                        </p>
                      )}
                    </div>
                    <Download size={14} className={isOwn ? 'text-white/70' : 'text-slate-400'} />
                  </a>
                )}

                {/* Text */}
                {msg.text && (
                  <p className="text-[15px] leading-[1.4] whitespace-pre-wrap break-words">
                    {msg.text}
                  </p>
                )}
              </div>

              {/* Reactions */}
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

              {/* Hover emoji reaction button */}
              <div className={`absolute top-1/2 -translate-y-1/2 ${isOwn ? '-left-9' : '-right-9'} opacity-0 group-hover:opacity-100 transition-opacity z-10`}>
                <button
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className="p-1.5 rounded-full bg-white shadow-md hover:bg-slate-50 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <SmilePlus size={14} />
                </button>
              </div>

              {/* Emoji picker popover */}
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

        {/* Timestamp — only on last message in group */}
        {isLastInSequence && (
          <p className={`text-[11px] text-slate-400 mt-0.5 px-1 ${isOwn ? 'text-right' : ''}`}>
            {formatChatMessageTime(group.messages[group.messages.length - 1]?.timestamp)}
          </p>
        )}
      </div>
    </div>
  );
});

export default ChatMessage;
