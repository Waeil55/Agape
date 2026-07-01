import React, { useState, useEffect } from 'react';
import { X, Search, Users, Phone, Loader2, Check } from 'lucide-react';

export default function NewConversationModal({ open, onClose, drivers, dispatchers, uid, onCreate, onSmsCreate }) {
  const [tab, setTab] = useState('team');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [clientName, setClientName] = useState('');

  useEffect(() => {
    if (open) {
      setSearch('');
      setSelected([]);
      setName('');
      setPhone('');
      setClientName('');
      setTab('team');
    }
  }, [open]);

  if (!open) return null;

  const allPeople = [
    ...(drivers || []).map(d => ({ id: d.id, name: d.name || 'Driver', email: d.email || '', role: 'driver' })),
    ...(dispatchers || []).map(d => ({ id: d.id, name: d.name || 'Dispatcher', email: d.email || '', role: 'dispatcher' })),
  ].filter(p => p.id);

  const filtered = allPeople.filter(p => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (p.name || '').toLowerCase().includes(s) || (p.email || '').toLowerCase().includes(s);
  });

  const toggle = (id) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleCreate = async () => {
    if (tab === 'team') {
      if (selected.length === 0) return;
      setLoading(true);
      await onCreate(selected, name || 'Team Chat', true);
      setLoading(false);
      onClose();
    } else {
      if (!phone.trim()) return;
      setLoading(true);
      await onSmsCreate(phone, name || clientName || phone, clientName);
      setLoading(false);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden" style={{ animation: 'slideInFromBottom 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>

        <div className="flex items-center justify-between px-5 pb-3 pt-2 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">New Conversation</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 text-gray-400">
            <X size={20} />
          </button>
        </div>

        <div className="flex border-b border-gray-100 px-5">
          {[
            { key: 'team', label: 'Team Chat', icon: Users },
            { key: 'sms', label: 'SMS', icon: Phone },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold border-b-2 transition-all min-h-[44px] ${
                tab === t.key
                  ? 'border-[#2b4c7e] text-[#2b4c7e]'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              <t.icon size={14} />
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-5 max-h-[60vh] overflow-y-auto">
          {tab === 'team' ? (
            <>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Group name (optional)"
                className="w-full h-11 px-4 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#2b4c7e] mb-3"
              />
              <div className="relative mb-3">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search people..."
                  className="w-full h-10 pl-9 pr-4 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#2b4c7e]"
                />
              </div>
              <div className="space-y-1">
                {filtered.map(p => {
                  const isSelected = selected.includes(p.id);
                  const initials = p.name.split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase();
                  return (
                    <button
                      key={p.id}
                      onClick={() => toggle(p.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all min-h-[48px] ${
                        isSelected ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50 border border-transparent'
                      }`}
                    >
                      <div className="w-9 h-9 rounded-full bg-[#2b4c7e] flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                        {initials}
                      </div>
                      <div className="flex-1 text-left min-w-0">
                        <span className="text-sm font-medium text-gray-800 block truncate">{p.name}</span>
                        {p.email && <span className="text-[10px] text-gray-400 block truncate">{p.email}</span>}
                      </div>
                      {isSelected && <Check size={16} className="text-[#2b4c7e] shrink-0" />}
                    </button>
                  );
                })}
                {filtered.length === 0 && (
                  <p className="text-center text-xs text-gray-400 py-4">No people found</p>
                )}
              </div>
            </>
          ) : (
            <>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name (optional)"
                className="w-full h-11 px-4 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#2b4c7e] mb-3"
              />
              <input
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Client name (optional)"
                className="w-full h-11 px-4 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#2b4c7e] mb-3"
              />
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-medium">+1</span>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder="(555) 123-4567"
                  type="tel"
                  className="w-full h-11 pl-10 pr-4 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#2b4c7e] font-medium tracking-wider"
                />
              </div>
            </>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 bg-gray-50/50" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
          <button
            onClick={handleCreate}
            disabled={loading || (tab === 'team' ? selected.length === 0 : !phone.trim())}
            className="w-full h-12 rounded-xl bg-[#2b4c7e] text-white text-sm font-bold flex items-center justify-center gap-2 shadow-md active:scale-[0.98] transition-all disabled:opacity-40 min-h-[48px]"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : 'Start Conversation'}
          </button>
        </div>
      </div>
    </div>
  );
}
