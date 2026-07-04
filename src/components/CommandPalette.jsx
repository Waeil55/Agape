import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Navigation, User, Settings, Map, Activity } from 'lucide-react';

export default function CommandPalette({ isOpen, onClose, navigateTo }) {
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        isOpen ? onClose() : onClose(true);
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    let id;
    if (isOpen) {
      id = setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setQuery('');
    }
    return () => { if (id) clearTimeout(id); };
  }, [isOpen]);

  if (!isOpen) return null;

  const commands = [
    { id: 'dashboard', label: 'Go to Enterprise Dashboard', icon: <Activity size={16} />, action: () => navigateTo('admin') },
    { id: 'driver', label: 'Go to Driver Mode', icon: <Navigation size={16} />, action: () => navigateTo('driver') },
    { id: 'map', label: 'Open Live Map', icon: <Map size={16} />, action: () => navigateTo('live-map') },
    { id: 'settings', label: 'Open Settings', icon: <Settings size={16} />, action: () => navigateTo('settings') },
    { id: 'users', label: 'Manage Users', icon: <User size={16} />, action: () => navigateTo('users') },
  ];

  const filtered = commands.filter(c => c.label.toLowerCase().includes(query.toLowerCase()));

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[9999] flex items-start justify-center pt-[15vh]">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
          onClick={onClose}
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: -20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -20 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200"
        >
          <div className="flex items-center px-4 py-4 border-b border-slate-100">
            <Search className="text-slate-400 mr-3" size={20} />
            <input
              ref={inputRef}
              type="text"
              placeholder="What do you want to do? (Assign trips, navigate, search...)"
              className="w-full bg-transparent border-none outline-none text-slate-800 text-lg placeholder:text-slate-400 font-medium"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="flex items-center gap-1 shrink-0 ml-3 bg-slate-100 rounded px-2 py-1">
              <span className="text-[10px] font-bold text-slate-500">ESC</span>
            </div>
          </div>

          <div className="max-h-[400px] overflow-y-auto p-2">
            {filtered.length > 0 ? (
              <div className="space-y-1">
                <p className="px-3 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider">Suggested Actions</p>
                {filtered.map(cmd => (
                  <button
                    key={cmd.id}
                    onClick={() => { cmd.action(); onClose(); }}
                    className="w-full flex items-center gap-3 px-3 py-3 hover:bg-blue-50 rounded-xl text-left transition-colors group cursor-pointer"
                  >
                    <div className="w-8 h-8 rounded-lg bg-slate-100 group-hover:bg-blue-100 group-hover:text-blue-600 text-slate-500 flex items-center justify-center transition-colors">
                      {cmd.icon}
                    </div>
                    <span className="text-sm font-semibold text-slate-700 group-hover:text-blue-700">{cmd.label}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="px-4 py-12 text-center">
                <p className="text-slate-500 font-medium">No actions found for "{query}"</p>
                <p className="text-sm text-slate-400 mt-1">Try searching for settings, map, or driver mode.</p>
              </div>
            )}
          </div>

          <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-500 font-medium">Agape AI Engine Active</span>
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
            </div>
            <div className="flex items-center gap-3 text-[10px] font-bold text-slate-400">
              <span className="flex items-center gap-1"><kbd className="bg-white border border-slate-200 px-1.5 rounded">↑</kbd> <kbd className="bg-white border border-slate-200 px-1.5 rounded">↓</kbd> to navigate</span>
              <span className="flex items-center gap-1"><kbd className="bg-white border border-slate-200 px-1.5 rounded">↵</kbd> to select</span>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
