import React, { useState, memo } from 'react';
import { getInitials, getAvatarColor, formatChatMessageTime, EMOJI_QUICK } from '../../utils/chatHelpers';
import { FileText, Download, SmilePlus } from 'lucide-react';

const ChatMessage = memo(function ChatMessage({ group, isOwn, onlineUsers, onReaction, currentUserEmail, isFirstInSequence, isLastInSequence }) {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} ${isFirstInSequence ? 'mt-2' : 'mt-[2px]'}`}>
      {!isOwn && (
        <div className="shrink-0 w-8 mr-2 mt-auto">
          {isLastInSequence ? (
            <div className="relative">
              <div className={`w-8 h-8 rounded-full ${getAvatarColor(group.senderEmail)} flex items-center justify-center text-white text-[10px] font-bold`}>
                {getInitials(group.senderName)}
              </div>
            </div>
          ) : null}
        </div>
      )}

      <div className={`flex flex-col max-w-[78%] ${isOwn ? 'items-end' : 'items-start'}`}>
        {!isOwn && isFirstInSequence && (
          <div className="flex items-center gap-1.5 mb-1 px-1">
            <span className="text-[11px] font-semibold text-slate-700">{group.senderName}</span>
          </div>
        )}

        <div className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'} w-full`}>
          {group.messages.map((msg, mi) => (
            <div key={msg.id || mi} className="relative group w-full flex" style={{ justifyContent: isOwn ? 'flex-end' : 'flex-start' }}>
              <div className={`relative max-w-full ${msg.type === 'image' ? '' : 'inline-block'}`}>
                <div className={`inline-block px-3 py-[7px] text-[15px] leading-[1.35] shadow-sm ${
                  isOwn
                    ? 'bg-[#0084ff] text-white rounded-[18px] rounded-br-[4px]'
                    : 'bg-white text-slate-800 rounded-[18px] rounded-bl-[4px]'
                } ${msg.type === 'image' ? '!p-1' : ''}`}>
                  {msg.type === 'image' && msg.fileUrl && (
                    <div className="mb-1">
                      <img src={msg.fileUrl} alt={msg.fileName || 'Image'}
                        className="max-h-[260px] rounded-[14px] object-cover cursor-pointer"
                        onClick={() => window.open(msg.fileUrl, '_blank')} loading="lazy" />
                    </div>
                  )}

                  {msg.type === 'file' && msg.fileUrl && (
                    <a href={msg.fileUrl} target="_blank" rel="noopener noreferrer"
                      className={`flex items-center gap-2.5 p-2.5 rounded-xl mb-1 ${
                        isOwn ? 'bg-blue-500/30 hover:bg-blue-500/40' : 'bg-slate-50 hover:bg-slate-100'
                      } transition-colors`}>
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${isOwn ? 'bg-white/20' : 'bg-blue-50'}`}>
                        <FileText size={18} className={isOwn ? 'text-white' : 'text-blue-500'} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={`text-[13px] font-semibold truncate ${isOwn ? 'text-white' : 'text-slate-700'}`}>
                          {msg.fileName || 'File'}
                        </p>
                        {msg.fileSize > 0 && (
                          <p className={`text-[10px] mt-0.5 ${isOwn ? 'text-white/70' : 'text-slate-400'}`}>
                            {msg.fileSize < 1024 ? `${msg.fileSize} B` : msg.fileSize < 1048576 ? `${(msg.fileSize/1024).toFixed(1)} KB` : `${(msg.fileSize/1048576).toFixed(1)} MB`}
                          </p>
                        )}
                      </div>
                      <Download size={14} className={isOwn ? 'text-white/70' : 'text-slate-400'} />
                    </a>
                  )}

                  {msg.text && <p className="whitespace-pre-wrap break-words">{msg.text}</p>}
                </div>

                {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                  <div className={`flex flex-wrap gap-1 mt-0.5 ${isOwn ? 'justify-end' : 'justify-start'}`}>
                    {Object.entries(msg.reactions).map(([emoji, users]) => (
                      <button key={emoji} onClick={() => onReaction(msg.id, emoji)}
                        className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[11px] border transition-colors ${
                          users.includes(currentUserEmail)
                            ? 'bg-blue-50 border-blue-200 text-blue-700'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}>
                        <span>{emoji}</span>
                        <span className="font-medium">{users.length}</span>
                      </button>
                    ))}
                  </div>
                )}

                <div className={`absolute top-1/2 -translate-y-1/2 ${isOwn ? '-left-8' : '-right-8'} opacity-0 group-hover:opacity-100 transition-opacity`}>
                  <button onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    className="p-1.5 rounded-full bg-white shadow-md hover:bg-slate-50 text-slate-400 hover:text-slate-600">
                    <SmilePlus size={14} />
                  </button>
                </div>

                {showEmojiPicker && (
                  <div className={`absolute z-50 top-full mt-1 ${isOwn ? 'right-0' : 'left-0'} bg-white rounded-2xl border border-slate-200 shadow-xl p-2 flex flex-wrap gap-1 w-[200px]`}>
                    {EMOJI_QUICK.map(emoji => (
                      <button key={emoji} onClick={() => { onReaction(msg.id, emoji); setShowEmojiPicker(false); }}
                        className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-slate-100 text-xl transition-colors">
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {isLastInSequence && (
          <p className={`text-[10px] text-slate-400 mt-1 px-1 ${isOwn ? 'text-right' : ''}`}>
            {formatChatMessageTime(group.messages[group.messages.length - 1]?.timestamp)}
          </p>
        )}
      </div>
    </div>
  );
});

export default ChatMessage;
