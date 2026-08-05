import React, { useMemo, useState } from 'react';
import { Activity, ExternalLink, Search, ShieldCheck } from 'lucide-react';
import { AdminBadge, AdminCard, AdminEmpty } from './AdminKit';

const lower = (value) => String(value || '').toLowerCase();
const timeValue = (log) => {
  const raw = log?.time || log?.timestamp || log?.createdAt;
  if (raw?.toDate) return raw.toDate();
  const date = new Date(raw || 0);
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
};
const entity = (log) => lower(log?.meta?.entity || log?.entityType || 'system');
const tone = (log) => log?.c === 'rose' ? 'danger' : log?.c === 'amber' ? 'warning' : log?.c === 'emerald' ? 'success' : 'muted';

export default function AdminActivityCenter({ logs = [], onViewTrip }) {
  const [query, setQuery] = useState('');
  const [entityFilter, setEntityFilter] = useState('all');
  const [date, setDate] = useState('');
  const rows = useMemo(() => [...logs]
    .sort((a, b) => timeValue(b) - timeValue(a))
    .filter((log) => entityFilter === 'all' || entity(log) === entityFilter)
    .filter((log) => !date || timeValue(log).toLocaleDateString('en-CA') === date)
    .filter((log) => {
      const needle = lower(query.trim());
      if (!needle) return true;
      return [log.t, log.d, log.actor, log.actorRole, log.meta?.id, log.meta?.summary, entity(log)].some((value) => lower(value).includes(needle));
    }), [date, entityFilter, logs, query]);

  const entities = useMemo(() => ['all', ...new Set(logs.map(entity).filter(Boolean))], [logs]);

  return (
    <AdminCard pad={false} className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-center">
        <div className="flex min-w-0 items-center gap-3">
          <span className="rounded-xl bg-blue-50 p-2 text-blue-700"><ShieldCheck size={18} /></span>
          <div><h3 className="font-bold text-slate-950">Operational audit</h3><p className="text-xs text-slate-500">Who changed what, when, and why</p></div>
        </div>
        <div className="ml-auto flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
          <label className="relative min-w-64"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input className="adm-input w-full pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search actor, trip, user, action..."/></label>
          <select className="adm-input" value={entityFilter} onChange={(event) => setEntityFilter(event.target.value)}>{entities.map((item) => <option key={item} value={item}>{item === 'all' ? 'All activity' : item}</option>)}</select>
          <input className="adm-input" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-left text-xs">
          <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500"><tr><th className="px-4 py-3">Time</th><th className="px-4 py-3">Action</th><th className="px-4 py-3">Details</th><th className="px-4 py-3">Actor</th><th className="px-4 py-3">Entity</th><th className="px-4 py-3">Open</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((log, index) => {
              const id = log?.meta?.id || log?.entityId;
              const isTrip = entity(log) === 'trip';
              return <tr key={log.id || `${timeValue(log).getTime()}-${index}`} className="hover:bg-slate-50/70">
                <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-500">{timeValue(log).getTime() ? timeValue(log).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                <td className="px-4 py-3 font-bold text-slate-900">{log.t || log.action || 'Activity'}</td>
                <td className="max-w-xl px-4 py-3 text-slate-600">{log.meta?.summary || log.d || 'No details recorded'}</td>
                <td className="px-4 py-3"><p className="font-semibold text-slate-800">{log.actor || log.actorId || 'System'}</p><p className="text-[10px] uppercase text-slate-400">{log.actorRole || 'system'}</p></td>
                <td className="px-4 py-3"><AdminBadge tone={tone(log)}>{entity(log)}</AdminBadge></td>
                <td className="px-4 py-3">{isTrip && id && onViewTrip ? <button className="rounded-lg p-2 text-blue-600 hover:bg-blue-50" onClick={() => onViewTrip(id)} aria-label="Open trip"><ExternalLink size={14}/></button> : '—'}</td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <AdminEmpty icon={Activity} title="No matching activity" hint="Change the filters or search terms" />}
    </AdminCard>
  );
}
