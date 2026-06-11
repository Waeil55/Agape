import React, { useState } from 'react';
import { Smartphone, X } from 'lucide-react';
import { normalizePhone } from '../../utils/chatUtils';

export default function NewSmsModal({
  currentUserEmail,
  onClose,
  onCreate,
}) {
  const [clientName, setClientName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const cleanPhone = normalizePhone(phone);

  const submit = async (event) => {
    event.preventDefault();
    if (cleanPhone.length < 10 || saving) return;
    setSaving(true);
    try {
      await onCreate({
        participants: [currentUserEmail],
        name: clientName || phone,
        clientName,
        phone: cleanPhone,
        isClient: true,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] bg-slate-950/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <form onSubmit={submit} className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden">
        <div className="h-16 px-4 border-b border-slate-200 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center">
            <Smartphone size={20} />
          </div>
          <div>
            <h2 className="text-base font-black text-slate-950">New client chat</h2>
            <p className="text-xs font-bold text-slate-500">Create an SMS-style thread</p>
          </div>
          <button type="button" onClick={onClose} className="ml-auto w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <label className="block">
            <span className="text-xs font-black text-slate-500 uppercase tracking-wider">Client name</span>
            <input
              value={clientName}
              onChange={(event) => setClientName(event.target.value)}
              placeholder="Optional"
              className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold outline-none focus:bg-white"
            />
          </label>
          <label className="block">
            <span className="text-xs font-black text-slate-500 uppercase tracking-wider">Phone number</span>
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              inputMode="tel"
              placeholder="(555) 123-4567"
              className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold outline-none focus:bg-white"
            />
          </label>
        </div>

        <div className="p-4 border-t border-slate-200 pb-[calc(16px+env(safe-area-inset-bottom,0px))]">
          <button
            type="submit"
            disabled={cleanPhone.length < 10 || saving}
            className="h-12 w-full rounded-xl bg-emerald-600 disabled:bg-slate-300 text-white text-sm font-black"
          >
            {saving ? 'Creating...' : 'Create Client Thread'}
          </button>
        </div>
      </form>
    </div>
  );
}
