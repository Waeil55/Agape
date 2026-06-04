import React, { useState, useRef, useEffect } from 'react';
import { Bot, X, Send, Loader2, Sparkles } from 'lucide-react';
import { GEMINI_API_CONFIG } from '../config/firebase';

const AIAssistantFloating = () => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);
  const endRef = useRef(null);

  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const ask = async () => {
    if (!query.trim()) return;
    const userMsg = query.trim();
    setQuery('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setLoading(true);
    try {
      const { apiKey } = GEMINI_API_CONFIG();
      if (!apiKey) {
        setMessages(prev => [...prev, { role: 'assistant', text: 'AI is not configured yet. Add the Gemini API key in the app environment and redeploy.' }]);
        setLoading(false);
        return;
      }

      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `You are an expert NEMT fleet operations AI assistant. Answer concisely and helpfully.

User: ${userMsg}

Answer in 2-3 sentences maximum. Be specific and actionable.` }] }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 512 },
          }),
        }
      );
      const data = await resp.json();
      const answer = data?.candidates?.[0]?.content?.parts?.[0]?.text || 'I could not process that request.';
      setMessages(prev => [...prev, { role: 'assistant', text: answer }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', text: 'Service temporarily unavailable.' }]);
    }
    setLoading(false);
  };

  return (
    <>
      {open && (
        <div className="fixed bottom-20 right-5 z-[9999] w-80 h-96 bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in slide-in-from-bottom-4">
          <div className="flex items-center justify-between px-3 py-2.5 bg-gradient-to-r from-indigo-600 to-blue-600 text-white">
            <div className="flex items-center gap-2">
              <Bot size={16} />
              <span className="text-xs font-bold">AI Assistant</span>
            </div>
            <button onClick={() => setOpen(false)} className="p-0.5 rounded hover:bg-white/20"><X size={14} /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-slate-50">
            {messages.length === 0 && (
              <div className="text-center py-8 text-slate-400">
                <Sparkles size={24} className="mx-auto mb-2 text-indigo-300" />
                <p className="text-xs font-medium">Ask me anything about operations</p>
                <p className="text-[10px] mt-1">e.g. "How many unassigned trips?"</p>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] px-2.5 py-1.5 rounded-xl text-xs leading-relaxed ${
                  m.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-700'
                }`}>
                  {m.text}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 flex items-center gap-2">
                  <Loader2 size={12} className="animate-spin text-indigo-600" />
                  <span className="text-[10px] text-slate-500">Thinking...</span>
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>
          <div className="p-2 border-t border-slate-200 bg-white">
            <div className="flex gap-1.5">
              <input ref={inputRef} type="text" value={query} onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !loading && ask()}
                placeholder="Ask anything..." className="flex-1 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:border-indigo-400 bg-slate-50" />
              <button onClick={ask} disabled={!query.trim() || loading}
                className="p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40">
                <Send size={14} />
              </button>
            </div>
          </div>
        </div>
      )}
      <button onClick={() => setOpen(v => !v)}
        className="fixed bottom-5 right-5 z-[9999] w-12 h-12 bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-full shadow-xl hover:shadow-2xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center">
        {open ? <X size={20} /> : <Bot size={22} />}
      </button>
    </>
  );
};

export default AIAssistantFloating;
