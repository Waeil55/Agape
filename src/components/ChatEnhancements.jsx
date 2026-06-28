/**
 * ADVANCED CHAT FEATURES
 * Audio messages, rich media, typing indicators, reactions, search
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Send, Mic, Paperclip, Smile, X, Play, Download, Search,
  Volume2, Loader2, AlertCircle, Check, CheckCheck
} from 'lucide-react';
import { aiSuggestSmartReply } from '../config/aiAdvanced';

/**
 * Audio Recorder Component
 */
export const AudioMessageRecorder = ({ onSend, disabled = false }) => {
  const [recording, setRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        onSend({ type: 'audio', data: blob, duration });
        stream.getTracks().forEach(track => track.stop());
        setDuration(0);
      };

      recorder.start();
      setRecording(true);

      timerRef.current = setInterval(() => {
        setDuration(d => d + 1);
      }, 1000);
    } catch (e) {
      console.error('Microphone access denied:', e);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setRecording(false);
      clearInterval(timerRef.current);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {!recording ? (
        <button
          onClick={startRecording}
          disabled={disabled}
          className="p-2 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
        >
          <Mic size={20} className="text-blue-600" />
        </button>
      ) : (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-50 rounded-lg border border-red-200">
          <div className="w-2 h-2 bg-red-600 rounded-full animate-pulse" />
          <span className="text-xs font-bold text-red-600">{duration}s</span>
          <button
            onClick={stopRecording}
            className="ml-auto p-1 hover:bg-red-100 rounded transition-colors"
          >
            <X size={16} className="text-red-600" />
          </button>
        </div>
      )}
    </div>
  );
};

/**
 * Audio Message Player
 */
export const AudioMessagePlayer = ({ src, duration }) => {
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef(null);

  return (
    <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
      <button
        onClick={() => playing ? audioRef.current?.pause() : audioRef.current?.play()}
        className="p-2 hover:bg-blue-100 rounded-full transition-colors"
      >
        {playing ? <Volume2 size={18} /> : <Play size={18} className="text-blue-600" />}
      </button>
      <div className="flex-1">
        <div className="w-full h-1 bg-blue-200 rounded-full cursor-pointer relative group">
          <div
            className="h-full bg-blue-600 rounded-full transition-all"
            style={{ width: `${(currentTime / duration) * 100 || 0}%` }}
          />
        </div>
        <p className="text-xs text-blue-600 mt-1">{currentTime}s / {duration}s</p>
      </div>
      <audio
        ref={audioRef}
        src={src}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)}
        onEnded={() => setPlaying(false)}
      />
    </div>
  );
};

/**
 * Message Reactions
 */
const MessageReactions = ({ message, onReact }) => {
  const reactions = ['👍', '❤️', '😂', '😮', '😢', '🔥'];
  const userReactions = message.reactions || {};

  return (
    <div className="flex flex-wrap gap-1">
      {reactions.map(emoji => {
        const count = Object.values(userReactions).filter(r => r === emoji).length;
        return (
          <button
            key={emoji}
            onClick={() => onReact(emoji)}
            className={`px-2 py-1 rounded-full text-sm transition-colors ${
              count > 0
                ? 'bg-slate-200 hover:bg-slate-300'
                : 'bg-slate-100 hover:bg-slate-200'
            }`}
          >
            {emoji} {count > 0 && count}
          </button>
        );
      })}
    </div>
  );
};

/**
 * Smart Reply Suggestions
 */
const SmartReplySuggestions = ({ message, context, onSelect }) => {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadSuggestions = async () => {
      setLoading(true);
      const replies = await aiSuggestSmartReply(message.text, context);
      setSuggestions(replies);
      setLoading(false);
    };
    loadSuggestions();
  }, [message, context]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Loader2 size={14} className="animate-spin" />
        Getting suggestions...
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {suggestions.map((reply, i) => (
        <button
          key={i}
          onClick={() => onSelect(reply)}
          className="w-full text-left text-xs p-2 bg-blue-50 hover:bg-blue-100 rounded border border-blue-200 transition-colors"
        >
          {reply}
        </button>
      ))}
    </div>
  );
};

/**
 * Rich Message Display
 */
