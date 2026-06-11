import React, { useMemo, useState } from 'react';
import { Check, Search, Users, X } from 'lucide-react';
import { avatarColor, getInitials, normalizeEmail, readableName } from '../../utils/chatUtils';

export default function NewChatModal({
  contacts = [],
  currentUserEmail,
  onClose,
  onCreate,
}) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState([]);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const current = normalizeEmail(currentUserEmail);

  const visibleContacts = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return contacts
      .filter(contact => normalizeEmail(contact.email) !== current)
      .filter(contact => {
        if (!needle) return true;
        return String(contact.name || '').toLowerCase().includes(needle)
          || String(contact.email || '').toLowerCase().includes(needle)
          || String(contact.role || '').toLowerCase().includes(needle);
      })
      .slice(0, 80);
  }, [contacts, current, query]);

  const toggle = (email) => {
    const normalized = normalizeEmail(email);
    setSelected(prev => prev.includes(normalized) ? prev.filter(item => item !== normalized) : [...prev, normalized]);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (selected.length === 0 || saving) return;
    setSaving(true);
    try {
      await onCreate({
        participants: selected,
        name,
        isClient: false,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] bg-slate-950/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <form onSubmit={submit} className="w-full sm:max-w-lg max-h-[88dvh] bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div className="h-16 px-4 border-b border-slate-200 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center">
            <Users size={20} />
          </div>
          <div>
            <h2 className="text-base font-black text-slate-950">New team chat</h2>
            <p className="text-xs font-bold text-slate-500">{selected.length} selected</p>
          </div>
          <button type="button" onClick={onClose} className="ml-auto w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 border-b border-slate-100 space-y-3">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Group name (optional)"
            className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold outline-none focus:bg-white"
          />
          <label className="h-11 rounded-xl bg-slate-100 border border-slate-200 flex items-center gap-2 px-3">
            <Search size={17} className="text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search staff"
              className="w-full bg-transparent border-0 outline-none text-sm font-semibold"
            />
          </label>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-2">
          {visibleContacts.map(contact => {
            const email = normalizeEmail(contact.email);
            const checked = selected.includes(email);
            const nameLabel = contact.name || readableName(email);
            return (
              <button
                key={email}
                type="button"
                onClick={() => toggle(email)}
                className={`w-full rounded-xl px-3 py-2.5 flex items-center gap-3 text-left border ${checked ? 'bg-blue-50 border-blue-200' : 'border-transparent hover:bg-slate-50'}`}
              >
                <div className={`w-10 h-10 rounded-full ${avatarColor(email)} text-white flex items-center justify-center text-xs font-black`}>
                  {getInitials(nameLabel)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-black text-slate-900">{nameLabel}</p>
                  <p className="truncate text-xs font-bold text-slate-500">{email}</p>
                </div>
                <span className={`w-6 h-6 rounded-full border flex items-center justify-center ${checked ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300'}`}>
                  {checked && <Check size={14} />}
                </span>
              </button>
            );
          })}
        </div>

        <div className="p-4 border-t border-slate-200 pb-[calc(16px+env(safe-area-inset-bottom,0px))]">
          <button
            type="submit"
            disabled={selected.length === 0 || saving}
            className="h-12 w-full rounded-xl bg-blue-600 disabled:bg-slate-300 text-white text-sm font-black"
          >
            {saving ? 'Creating...' : 'Create Conversation'}
          </button>
        </div>
      </form>
    </div>
  );
}
