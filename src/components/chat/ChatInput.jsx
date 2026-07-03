import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Send, Paperclip, Smile, Camera } from 'lucide-react';
import { EMOJI_QUICK } from '../../utils/chatHelpers';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import app from '../../config/firebase';

const storage = getStorage(app);
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_FILE_TYPES = [
  'image/', 'application/pdf', 'text/plain', 'text/csv',
  'application/msword', 'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument',
];

const sanitizeFileName = (name) =>
  String(name || 'attachment').replace(/[^\w.\- ]+/g, '_').replace(/\s+/g, '_').slice(0, 120);

const isAllowedFile = (file) => {
  const type = String(file?.type || '').toLowerCase();
  if (!type) return false;
  return ALLOWED_FILE_TYPES.some(a => type.startsWith(a));
};

const ChatInput = ({ onSend, onTyping, onStopTyping, channelName, currentUser }) => {
  const [text, setText] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const currentUserUid = currentUser?.uid || '';

  // Auto-grow textarea — max 4 lines (~120px)
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [text]);

  const showUploadMessage = useCallback((msg) => {
    setUploadProgress(msg);
    setTimeout(() => setUploadProgress(''), 3000);
  }, []);

  const handleTextChange = useCallback((e) => {
    setText(e.target.value);
    onTyping?.();
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => onStopTyping?.(), 3000);
  }, [onTyping, onStopTyping]);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || uploading) return;
    onSend(trimmed);
    setText('');
    onStopTyping?.();
    setShowEmoji(false);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.focus();
    }
  }, [text, uploading, onSend, onStopTyping]);

  const handleSendPress = useCallback((e) => {
    e.preventDefault();
    handleSend();
  }, [handleSend]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const uploadFile = useCallback(async (file) => {
    if (!file || !currentUserUid) { showUploadMessage('Sign in again before uploading'); return; }
    if (file.size > MAX_UPLOAD_BYTES) { showUploadMessage('File too large (max 10 MB)'); return; }
    if (!isAllowedFile(file)) { showUploadMessage('File type not allowed'); return; }
    setUploading(true);
    setUploadProgress(`Uploading ${file.name}…`);
    let failed = false;
    try {
      const isImage = file.type.startsWith('image/');
      const storagePath = `chat_uploads/${currentUserUid}/${Date.now()}_${sanitizeFileName(file.name)}`;
      const snapshot = await uploadBytes(ref(storage, storagePath), file);
      const url = await getDownloadURL(snapshot.ref);
      onSend(
        isImage ? '' : `Attachment: ${file.name}`,
        { fileUrl: url, fileName: file.name, fileSize: file.size, fileType: isImage ? 'image' : 'file', storagePath }
      );
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
    const f = e.target.files?.[0];
    if (f) uploadFile(f);
    e.target.value = '';
  }, [uploadFile]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) uploadFile(f);
  }, [uploadFile]);

  const handleDragOver = useCallback((e) => { e.preventDefault(); setDragOver(true); }, []);
  const handleDragLeave = useCallback(() => setDragOver(false), []);

  const addEmoji = useCallback((emoji) => {
    setText(prev => prev + emoji);
    setShowEmoji(false);
    textareaRef.current?.focus();
  }, []);

  const canSend = text.trim().length > 0 && !uploading;

  return (
    <div
      className={`agape-chat-input shrink-0 ${dragOver ? 'bg-blue-50' : 'bg-[#f0f2f5]'} transition-colors`}
      style={{ paddingBottom: 'max(10px, env(safe-area-inset-bottom, 10px))' }}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {/* Upload progress banner */}
      {uploadProgress && (
        <div className="mx-3 mb-2 px-3 py-2 bg-blue-50 rounded-xl border border-blue-100 flex items-center gap-2">
          {uploading && (
            <div className="w-4 h-4 rounded-full border-2 border-blue-600 border-t-transparent animate-spin shrink-0" />
          )}
          <span className="text-[12px] text-blue-700 font-medium">{uploadProgress}</span>
        </div>
      )}

      {/* Emoji picker */}
      {showEmoji && (
        <div className="mx-3 mb-2 p-2.5 bg-white rounded-2xl border border-slate-200 shadow-lg">
          <div className="flex flex-wrap gap-1">
            {EMOJI_QUICK.map(emoji => (
              <button
                key={emoji}
                onClick={() => addEmoji(emoji)}
                className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-slate-100 active:scale-90 text-2xl transition-all"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Composer row */}
      <div className="flex items-end gap-2 px-3 py-2.5">
        {/* Attachment */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-white hover:shadow-sm active:scale-90 disabled:opacity-40 transition-all"
          title="Attach file"
        >
          <Paperclip size={21} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileSelect}
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
          className="hidden"
        />

        {/* Pill-shaped input field */}
        <div className={`flex-1 min-w-0 flex items-end rounded-[24px] bg-white shadow-sm border transition-all duration-200 ${dragOver ? 'border-blue-300 bg-blue-50' : 'border-slate-200 focus-within:border-blue-300 focus-within:shadow-md'}`}>
          {/* Emoji toggle inside pill */}
          <button
            type="button"
            onClick={() => setShowEmoji(!showEmoji)}
            className={`flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full ml-0.5 transition-colors ${showEmoji ? 'text-amber-500' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <Smile size={20} />
          </button>

          {/* Auto-growing textarea */}
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            placeholder={`Message ${channelName || ''}…`}
            rows={1}
            className="flex-1 min-w-0 bg-transparent outline-none resize-none text-[15px] text-slate-800 placeholder:text-slate-400 py-[10px] pr-2 leading-[1.45] overflow-y-auto"
            style={{ fontFamily: 'inherit', maxHeight: 120 }}
          />
        </div>

        {/* Send / Camera button */}
        {canSend ? (
          <button
            type="button"
            onPointerDown={handleSendPress}
            className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-blue-500 text-white shadow-md shadow-blue-500/40 hover:bg-blue-600 active:scale-90 transition-all"
          >
            <Send size={18} className="ml-0.5 mt-0.5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-white hover:shadow-sm active:scale-90 disabled:opacity-40 transition-all"
            title="Add photo"
          >
            <Camera size={21} />
          </button>
        )}
      </div>
    </div>
  );
};

export default ChatInput;
