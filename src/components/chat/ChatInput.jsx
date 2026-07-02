import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Send, Paperclip, Smile, Camera } from 'lucide-react';
import { EMOJI_QUICK } from '../../utils/chatHelpers';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import app from '../../config/firebase';

const storage = getStorage(app);
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_FILE_TYPES = ['image/','application/pdf','text/plain','text/csv','application/msword','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument'];

const sanitizeFileName = (name) => String(name || 'attachment').replace(/[^\w.\- ]+/g, '_').replace(/\s+/g, '_').slice(0, 120);
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
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const currentUserUid = currentUser?.uid || '';

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.width = '100%';
      inputRef.current.style.flex = '1';
    }
  }, [text]);

  const showUploadMessage = useCallback((msg) => { setUploadProgress(msg); setTimeout(() => setUploadProgress(''), 3000); }, []);

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
    setShowEmoji(false);
    inputRef.current?.focus();
  }, [text, uploading, onSend, onStopTyping]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
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
      onSend(isImage ? '' : `Attachment: ${file.name}`, { fileUrl: url, fileName: file.name, fileSize: file.size, fileType: isImage ? 'image' : 'file', storagePath });
    } catch (err) { failed = true; console.error('[Chat] upload error:', err); showUploadMessage('Upload failed'); }
    finally { setUploading(false); if (!failed) setUploadProgress(''); }
  }, [currentUserUid, onSend, showUploadMessage]);

  const handleFileSelect = useCallback((e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = ''; }, [uploadFile]);
  const handleDrop = useCallback((e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) uploadFile(f); }, [uploadFile]);
  const handleDragOver = useCallback((e) => { e.preventDefault(); setDragOver(true); }, []);
  const handleDragLeave = useCallback(() => setDragOver(false), []);
  const addEmoji = useCallback((emoji) => { setText(prev => prev + emoji); inputRef.current?.focus(); }, []);

  return (
    <div
      className={`agape-chat-input shrink-0 w-full bg-white border-t border-slate-200/80 ${dragOver ? 'bg-blue-50' : ''}`}
      onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave}
    >
      {uploadProgress && (
        <div className="px-4 py-2 bg-blue-50 border-b border-blue-100 flex items-center gap-2">
          {uploading && <div className="w-4 h-4 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />}
          <span className="text-[11px] text-blue-700 font-medium">{uploadProgress}</span>
        </div>
      )}

      {showEmoji && (
        <div className="px-3 py-2 border-b border-slate-100 bg-slate-50">
          <div className="flex flex-wrap gap-0.5">
            {EMOJI_QUICK.map(emoji => (
              <button key={emoji} onClick={() => addEmoji(emoji)}
                className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-white text-2xl transition-colors">
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 px-2 py-2"
           style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}>
        <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
          className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 active:bg-slate-200 disabled:opacity-50 transition-colors">
          <Paperclip size={22} />
        </button>
        <input ref={fileInputRef} type="file" onChange={handleFileSelect}
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt" className="hidden" />

        <div className="flex-1 min-w-0 flex items-center bg-slate-100 rounded-[22px] border border-transparent focus-within:border-slate-300 focus-within:bg-white transition-all">
          <button onClick={() => setShowEmoji(!showEmoji)}
            className={`flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full ml-0.5 transition-colors ${showEmoji ? 'text-amber-500' : 'text-slate-400 hover:text-slate-600'}`}>
            <Smile size={20} />
          </button>
          <textarea ref={inputRef} value={text} onChange={handleTextChange} onKeyDown={handleKeyDown}
            placeholder={`Message ${channelName}...`} rows={1}
            style={{ minHeight: '38px', flex: '1 1 0%', minWidth: 0, width: '100%', display: 'block', border: 'none', outline: 'none', background: 'transparent', resize: 'none', padding: '8px 12px 8px 0', fontSize: '15px', lineHeight: '1.4', color: '#1e293b', fontFamily: 'inherit', overflow: 'hidden' }} />
        </div>

        {text.trim() ? (
          <button onClick={handleSend} disabled={uploading}
            className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-blue-500 text-white shadow-sm shadow-blue-500/30 active:scale-95 transition-all disabled:opacity-40">
            <Send size={18} className="ml-0.5" />
          </button>
        ) : (
          <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
            className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 active:bg-slate-200 transition-colors">
            <Camera size={22} />
          </button>
        )}
      </div>
    </div>
  );
};

export default ChatInput;
