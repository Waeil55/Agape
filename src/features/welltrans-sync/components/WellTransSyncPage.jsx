import React, { useMemo, useState } from 'react';
import { AlertTriangle, Bot, CheckCircle2, Clock3, ExternalLink, Loader2, Play, RefreshCw, Save, Settings2, ShieldCheck, XCircle } from 'lucide-react';
import { auth } from '../../../config/firebase';
import { useWellTransSync } from '../hooks/useWellTransSync';
import { confirmWellTransApplied, explainWellTransFailure, queueWellTransSync, saveWellTransSettings } from '../services/welltransService';
import { validateTripForWellTrans } from '../utils/welltransMapping';

const statusStyle = {
  pending: 'bg-amber-50 text-amber-700', processing: 'bg-blue-50 text-blue-700',
  awaiting_review: 'bg-violet-50 text-violet-700',
  completed: 'bg-emerald-50 text-emerald-700', failed: 'bg-rose-50 text-rose-700',
};
const asDate = value => value?.toDate?.() || (value ? new Date(value) : null);
const displayTime = value => {
  const date = asDate(value);
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleString() : 'Never';
};

const WellTransSyncPage = ({ trips = [], role = 'driver' }) => {
  const { settings, logs, worker, workerOnline, workerCalibrated, workerStandby, loading, completedTrips, readyTrips, latestByTrip } = useWellTransSync(trips);
  const [selectedIds, setSelectedIds] = useState([]);
  const [tab, setTab] = useState('queue');
  const [draftSettings, setDraftSettings] = useState(null);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [selectedFailure, setSelectedFailure] = useState(null);
  const effectiveSettings = draftSettings || settings;
  const todayKey = new Date().toLocaleDateString('en-CA');
  const todayCompleted = useMemo(() => completedTrips.filter(trip => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(trip.date || ''))) return trip.date === todayKey;
    const date = asDate(trip.completedAt);
    return date && date.toLocaleDateString('en-CA') === todayKey;
  }), [completedTrips, todayKey]);
  const workerDateReady = useMemo(() => readyTrips.filter(trip => {
    const raw = String(trip.dateKey || trip.serviceDate || trip.tripDate || trip.scheduledDate || trip.pickupDate || trip.date || '');
    return worker?.selectedDate && raw.slice(0, 10) === worker.selectedDate;
  }), [readyTrips, worker?.selectedDate]);
  const successful = logs.filter(log => log.status === 'completed').length;
  const staged = logs.filter(log => log.status === 'awaiting_review').length;
  const failed = logs.filter(log => log.status === 'failed');

  if (role !== 'admin') return <div className="p-8 text-center text-sm font-bold text-rose-700">Administrator access is required.</div>;

  const runQueue = async (ids, mode) => {
    if (!ids.length) return setNotice('No eligible trips were selected.');
    setBusy(mode); setNotice('');
    try {
      const result = await queueWellTransSync(ids, mode);
      setNotice(`${result.data.queued} trip${result.data.queued === 1 ? '' : 's'} queued. ${result.data.rejected || 0} rejected by validation.`);
      setSelectedIds([]);
    } catch (error) {
      setNotice(error.message || 'Unable to create the sync queue.');
    } finally { setBusy(''); }
  };

  const cards = [
    ['Today’s Completed Trips', todayCompleted.length, CheckCircle2, 'text-slate-900 bg-slate-50'],
    ['Ready To Sync', readyTrips.length, Play, 'text-blue-700 bg-blue-50'],
    ['Successfully Synced', successful, ShieldCheck, 'text-emerald-700 bg-emerald-50'],
    ['Awaiting Your Review', staged, Clock3, 'text-violet-700 bg-violet-50'],
    ['Failed', failed.length, XCircle, 'text-rose-700 bg-rose-50'],
    ['Last Sync Time', displayTime(settings.lastSync), Clock3, 'text-violet-700 bg-violet-50'],
  ];

  return (
    <div className="min-h-full bg-slate-50 p-3 sm:p-5 lg:p-7">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <header className="rounded-3xl bg-slate-950 px-5 py-5 text-white shadow-xl sm:px-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div><p className="text-[10px] font-black uppercase tracking-[.22em] text-blue-300">Broker integrations · WellTrans</p><h1 className="mt-2 text-2xl font-black tracking-tight">WellTrans Automation Center</h1><p className="mt-2 max-w-2xl text-xs font-medium text-slate-300">Booking-ID-only matching, controlled field mapping, isolated retries, screenshots and immutable operational history.</p></div>
            <div className="flex flex-wrap items-center gap-2"><button onClick={() => { window.location.href = 'agape-welltrans://start'; }} className="rounded-xl bg-blue-500 px-4 py-3 text-xs font-black text-white shadow-lg hover:bg-blue-400"><Play size={14} className="mr-1 inline" /> OPEN WELLTRANS WORKER</button><div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3"><span className={`h-2.5 w-2.5 rounded-full ${settings.enabled && workerOnline ? 'bg-emerald-400' : 'bg-amber-400'}`} /><div><p className="text-[10px] font-bold uppercase text-slate-400">Automation worker</p><p className="text-xs font-black">{!settings.enabled ? 'Queue disabled' : workerOnline ? `Online · ${worker?.workerId || 'connected'}` : workerStandby ? 'Standby · writes safely locked' : 'Offline · jobs will remain queued'}</p></div></div></div>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-6">{cards.map(([label, value, Icon, color]) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className={`flex h-9 w-9 items-center justify-center rounded-xl ${color}`}><Icon size={17} /></div><p className="mt-3 text-lg font-black text-slate-950">{value}</p><p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p></div>)}</section>

        <section className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <button disabled={!settings.enabled || busy} onClick={() => runQueue(todayCompleted.map(trip => trip.id), 'today')} className="rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-40">{busy === 'today' ? <Loader2 size={14} className="inline animate-spin" /> : 'SYNC TODAY’S TRIPS'}</button>
          <button disabled={!workerCalibrated || !workerDateReady.length || busy} onClick={() => runQueue(workerDateReady.map(trip => trip.id), 'worker-date')} className="rounded-xl bg-violet-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-40">{busy === 'worker-date' ? <Loader2 size={14} className="inline animate-spin" /> : `STAGE ${worker?.selectedDate || 'WORKER DATE'} (${workerDateReady.length})`}</button>
          <button disabled={!settings.enabled || !selectedIds.length || busy} onClick={() => runQueue(selectedIds, 'selected')} className="rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-black text-white disabled:opacity-40">SYNC SELECTED TRIPS</button>
          <button disabled={!readyTrips.length} onClick={() => setSelectedIds(readyTrips.map(trip => trip.id))} className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs font-black text-blue-700 disabled:opacity-40">SELECT ALL READY ({readyTrips.length})</button>
          <button disabled={!settings.enabled || !failed.length || busy} onClick={() => runQueue(failed.map(log => log.tripId), 'retry')} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-black text-slate-700 disabled:opacity-40"><RefreshCw size={14} className="mr-1 inline" /> RETRY FAILED</button>
          <button onClick={() => setTab('logs')} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-black text-slate-700">VIEW LOGS</button>
          <button onClick={() => { setDraftSettings({ ...settings, fieldMapping: { ...settings.fieldMapping } }); setTab('settings'); }} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-black text-slate-700"><Settings2 size={14} className="mr-1 inline" /> SETTINGS</button>
          {notice && <p className="flex w-full items-center gap-2 px-1 pt-1 text-xs font-bold text-slate-600"><AlertTriangle size={14} className="text-amber-500" />{notice}</p>}
          {workerCalibrated && <p className="flex w-full items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800"><ShieldCheck size={14} />Worker is attached to the live WellTrans grid for {worker.selectedDate}. Only trips for this exact date can run.</p>}
          {worker?.state === 'review_ready' && <p className="flex w-full items-center gap-2 rounded-xl bg-violet-50 px-3 py-2 text-xs font-bold text-violet-800"><CheckCircle2 size={14} />Review ready: {worker.reviewSummary?.staged || 0} unique trip(s) staged, {worker.reviewSummary?.failed || 0} failed, and {worker.reviewSummary?.pending || 0} pending. Review every red WellTrans column before clicking Apply.</p>}
          <p className="flex w-full items-center gap-2 rounded-xl bg-violet-50 px-3 py-2 text-xs font-bold text-violet-800"><ShieldCheck size={14} />Manual approval mode: automation stages fields only. It never clicks Apply. Review the WellTrans grid and click Apply yourself.</p>
          {!workerOnline && settings.enabled && <p className="flex w-full items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800"><AlertTriangle size={14} />{workerStandby ? 'The worker is connected in safe standby. WellTrans writes remain locked until the TripSpark adapter passes its supervised test.' : 'The queue is enabled, but no active worker heartbeat is available. Queued jobs cannot update WellTrans until the Playwright worker is running.'}</p>}
        </section>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex border-b border-slate-200 bg-slate-50 px-3">{['queue', 'logs', 'settings'].map(item => <button key={item} onClick={() => { if (item === 'settings' && !draftSettings) setDraftSettings({ ...settings, fieldMapping: { ...settings.fieldMapping } }); setTab(item); }} className={`border-b-2 px-4 py-3 text-xs font-black uppercase ${tab === item ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500'}`}>{item}</button>)}</div>
            {loading ? <div className="p-12 text-center"><Loader2 className="mx-auto animate-spin text-blue-600" /></div> : tab === 'queue' ? (
              <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left"><thead className="bg-white text-[10px] uppercase text-slate-500"><tr>{['', 'Booking ID', 'Passenger', 'Driver', 'Pickup', 'Dropoff', 'Mileage', 'Readiness', 'Sync'].map(label => <th key={label} className="px-3 py-3 font-black">{label}</th>)}</tr></thead><tbody>{completedTrips.map(trip => { const validation = validateTripForWellTrans(trip); const latest = latestByTrip.get(trip.id); const locked = ['completed', 'awaiting_review'].includes(latest?.status); return <tr key={trip.id} className="border-t border-slate-100 text-xs"><td className="px-3 py-3"><input type="checkbox" disabled={!validation.valid || locked} checked={selectedIds.includes(trip.id)} onChange={() => setSelectedIds(ids => ids.includes(trip.id) ? ids.filter(id => id !== trip.id) : [...ids, trip.id])} /></td><td className="px-3 py-3 font-mono font-black text-blue-700">{trip.bookingId || trip.id}</td><td className="px-3 py-3 font-bold text-slate-800">{trip.patient || trip.clientName || '—'}</td><td className="px-3 py-3 text-slate-600">{trip.driverName || '—'}</td><td className="px-3 py-3 text-slate-600">{trip.arrivalTime ? 'Captured' : 'Missing'}</td><td className="px-3 py-3 text-slate-600">{trip.arrivalDropoffTime || trip.completedAt ? 'Captured' : 'Missing'}</td><td className="px-3 py-3 text-slate-600">{validation.payload?.dropoff.mileage ?? '—'}</td><td className="px-3 py-3">{validation.valid ? <span className="font-bold text-emerald-700">Ready</span> : <span title={validation.errors.join(', ')} className="font-bold text-rose-700">{validation.errors[0]}</span>}</td><td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${statusStyle[latest?.status] || 'bg-slate-100 text-slate-500'}`}>{latest?.status || 'Not queued'}</span></td></tr>; })}</tbody></table></div>
            ) : tab === 'logs' ? (
              <div className="divide-y divide-slate-100">{logs.length ? logs.map(log => <div key={log.id} className="flex w-full items-center gap-3 p-4 text-left hover:bg-slate-50"><button onClick={() => log.status === 'failed' && setSelectedFailure(log)} className="flex min-w-0 flex-1 items-center gap-3 text-left"><span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${statusStyle[log.status]}`}>{log.status}</span><div className="min-w-0 flex-1"><p className="font-mono text-xs font-black text-slate-900">{log.bookingId || log.tripId}</p><p className="truncate text-[11px] text-slate-500">{log.errorMessage || log.stage || 'Synchronization completed'}</p></div><span className="text-[10px] font-semibold text-slate-400">{displayTime(log.completedAt || log.stagedAt || log.startedAt || log.createdAt)}</span>{log.screenshot && <ExternalLink size={14} />}</button>{log.status === 'awaiting_review' && <button disabled={busy === log.id} onClick={async () => { if (!window.confirm(`Confirm that you reviewed Booking ${log.bookingId || log.tripId} and clicked Apply in WellTrans?`)) return; setBusy(log.id); try { await confirmWellTransApplied(log.id); setNotice(`Booking ${log.bookingId || log.tripId} confirmed as manually applied.`); } catch (error) { setNotice(error.message || 'Unable to confirm manual Apply.'); } finally { setBusy(''); } }} className="shrink-0 rounded-lg bg-violet-600 px-3 py-2 text-[10px] font-black text-white disabled:opacity-50">CONFIRM APPLIED</button>}</div>) : <p className="p-12 text-center text-sm font-semibold text-slate-500">No synchronization history yet.</p>}</div>
            ) : (
              <div className="space-y-5 p-5"><label className="flex items-center justify-between rounded-xl border border-slate-200 p-4"><div><p className="text-sm font-black">Enable automation queue</p><p className="text-xs text-slate-500">The external worker must also be online.</p></div><input type="checkbox" checked={effectiveSettings.enabled} onChange={event => setDraftSettings(value => ({ ...value, enabled: event.target.checked }))} /></label><label className="block"><span className="text-xs font-black text-slate-700">WellTrans portal URL</span><input value={effectiveSettings.portalUrl || ''} onChange={event => setDraftSettings(value => ({ ...value, portalUrl: event.target.value }))} placeholder="https://…" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" /></label><div><p className="mb-2 text-xs font-black text-slate-700">Agape → WellTrans field mapping</p><div className="grid gap-2 sm:grid-cols-2">{Object.entries(effectiveSettings.fieldMapping || {}).map(([key, value]) => <label key={key} className="rounded-xl bg-slate-50 p-3"><span className="text-[10px] font-black uppercase text-slate-500">{key}</span><input value={value} onChange={event => setDraftSettings(current => ({ ...current, fieldMapping: { ...current.fieldMapping, [key]: event.target.value } }))} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-bold" /></label>)}</div></div><div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs font-semibold text-amber-900">Credentials and session tokens are never stored in Firestore. Manual login and encrypted Playwright session state remain on the automation worker.</div><button onClick={async () => { await saveWellTransSettings(effectiveSettings, auth.currentUser?.uid || 'unknown'); setDraftSettings(null); setNotice('Settings saved.'); }} className="rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-black text-white"><Save size={14} className="mr-1 inline" /> SAVE SETTINGS</button></div>
            )}
          </section>
          <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-700"><Bot size={20} /></span><div><p className="text-[10px] font-black uppercase tracking-wider text-violet-600">AI supervisor</p><h2 className="text-sm font-black">Failure explanation</h2></div></div><p className="mt-4 rounded-xl bg-slate-50 p-4 text-xs font-medium leading-5 text-slate-700">{explainWellTransFailure(selectedFailure)}</p><p className="mt-3 text-[10px] font-semibold leading-4 text-slate-400">The assistant explains logs only. It cannot submit or change transportation records.</p></aside>
        </div>
      </div>
    </div>
  );
};

export default WellTransSyncPage;
