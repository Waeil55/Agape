import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Send, Paperclip, Smile } from 'lucide-react';
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

  const resizeTextarea = useCallback((el) => {
    if (!el) return;
    el.style.height = '44px';
    el.style.height = `${Math.min(el.scrollHeight, 112)}px`;
  }, []);

  useEffect(() => {
    resizeTextarea(textareaRef.current);
  }, [text, resizeTextarea]);

  const showUploadMessage = useCallback((msg) => {
    setUploadProgress(msg);
    setTimeout(() => setUploadProgress(''), 3000);
  }, []);

  const handleTextChange = useCallback((e) => {
    setText(e.target.value);
    resizeTextarea(e.target);
    onTyping?.();
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => onStopTyping?.(), 3000);
  }, [onTyping, onStopTyping, resizeTextarea]);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || uploading) return;
    onSend(trimmed);
    setText('');
    setShowEmoji(false);
    onStopTyping?.();
    requestAnimationFrame(() => {
      resizeTextarea(textareaRef.current);
      textareaRef.current?.focus();
    });
  }, [text, uploading, onSend, onStopTyping, resizeTextarea]);

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
    setUploadProgress(`Uploading ${file.name}...`);
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
      className={`agape-chat-input shrink-0 border-t border-slate-200/80 ${dragOver ? 'bg-blue-50 border-blue-300' : 'bg-white/95'}`}
      style={{ paddingBottom: 'max(10px, env(safe-area-inset-bottom, 10px))' }}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {uploadProgress && (
        <div className="mx-3 mt-2 rounded-xl bg-blue-50 border border-blue-100 px-3 py-2 flex items-center gap-2">
          {uploading && <div className="w-4 h-4 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />}
          <span className="text-[11px] text-blue-700 font-medium">{uploadProgress}</span>
        </div>
      )}

      {dragOver && (
        <div className="mx-3 mt-2 rounded-xl bg-blue-50 border border-blue-200 px-4 py-2 text-center">
          <p className="text-xs text-blue-600 font-semibold">Drop file to upload</p>
        </div>
      )}

      {showEmoji && (
        <div className="mx-3 mt-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
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

      <div className="agape-chat-composer-row flex items-end gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="agape-chat-icon-button flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-700 active:bg-slate-200 disabled:opacity-50 transition-colors"
          title="Attach file"
          aria-label="Attach file"
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

        <div className="flex-1 min-w-0 relative">
          <div className="agape-chat-composer-pill flex items-end bg-slate-100 rounded-[26px] border border-slate-200 focus-within:border-blue-300 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-100 transition-all">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={handleTextChange}
              onKeyDown={handleKeyDown}
              placeholder={`Message ${channelName || ''}...`}
              rows={1}
              className="agape-chat-textarea flex-1 min-h-[44px] max-h-[112px] bg-transparent px-4 py-[11px] text-[15px] font-medium text-slate-800 placeholder:text-slate-400 outline-none resize-none leading-snug overflow-y-auto"
              style={{ minHeight: '44px' }}
            />
            <button
              type="button"
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
          type="button"
          onClick={handleSend}
          disabled={!canSend}
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
