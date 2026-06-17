export default function AgapeCareChat() {
  return (
    <section className="relative flex h-full min-h-0 w-full overflow-hidden bg-slate-100 text-slate-950">
      <aside className="flex w-full shrink-0 flex-col border-r border-slate-200 bg-white md:flex md:w-[300px]">
        <div className="border-b border-slate-200 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl text-white shadow-lg" style={{ backgroundColor: '#0099cc' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-lg font-black text-slate-950">Agape Care Chat</h1>
              </div>
              <p className="text-xs font-bold text-slate-500">NEMT Pro Command Center</p>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-black text-slate-800">Driver Name</p>
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-black uppercase text-slate-700">Driver</span>
            </div>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-500"><path d="M6 8a6 6 0 0 1 12 0c0 7 4 11 4 11H2s4-4 4-11"/><path d="M9 22h6"/></svg>
          </div>
          <label className="mt-3 flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 focus-within:bg-white focus-within:ring-4 focus-within:ring-blue-100">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            <input placeholder="Search name or phone" className="w-full border-0 bg-transparent text-sm font-semibold outline-none placeholder:text-slate-400" />
          </label>
          <div className="mt-3 grid grid-cols-4 gap-1 rounded-xl bg-slate-100 p-1">
            {['all', 'internal', 'sms', 'unread'].map(item => (
              <button key={item} type="button" className={`h-8 rounded-lg text-[11px] font-black capitalize ${item === 'all' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500'}`}>{item}</button>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
            {['chats', 'team', 'clients'].map(item => (
              <button key={item} type="button" className={`h-9 rounded-lg text-xs font-black capitalize ${item === 'chats' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500'}`}>{item}</button>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" className="flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 text-xs font-black text-white">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg> New Chat
            </button>
            <button type="button" className="flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-xs font-black text-slate-700">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg> New SMS
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="space-y-1 p-2">
            <div className="flex min-h-[280px] items-center justify-center p-8 text-center">
              <div>
                <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mx-auto text-slate-300"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                <p className="mt-3 text-sm font-black text-slate-700">No conversations found</p>
                <p className="mt-1 text-xs font-semibold text-slate-400">Start a chat or adjust your filters.</p>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col md:flex">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-3 sm:px-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-black text-white bg-slate-700">AD</div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-base font-black text-slate-950">Alex Driver</h2>
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-black uppercase text-slate-700">Driver</span>
            </div>
            <p className="truncate text-xs font-bold text-slate-500">Real-time internal chat</p>
          </div>
          <button type="button" className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          </button>
          <button type="button" className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-5">
          <div className="my-3 flex justify-center">
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-black text-slate-500 shadow-sm">Today</span>
          </div>
          <div className="flex justify-start py-1">
            <div className="max-w-[82%] text-left sm:max-w-[70%] flex flex-col items-start">
              <div className="mb-1 flex items-center gap-2 px-1">
                <span className="text-[11px] font-black text-slate-600">Jordan Dispatch</span>
                <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-black uppercase text-emerald-700">Dispatcher</span>
              </div>
              <div className="rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm rounded-bl-md border border-slate-200 bg-white text-slate-900">
                <p className="whitespace-pre-wrap break-words">Morning Alex. Your first pickup is ready early.</p>
              </div>
              <div className="mt-1 flex items-center gap-1 px-1 text-[10px] font-bold text-slate-400">
                <span>9:35 AM</span>
              </div>
            </div>
          </div>
          <div className="flex justify-end py-1">
            <div className="max-w-[82%] text-left sm:max-w-[70%] flex flex-col items-end">
              <div className="rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm rounded-br-md text-white" style={{ backgroundColor: '#0099cc' }}>
                <p className="whitespace-pre-wrap break-words">Copy. I am headed there now.</p>
              </div>
              <div className="mt-1 flex items-center gap-1 px-1 text-[10px] font-bold text-slate-400">
                <span>9:40 AM</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 7 17l-5-5"/><path d="m22 10-7.5 8.5L12 16"/></svg>
              </div>
            </div>
          </div>
          <div className="flex justify-start py-1">
            <div className="max-w-[82%] text-left sm:max-w-[70%] flex flex-col items-start">
              <div className="mb-1 flex items-center gap-2 px-1">
                <span className="text-[11px] font-black text-slate-600">Jordan Dispatch</span>
                <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-black uppercase text-emerald-700">Dispatcher</span>
              </div>
              <div className="rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm rounded-bl-md border border-slate-200 bg-white text-slate-900">
                <div className="mb-2 rounded-lg border-l-4 border-blue-300 bg-slate-50 px-2 py-1 text-xs text-slate-600">
                  <span className="font-black">Jordan Dispatch</span>
                  <p className="truncate">Your first pickup is ready early.</p>
                </div>
                <p className="whitespace-pre-wrap break-words">Pickup confirmed. ETA 8 minutes.</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg> route-note.pdf · 180 KB
                  </span>
                </div>
              </div>
              <div className="mt-1 flex items-center gap-1 px-1 text-[10px] font-bold text-slate-400">
                <span>9:52 AM</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 7 17l-5-5"/><path d="m22 10-7.5 8.5L12 16"/></svg>
              </div>
            </div>
          </div>
        </div>

        <footer className="shrink-0 border-t border-slate-200 bg-white px-3 pt-2 pb-[calc(12px+env(safe-area-inset-bottom,0px))] sm:px-4">
          <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-1.5 focus-within:bg-white focus-within:ring-4 focus-within:ring-blue-100">
            <button type="button" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-white">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
            </button>
            <button type="button" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-white">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05-12.8 12.8a2 2 0 0 1-2.25.34l-2.66-1.25 1.25-2.66a2 2 0 0 1 .34-2.25L11.05 2.56a2 2 0 0 1 2.84 0l7.55 7.55a2 2 0 0 1 0 2.84z"/><path d="M10 20h11"/></svg>
            </button>
            <textarea
              rows={1}
              placeholder="Message team"
              className="max-h-32 min-h-[40px] flex-1 resize-none border-0 bg-transparent px-1 py-2 text-[16px] font-semibold leading-snug outline-none placeholder:text-slate-400 sm:text-sm"
            />
            <button type="button" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white" style={{ backgroundColor: '#0099cc' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
            </button>
          </div>
        </footer>
      </main>

      <aside className="hidden w-[240px] shrink-0 flex-col border-l border-slate-200 bg-white lg:flex">
        <div className="border-b border-slate-200 p-4 text-center">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-black text-white bg-slate-700 mx-auto">AD</div>
          <h3 className="mt-3 text-base font-black text-slate-950">Alex Driver</h3>
          <p className="mt-1 text-xs font-bold text-slate-500">Internal conversation</p>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          <section>
            <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-400">Quick actions</h4>
            <div className="mt-2 space-y-2">
              <button type="button" className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-slate-100 text-xs font-black text-slate-700">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg> Export Transcript
              </button>
              <button type="button" className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-slate-100 text-xs font-black text-slate-700">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg> Search Messages
              </button>
            </div>
          </section>
          <section>
            <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-400">Stats</h4>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {[['Total', 3], ['Sent', 1], ['Inbound', 2]].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-slate-50 p-2 text-center">
                  <p className="text-lg font-black text-slate-900">{value}</p>
                  <p className="text-[10px] font-bold text-slate-400">{label}</p>
                </div>
              ))}
            </div>
          </section>
          <section>
            <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-400">Participants</h4>
            <div className="mt-2 space-y-2">
              <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                <div className="min-w-0">
                  <p className="truncate text-xs font-black text-slate-800">Jordan Dispatch</p>
                  <p className="text-[10px] font-bold text-slate-400">Dispatcher</p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                <div className="min-w-0">
                  <p className="truncate text-xs font-black text-slate-800">Alex Driver</p>
                  <p className="text-[10px] font-bold text-slate-400">Driver</p>
                </div>
              </div>
            </div>
          </section>
        </div>
      </aside>
    </section>
  );
}
