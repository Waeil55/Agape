import React, { useState, useRef, useCallback } from 'react';
import { Send, Paperclip, Smile } from 'lucide-react';
import { EMOJI_QUICK } from '../../utils/chatHelpers';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import app from '../../config/firebase';

const storage = getStorage(app);
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_FILE_TYPES = [
  'image/',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument',
];

const sanitizeFileName = (name) => String(name || 'attachment')
  .replace(/[^\w.\- ]+/g, '_')
  .replace(/\s+/g, '_')
  .slice(0, 120);

const isAllowedFile = (file) => {
  const type = String(file?.type || '').toLowerCase();
  if (!type) return false;
  return ALLOWED_FILE_TYPES.some(allowed => type.startsWith(allowed));
};

const ChatInput = ({ onSend, onTyping, onStopTyping, channelName, currentUser }) => {
  const [text, setText] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const currentUserUid = currentUser?.uid || '';

  const showUploadMessage = useCallback((message) => {
    setUploadProgress(message);
    setTimeout(() => setUploadProgress(''), 3000);
  }, []);

  const handleTextChange = useCallback((e) => {
    setText(e.target.value);
    onTyping();
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => onStopTyping(), 3000);
  }, [onTyping, onStopTyping]);

  const handleSend = useCallback(() => {
    if (!text.trim() || uploading) return;
    onSend(text);
    setText('');
    onStopTyping();
    requestAnimationFrame(() => {
      if (inputRef.current) inputRef.current.style.height = '44px';
      inputRef.current?.focus();
    });
  }, [text, uploading, onSend, onStopTyping]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const uploadFile = useCallback(async (file) => {
    if (!file) return;
    if (!currentUserUid) {
      showUploadMessage('Sign in again before uploading files');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      showUploadMessage('File is too large. Maximum size is 10 MB.');
      return;
    }
    if (!isAllowedFile(file)) {
      showUploadMessage('This file type is not allowed');
      return;
    }

    setUploading(true);
    setUploadProgress(`Uploading ${file.name}...`);
    let failed = false;
    try {
      const isImage = file.type.startsWith('image/');
      const safeName = sanitizeFileName(file.name);
      const storagePath = `chat_uploads/${currentUserUid}/${Date.now()}_${safeName}`;
      const storageRef = ref(storage, storagePath);
      const snapshot = await uploadBytes(storageRef, file);
      const url = await getDownloadURL(snapshot.ref);

      onSend(isImage ? '' : `Attachment: ${file.name}`, {
        fileUrl: url,
        fileName: file.name,
        fileSize: file.size,
        fileType: isImage ? 'image' : 'file',
        storagePath,
      });
    } catch (err) {
      failed = true;
      console.error('[Chat] upload error:', err);
      showUploadMessage('Upload failed');
    } finally {
      setUploading(false);
      if (!failed) setUploadProgress('');
    }
  }, [currentUserUid, onSend, showUploadMessage]);

  const handleFileSelect = useCallback((e) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    e.target.value = '';
  }, [uploadFile]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  }, [uploadFile]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => setDragOver(false), []);

  const addEmoji = useCallback((emoji) => {
    setText(prev => prev + emoji);
    inputRef.current?.focus();
    setShowEmoji(false);
  }, []);

  const resizeInput = useCallback((target) => {
    target.style.height = '44px';
    target.style.height = `${Math.min(target.scrollHeight, 112)}px`;
  }, []);

  return (
    <div
      className={`agape-chat-input shrink-0 border-t border-slate-200/80 ${dragOver ? 'bg-blue-50 border-blue-300' : 'bg-white/95'}`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {uploadProgress && (
        <div className="mx-3 mt-2 rounded-2xl bg-blue-50 border border-blue-100 px-3 py-2 flex items-center gap-2">
          {uploading && <div className="w-4 h-4 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />}
          <span className="text-[11px] text-blue-700 font-medium">{uploadProgress}</span>
        </div>
      )}

      {dragOver && (
        <div className="mx-3 mt-2 rounded-2xl bg-blue-50 border border-blue-200 px-4 py-2 text-center">
          <p className="text-xs text-blue-600 font-semibold">Drop file to upload</p>
        </div>
      )}

      {showEmoji && (
        <div className="mx-3 mt-2 rounded-3xl border border-slate-200 bg-white p-2 shadow-sm">
          <div className="flex flex-wrap gap-1">
            {EMOJI_QUICK.map(emoji => (
              <button
                key={emoji}
                onClick={() => addEmoji(emoji)}
                className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-slate-100 text-xl transition-colors"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      <div
        className="agape-chat-composer-row flex items-end gap-2 px-3 py-2.5"
      >
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="agape-chat-icon-button flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-700 active:bg-slate-200 disabled:opacity-50 transition-colors"
          title="Attach file"
          aria-label="Attach file"
        >
          <Paperclip size={20} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileSelect}
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
          className="hidden"
        />

        <div className="flex-1 min-w-0 relative">
          <div className="agape-chat-composer-pill flex items-end bg-slate-100 rounded-[26px] border border-slate-200 focus-within:border-blue-300 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-100 transition-all">
            <textarea
              ref={inputRef}
              value={text}
              onChange={handleTextChange}
              onKeyDown={handleKeyDown}
              placeholder={`Message ${channelName}...`}
              rows={1}
              className="agape-chat-textarea flex-1 min-h-[44px] max-h-[112px] bg-transparent px-4 py-[11px] text-[15px] font-medium text-slate-800 placeholder:text-slate-400 outline-none resize-none leading-snug"
              style={{ minHeight: '44px' }}
              onInput={(e) => resizeInput(e.target)}
            />
            <button
              onClick={() => setShowEmoji(!showEmoji)}
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full mr-1 mb-0.5 transition-colors ${showEmoji ? 'bg-amber-100 text-amber-500' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/60'}`}
              title="Emoji"
              aria-label="Emoji"
            >
              <Smile size={19} />
            </button>
          </div>
        </div>

        <button
          onClick={handleSend}
          disabled={!text.trim() || uploading}
          className="agape-chat-send-button flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white shadow-md shadow-blue-600/20 transition-all hover:bg-blue-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
          title="Send"
          aria-label="Send message"
        >
          <Send size={18} className="ml-0.5" />
        </button>
      </div>
    </div>
  );
};

export default ChatInput;
