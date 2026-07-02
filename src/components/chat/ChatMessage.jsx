import React, { useState, memo } from 'react';
import { getInitials, getAvatarColor, formatChatMessageTime, EMOJI_QUICK } from '../../utils/chatHelpers';
import { FileText, Download, SmilePlus, Check, CheckCheck } from 'lucide-react';

const ChatMessage = memo(function ChatMessage({ group, isOwn, onlineUsers, onReaction, currentUserEmail, isFirstInSequence, isLastInSequence }) {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const lastMessage = group.messages[group.messages.length - 1];
  const readBy = Array.isArray(lastMessage?.readBy) ? lastMessage.readBy : [];
  const readByOther = readBy.some(email => String(email || '').toLowerCase() !== String(currentUserEmail || '').toLowerCase());

  return (
    <div className={`agape-chat-message-row flex ${isOwn ? 'justify-end' : 'justify-start'} ${isFirstInSequence ? 'mt-3' : 'mt-0.5'}`}>
      {/* Avatar */}
      {!isOwn && (
        <div className="shrink-0 w-8 mr-2 mt-auto">
          {isLastInSequence ? (
            <div className="relative">
              <div className={`w-8 h-8 rounded-full ${getAvatarColor(group.senderEmail)} flex items-center justify-center text-white text-[10px] font-bold`}>
                {getInitials(group.senderName)}
              </div>
              {onlineUsers.has(group.senderEmail) && (
                <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white" />
              )}
            </div>
          ) : null}
        </div>
      )}

      {/* Message content */}
      <div className={`agape-chat-column flex flex-col max-w-[78%] ${isOwn ? 'items-end' : 'items-start'}`}>
        {/* Sender name */}
        {!isOwn && isFirstInSequence && (
          <div className="flex items-center gap-1.5 mb-1 px-1">
            <span className="text-[11px] font-semibold text-slate-700">{group.senderName}</span>
            <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-md ${
              group.senderRole === 'admin' ? 'bg-rose-100 text-rose-600' :
              group.senderRole === 'dispatcher' ? 'bg-blue-100 text-blue-600' :
              group.senderRole === 'driver' ? 'bg-emerald-100 text-emerald-600' :
              'bg-slate-100 text-slate-600'
            }`}>
              {group.senderRole}
            </span>
          </div>
        )}

        {/* Messages in group */}
        <div className={`agape-chat-bubble-stack flex flex-col ${isOwn ? 'items-end' : 'items-start'} w-full`}>
          {group.messages.map((msg, mi) => (
            <div key={msg.id || mi} className="relative group w-full flex" style={{ justifyContent: isOwn ? 'flex-end' : 'flex-start' }}>
              <div className={`agape-chat-bubble-wrap relative ${msg.type === 'image' ? '' : 'inline-block'}`}>
                <div className={`agape-chat-bubble inline-block rounded-[21px] px-3.5 py-2 text-[15px] leading-relaxed ${
                  isOwn
                    ? 'bg-blue-600 text-white rounded-br-md shadow-sm shadow-blue-600/10'
                    : 'bg-white text-slate-800 rounded-bl-md shadow-[0_1px_4px_rgba(15,23,42,0.08)]'
                } ${msg.type === 'image' ? '!p-1.5' : ''} ${
                  !isOwn && 'ring-1 ring-slate-200/70'
                }`}>
                  {/* File attachment */}
                  {msg.type === 'image' && msg.fileUrl && (
                    <div className="mb-1">
                      <img
                        src={msg.fileUrl}
                        alt={msg.fileName || 'Image'}
                        className="max-h-[240px] rounded-xl object-cover cursor-pointer"
                        onClick={() => window.open(msg.fileUrl, '_blank')}
                        loading="lazy"
                      />
                    </div>
                  )}

                  {msg.type === 'file' && msg.fileUrl && (
                    <a
                      href={msg.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`flex items-center gap-2.5 p-2.5 rounded-xl mb-1 ${
                        isOwn ? 'bg-blue-500 hover:bg-blue-400' : 'bg-white hover:bg-slate-50'
                      } transition-colors`}
                    >
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                        isOwn ? 'bg-blue-400/50' : 'bg-blue-50'
                      }`}>
                        <FileText size={18} className={isOwn ? 'text-blue-200' : 'text-blue-500'} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={`text-xs font-semibold truncate ${isOwn ? 'text-white' : 'text-slate-700'}`}>
                          {msg.fileName || 'File'}
                        </p>
                        {msg.fileSize > 0 && (
                          <p className={`text-[10px] mt-0.5 ${isOwn ? 'text-blue-200' : 'text-slate-400'}`}>
                            {msg.fileSize < 1024 ? `${msg.fileSize} B` : msg.fileSize < 1048576 ? `${(msg.fileSize/1024).toFixed(1)} KB` : `${(msg.fileSize/1048576).toFixed(1)} MB`}
                          </p>
                        )}
                      </div>
                      <Download size={14} className={isOwn ? 'text-blue-200' : 'text-slate-400'} />
                    </a>
                  )}

                  {/* Text */}
                  {msg.text && <p className="agape-chat-text whitespace-pre-wrap break-words">{msg.text}</p>}
                </div>

                {/* Reactions */}
                {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                  <div className={`flex flex-wrap gap-1 mt-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
                    {Object.entries(msg.reactions).map(([emoji, users]) => (
                      <button
                        key={emoji}
                        onClick={() => onReaction(msg.id, emoji)}
                        className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[11px] border transition-colors ${
                          users.includes(currentUserEmail)
                            ? 'bg-blue-50 border-blue-200 text-blue-700'
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        <span>{emoji}</span>
                        <span className="font-medium">{users.length}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Emoji picker trigger */}
                <div className={`absolute top-1/2 -translate-y-1/2 ${isOwn ? '-left-7' : '-right-7'} opacity-0 group-hover:opacity-100 transition-opacity`}>
                  <button
                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    className="p-1 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600"
                  >
                    <SmilePlus size={14} />
                  </button>
                </div>

                {/* Emoji picker dropdown */}
                {showEmojiPicker && (
                  <div className={`absolute z-50 top-full mt-1 ${isOwn ? 'right-0' : 'left-0'} bg-white rounded-xl border border-slate-200 shadow-lg p-2 flex flex-wrap gap-1 w-[200px]`}>
                    {EMOJI_QUICK.map(emoji => (
                      <button
                        key={emoji}
                        onClick={() => {
                          onReaction(msg.id, emoji);
                          setShowEmojiPicker(false);
                        }}
                        className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-lg transition-colors"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Timestamp */}
        {isLastInSequence && (
          <div className={`mt-1 flex items-center gap-1 px-1 text-[10px] text-slate-400 ${isOwn ? 'justify-end text-right' : 'justify-start'}`}>
            <span>{formatChatMessageTime(lastMessage?.timestamp)}</span>
            {isOwn && (
              <span className="inline-flex items-center gap-0.5 text-blue-400" title={readByOther ? 'Read' : 'Sent'}>
                {readByOther ? <CheckCheck size={12} /> : <Check size={12} />}
                <span>{readByOther ? 'Read' : 'Sent'}</span>
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

export default ChatMessage;
