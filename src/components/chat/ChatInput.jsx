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
    inputRef.current?.focus();
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

  return (
    <div
      className={`agape-chat-input border-t border-slate-100 shrink-0 ${dragOver ? 'bg-blue-50 border-blue-300' : 'bg-white'}`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {uploadProgress && (
        <div className="px-3 py-1.5 bg-blue-50 border-b border-blue-100 flex items-center gap-2">
          {uploading && <div className="w-4 h-4 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />}
          <span className="text-[11px] text-blue-700 font-medium">{uploadProgress}</span>
        </div>
      )}

      {dragOver && (
        <div className="px-3 py-2 bg-blue-50 border-b border-blue-200 text-center">
          <p className="text-xs text-blue-600 font-semibold">Drop file to upload</p>
        </div>
      )}

      {showEmoji && (
        <div className="px-3 py-2 border-b border-slate-100 bg-slate-50">
          <div className="flex flex-wrap gap-1">
            {EMOJI_QUICK.map(emoji => (
              <button
                key={emoji}
                onClick={() => addEmoji(emoji)}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white text-lg transition-colors"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-end gap-2 px-3 py-2">
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
          title="Attach file"
        >
          <Paperclip size={18} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileSelect}
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
          className="hidden"
        />

        <div className="flex-1 min-w-0">
          <textarea
            ref={inputRef}
            value={text}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            placeholder={`Message ${channelName}...`}
            rows={1}
            className="w-full resize-none rounded-[22px] border border-slate-200 bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-800 placeholder:text-slate-400 outline-none focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100 transition-all max-h-[112px]"
            style={{ minHeight: '38px' }}
            onInput={(e) => {
              e.target.style.height = '38px';
              e.target.style.height = Math.min(e.target.scrollHeight, 112) + 'px';
            }}
          />
        </div>

        <button
          onClick={() => setShowEmoji(!showEmoji)}
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors ${showEmoji ? 'bg-amber-50 text-amber-500' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'}`}
          title="Emoji"
        >
          <Smile size={18} />
        </button>

        <button
          onClick={handleSend}
          disabled={!text.trim() || uploading}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
          title="Send"
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  );
};

export default ChatInput;
