import React, { useDeferredValue, useMemo, useState } from 'react';
import { Archive, CarFront, ClipboardList, Search, UserRound, X } from 'lucide-react';
import { tripMatchesSearch } from '../utils/search';

const textMatches = (values, query) => values.some((value) => String(value || '').toLowerCase().includes(query));

export const buildGlobalSearchResults = ({ query, trips = [], trashedTrips = [], drivers = [], vehicles = [], limit = 16 }) => {
  const normalized = String(query || '').trim().toLowerCase();
  if (normalized.length < 2) return [];
  const results = [];
  trips.forEach((trip) => {
    if (results.length < limit && tripMatchesSearch(trip, normalized)) results.push({ type: 'trip', record: trip });
  });
  trashedTrips.forEach((trip) => {
    if (results.length < limit && tripMatchesSearch(trip, normalized)) results.push({ type: 'archive', record: trip });
  });
  drivers.forEach((driver) => {
    if (results.length < limit && textMatches([driver.name, driver.email, driver.phone, driver.vehicle, driver.currentZone], normalized)) results.push({ type: 'driver', record: driver });
  });
  vehicles.forEach((vehicle) => {
    if (results.length < limit && textMatches([vehicle.name, vehicle.make, vehicle.model, vehicle.plate, vehicle.vin, vehicle.unitNumber], normalized)) results.push({ type: 'vehicle', record: vehicle });
  });
  return results;
};

const META = {
  trip: { label: 'Active trip', icon: ClipboardList, tone: 'bg-blue-100 text-blue-700' },
  archive: { label: 'Archived trip', icon: Archive, tone: 'bg-amber-100 text-amber-800' },
  driver: { label: 'Driver', icon: UserRound, tone: 'bg-emerald-100 text-emerald-800' },
  vehicle: { label: 'Vehicle', icon: CarFront, tone: 'bg-slate-200 text-slate-700' },
};

const titleFor = ({ type, record }) => type === 'driver'
  ? record.name || record.email
  : type === 'vehicle'
    ? record.name || record.unitNumber || `${record.make || ''} ${record.model || ''}`.trim() || record.plate
    : record.patient || record.memberName || record.bookingId || record.id;

const detailFor = ({ type, record }) => type === 'driver'
  ? [record.vehicle, record.phone, record.currentZone].filter(Boolean).join(' · ')
  : type === 'vehicle'
    ? [record.plate, record.make, record.model].filter(Boolean).join(' · ')
    : [record.bookingId || record.id, record.date, record.time, record.status].filter(Boolean).join(' · ');

const GlobalEntitySearch = ({ trips, trashedTrips, drivers, vehicles, onSelect, autoFocus = false, onClose }) => {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const results = useMemo(() => buildGlobalSearchResults({ query: deferredQuery, trips, trashedTrips, drivers, vehicles }), [deferredQuery, drivers, trashedTrips, trips, vehicles]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white">
      <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
        <Search size={18} className="text-blue-600" />
        <input autoFocus={autoFocus} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search trips, archives, drivers, vehicles…" className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-400" />
        {query && <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="flex min-h-10 min-w-10 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"><X size={17} /></button>}
        {onClose && <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700">Done</button>}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3 pb-24">
        {deferredQuery.trim().length < 2 && <div className="rounded-xl border border-blue-100 bg-blue-50 p-5 text-center"><Search size={22} className="mx-auto text-blue-600" /><p className="mt-2 text-sm font-semibold text-slate-900">Search the whole operation</p><p className="mt-1 text-xs font-semibold text-slate-500">Use a passenger, booking ID, phone, driver, vehicle, plate, or VIN.</p></div>}
        {deferredQuery.trim().length >= 2 && results.length === 0 && <div className="p-8 text-center text-sm font-semibold text-slate-500">No matching operational records.</div>}
        <div className="space-y-2">
          {results.map((result, index) => {
            const meta = META[result.type];
            const Icon = meta.icon;
            return (
              <button key={`${result.type}-${result.record.id || result.record.email || index}`} type="button" onClick={() => onSelect?.(result)} className="flex min-h-[64px] w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left hover:border-blue-200 hover:bg-blue-50">
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${meta.tone}`}><Icon size={18} /></span>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-950">{titleFor(result)}</span><span className="block truncate text-xs font-semibold text-slate-500">{detailFor(result)}</span></span>
                <span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-slate-600">{meta.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default React.memo(GlobalEntitySearch);
