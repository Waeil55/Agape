import React from 'react';
import { ShieldCheck, Smartphone, Trash2, UserRound, X } from 'lucide-react';
import { avatarColor, formatPhoneNumber, getInitials, normalizeEmail, readableName } from '../../utils/chatUtils';

function PresenceDot({ presence }) {
  const state = presence?.state || 'away';
  const color = state === 'online' ? 'bg-emerald-500' : state === 'offline' ? 'bg-slate-300' : 'bg-amber-400';
  return <span className={`w-2.5 h-2.5 rounded-full ${color} ring-2 ring-white`} />;
}

export default function InfoPanel({
  conversation,
  title,
  subtitle,
  contactsByEmail,
  currentUserEmail,
  presenceByEmail = {},
  onClose,
  onDelete,
  canDelete,
}) {
  if (!conversation) return null;
  const participants = (conversation.participants || []).map(email => {
    const normalized = normalizeEmail(email);
    return {
      email: normalized,
      ...(contactsByEmail.get(normalized) || {}),
      name: contactsByEmail.get(normalized)?.name || readableName(normalized),
      role: contactsByEmail.get(normalized)?.role || (normalized === normalizeEmail(currentUserEmail) ? 'you' : 'team'),
    };
  });

  return (
    <aside className="h-full min-h-0 w-full flex flex-col bg-white">
      <div className="h-[64px] shrink-0 border-b border-slate-200 px-4 flex items-center gap-3">
        <div>
          <h2 className="text-base font-black text-slate-950">Details</h2>
          <p className="text-xs font-bold text-slate-500">Conversation profile</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          title="Close details"
          className="ml-auto w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center"
        >
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        <div className="text-center border-b border-slate-100 pb-5">
          <div className={`mx-auto w-16 h-16 rounded-2xl ${conversation.isClient ? 'bg-emerald-600' : avatarColor(title)} text-white flex items-center justify-center font-black text-lg shadow-lg`}>
            {conversation.isClient ? <Smartphone size={26} /> : getInitials(title)}
          </div>
          <h3 className="mt-3 text-lg font-black text-slate-950">{title}</h3>
          <p className="mt-1 text-sm font-bold text-slate-500">{subtitle}</p>
          {conversation.isClient && (
            <p className="mt-2 inline-flex items-center justify-center h-8 px-3 rounded-full bg-emerald-50 text-emerald-700 text-xs font-black border border-emerald-100">
              {formatPhoneNumber(conversation.phone)}
            </p>
          )}
        </div>

        <section className="py-5 border-b border-slate-100">
          <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider">Participants</h4>
          <div className="mt-3 space-y-2">
            {participants.map(person => (
              <div key={person.email} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
                <div className={`relative w-10 h-10 rounded-full ${avatarColor(person.email)} text-white flex items-center justify-center font-black text-xs`}>
                  {getInitials(person.name)}
                  <span className="absolute -right-0.5 -bottom-0.5"><PresenceDot presence={presenceByEmail[person.email]} /></span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-black text-slate-900">{person.name}</p>
                  <p className="truncate text-xs font-bold text-slate-500">{person.email}</p>
                </div>
                <span className="shrink-0 rounded-full bg-white border border-slate-200 px-2 py-1 text-[10px] font-black uppercase text-slate-500">
                  {person.role}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="py-5">
          <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider">Controls</h4>
          <div className="mt-3 grid gap-2">
            <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-3 flex gap-3 text-blue-800">
              <ShieldCheck size={18} className="shrink-0 mt-0.5" />
              <p className="text-xs font-bold leading-relaxed">Messages sync in real time and are visible to conversation participants.</p>
            </div>
            {canDelete && (
              <button
                type="button"
                onClick={() => onDelete(conversation.id)}
                className="h-11 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-sm font-black inline-flex items-center justify-center gap-2"
              >
                <Trash2 size={16} /> Delete Conversation
              </button>
            )}
          </div>
        </section>
      </div>
    </aside>
  );
}