export const RichMessage = ({ message, currentUserId, onReact, showSuggestions = false, context = [] }) => {
  const isOwn = message.senderId === currentUserId;
  const messageTime = new Date(message.timestamp?.toDate?.() || message.timestamp);

  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-2`}>
      <div className={`max-w-xs lg:max-w-md group relative`}>
        {/* Message Bubble */}
        <div
          className={`rounded-2xl px-4 py-3 ${
            isOwn
              ? 'bg-blue-600 text-white rounded-br-none'
              : 'bg-slate-100 text-slate-900 rounded-bl-none'
          }`}
        >
          {/* Text Message */}
          {message.type === 'text' && (
            <p className="text-sm leading-relaxed break-words">{message.text}</p>
          )}

          {/* Image Message */}
          {message.type === 'image' && (
            <div>
              <img
                src={message.imageUrl}
                alt="Message"
                className="max-w-xs rounded-lg mb-2"
              />
              {message.caption && <p className="text-sm">{message.caption}</p>}
            </div>
          )}

          {/* Audio Message */}
          {message.type === 'audio' && (
            <div className="flex items-center gap-2">
              <Play size={16} />
              <span className="text-sm">{message.duration}s Audio</span>
            </div>
          )}

          {/* File Message */}
          {message.type === 'file' && (
            <div className="flex items-center gap-2">
              <Paperclip size={16} />
              <span className="text-sm break-all">{message.fileName}</span>
            </div>
          )}

          {/* Location Message */}
          {message.type === 'location' && (
            <a
              href={`https://maps.google.com/?q=${message.lat},${message.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-center gap-2 text-sm underline ${
                isOwn ? 'text-blue-200' : 'text-blue-600'
              }`}
            >
              📍 {message.locationName}
            </a>
          )}
        </div>

        {/* Message Status & Time */}
        <div className={`flex items-center gap-2 mt-1 text-xs ${isOwn ? 'justify-end' : 'justify-start'} ${isOwn ? 'text-blue-400' : 'text-slate-500'}`}>
          <span>{messageTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          {isOwn && (
            <>
              {message.status === 'sent' && <Check size={14} />}
              {message.status === 'delivered' && <CheckCheck size={14} />}
              {message.status === 'read' && <CheckCheck size={14} className="text-blue-400" />}
            </>
          )}
        </div>

        {/* Reactions */}
        {message.reactions && Object.keys(message.reactions).length > 0 && (
          <div className="mt-2">
            <MessageReactions message={message} onReact={onReact} />
          </div>
        )}

        {/* Hover Actions */}
        <div className="absolute top-0 -left-12 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
          <button
            onClick={() => onReact('👍')}
            className="p-2 bg-white rounded-full shadow-lg hover:scale-110 transition-transform"
          >
            👍
          </button>
          <button
            onClick={() => onReact('❤️')}
            className="p-2 bg-white rounded-full shadow-lg hover:scale-110 transition-transform"
          >
            ❤️
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * Enhanced Message Input
 */
export const EnhancedMessageInput = ({ onSend, onAttachment, disabled = false, placeholder = 'Type a message...', showAIFeatures = true }) => {
  const [message, setMessage] = useState('');
  const [showAttachments, setShowAttachments] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const pendingAttachmentType = useRef('file');

  const handleSend = () => {
    if (message.trim()) {
      onSend(message);
      setMessage('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChange = (e) => {
    setMessage(e.target.value);
    // Auto-resize textarea
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
    }
  };

  const sendAttachment = (payload) => {
    if (onAttachment) {
      onAttachment(payload);
      return;
    }
    onSend(payload);
  };

  const handleAttachmentClick = (type) => {
    if (type === 'location') {
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition((position) => {
        sendAttachment({
          type: 'location',
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          locationName: 'Current location',
        });
        setShowAttachments(false);
      });
      return;
    }

    if (type === 'contact') {
      setMessage(prev => `${prev}${prev ? ' ' : ''}Contact: `);
      setShowAttachments(false);
      textareaRef.current?.focus();
      return;
    }

    pendingAttachmentType.current = type;
    fileInputRef.current?.click();
  };

  const handleFileSelected = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    sendAttachment({
      type: pendingAttachmentType.current === 'photo' ? 'image' : 'file',
      file,
      fileName: file.name,
    });
    e.target.value = '';
    setShowAttachments(false);
  };

  return (
    <div className="border-t border-slate-200 bg-white p-4 space-y-3">
      {/* Attachments Menu */}
      {showAttachments && (
        <div className="flex gap-2 pb-2 border-b border-slate-100">
          <button onClick={() => handleAttachmentClick('photo')} className="p-2 hover:bg-slate-100 rounded-lg transition-colors flex-1 text-sm font-semibold text-slate-600">
            📷 Photo
          </button>
          <button onClick={() => handleAttachmentClick('file')} className="p-2 hover:bg-slate-100 rounded-lg transition-colors flex-1 text-sm font-semibold text-slate-600">
            📎 File
          </button>
          <button onClick={() => handleAttachmentClick('location')} className="p-2 hover:bg-slate-100 rounded-lg transition-colors flex-1 text-sm font-semibold text-slate-600">
            📍 Location
          </button>
          <button onClick={() => handleAttachmentClick('contact')} className="p-2 hover:bg-slate-100 rounded-lg transition-colors flex-1 text-sm font-semibold text-slate-600">
            👤 Contact
          </button>
        </div>
      )}
      <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelected} accept={pendingAttachmentType.current === 'photo' ? 'image/*' : undefined} />

      {/* Input Area */}
      <div className="flex items-end gap-3">
        <button
          onClick={() => setShowAttachments(!showAttachments)}
          disabled={disabled}
          className="p-2 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
        >
          <Paperclip size={20} className="text-slate-600" />
        </button>

        <textarea
          ref={textareaRef}
          value={message}
          onChange={handleChange}
          onKeyPress={handleKeyPress}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl resize-none focus:outline-none focus:border-blue-500 transition-colors disabled:opacity-50 bg-slate-50 max-h-30"
        />

        <AudioMessageRecorder
          onSend={onSend}
          disabled={disabled}
        />

        <button
          onClick={() => setShowEmojiPicker(!showEmojiPicker)}
          disabled={disabled}
          className="p-2 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
        >
          <Smile size={20} className="text-slate-600" />
        </button>

        <button
          onClick={handleSend}
          disabled={disabled || !message.trim()}
          className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Send size={20} />
        </button>
      </div>

      {/* Emoji Picker (Simplified) */}
      {showEmojiPicker && (
        <div className="flex flex-wrap gap-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
          {['😀', '😂', '❤️', '👍', '🎉', '👏', '🚀', '✨'].map(emoji => (
            <button
              key={emoji}
              onClick={() => {
                setMessage(message + emoji);
                setShowEmojiPicker(false);
              }}
              className="text-2xl hover:scale-125 transition-transform"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* AI Suggestions */}
      {showAIFeatures && message.length > 0 && (
        <div className="text-xs text-slate-500 flex items-center gap-1">
          💡 AI can help format or optimize this message
        </div>
      )}
    </div>
  );
};

export default {
  AudioMessageRecorder,
  AudioMessagePlayer,
  MessageReactions,
  SmartReplySuggestions,
  RichMessage,
  EnhancedMessageInput,
};
