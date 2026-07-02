import React, { useState, memo } from 'react';
import { getInitials, getAvatarColor, formatChatMessageTime, EMOJI_QUICK } from '../../utils/chatHelpers';
import { FileText, Download, SmilePlus } from 'lucide-react';

const ChatMessage = memo(function ChatMessage({ group, isOwn, onlineUsers, onReaction, currentUserEmail }) {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const isOnline = onlineUsers.has(group.senderEmail);

  return (
    <div className={`agape-chat-message-row py-1 group ${isOwn ? 'justify-end' : 'justify-start'}`}>
      {/* Avatar */}
      {!isOwn && (
        <div className="shrink-0 mt-1">
          <div className="relative">
            <div className={`w-8 h-8 rounded-full ${getAvatarColor(group.senderEmail)} flex items-center justify-center text-white text-[10px] font-bold`}>
              {getInitials(group.senderName)}
            </div>
            {isOnline && (
              <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white" />
            )}
          </div>
        </div>
      )}

      {/* Message content */}
      <div className={`agape-chat-column ${isOwn ? 'agape-chat-column--own' : 'agape-chat-column--other'}`}>
        {/* Sender name */}
        {!isOwn && (
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-[11px] font-semibold text-slate-700">{group.senderName}</span>
            <span className={`text-[8px] font-bold px-1 py-0.5 rounded ${
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
        <div className={`agape-chat-bubble-stack ${isOwn ? 'items-end' : 'items-start'}`}>
          {group.messages.map((msg, mi) => (
            <div key={msg.id || mi} className="agape-chat-bubble-wrap">
              <div className={`agape-chat-bubble rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                isOwn
                  ? 'bg-blue-600 text-white rounded-br-md'
                  : 'bg-slate-100 text-slate-800 rounded-bl-md'
              } ${msg.type === 'image' ? 'p-1' : ''}`}>
                {/* File attachment */}
                {msg.type === 'image' && msg.fileUrl && (
                  <div className="agape-chat-attachment mb-1">
                    <img
                      src={msg.fileUrl}
                      alt={msg.fileName || 'Image'}
                      className="agape-chat-media max-h-[200px] rounded-xl object-cover cursor-pointer"
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
                    className={`agape-chat-file flex items-center gap-2 p-2 rounded-lg mb-1 ${
                      isOwn ? 'bg-blue-500 hover:bg-blue-400' : 'bg-white hover:bg-slate-50'
                    } transition-colors`}
                  >
                    <FileText size={20} className={isOwn ? 'text-blue-200' : 'text-blue-500'} />
                    <div className="min-w-0 flex-1">
                      <p className={`text-xs font-medium truncate ${isOwn ? 'text-white' : 'text-slate-700'}`}>
                        {msg.fileName || 'File'}
                      </p>
                      {msg.fileSize > 0 && (
                        <p className={`text-[10px] ${isOwn ? 'text-blue-200' : 'text-slate-400'}`}>
                          {msg.fileSize < 1024 ? `${msg.fileSize} B` : msg.fileSize < 1048576 ? `${(msg.fileSize/1024).toFixed(1)} KB` : `${(msg.fileSize/1048576).toFixed(1)} MB`}
                        </p>
                      )}
                    </div>
                    <Download size={14} className={isOwn ? 'text-blue-200' : 'text-slate-400'} />
                  </a>
                )}

                {/* Text */}
                {msg.text && <p className="agape-chat-text">{msg.text}</p>}
              </div>

              {/* Reactions */}
              {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                <div className={`flex flex-wrap gap-1 mt-0.5 ${isOwn ? 'justify-end' : ''}`}>
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
              <div className={`absolute top-0 ${isOwn ? '-left-6' : '-right-6'} opacity-0 group-hover:opacity-100 transition-opacity`}>
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
          ))}
        </div>

        {/* Timestamp */}
        <p className={`text-[9px] text-slate-400 mt-0.5 ${isOwn ? 'text-right' : ''}`}>
          {formatChatMessageTime(group.messages[group.messages.length - 1]?.timestamp)}
        </p>
      </div>
    </div>
  );
});

export default ChatMessage;
