import { useState } from 'react';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';

const valueOrDash = (value) => {
  if (value === undefined || value === null || value === '') return '—';
  return String(value);
};

export function MobileHistoryCardHeader({
  trip,
  expanded = false,
  driverName,
  vehicleName,
  miles,
  time,
  status,
  onToggle,
}) {
  const [copied, setCopied] = useState(false);
  const patient = trip?.patient || 'Trip';
  const bookingId = trip?.bookingId || trip?.id || '—';
  const resolvedMiles = valueOrDash(miles);
  const copyId = (event) => {
    event.stopPropagation();
    navigator.clipboard?.writeText(String(bookingId));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div
      className="w-full cursor-pointer select-none rounded-xl px-3 py-2.5 transition-colors hover:bg-slate-50/60 active:bg-slate-50"
      aria-expanded={expanded}
      onClick={onToggle}
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-[16px] font-bold tracking-tight tabular-nums text-emerald-700">{time || 'Will Call'}</span>
          <span className="h-3.5 w-[1.5px] shrink-0 bg-slate-400/80" aria-hidden="true" />
          <span className="min-w-0 truncate text-[14px] font-semibold tracking-[-0.2px] text-slate-950">{patient}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button type="button" onClick={copyId} className="flex max-w-[112px] items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-[13.5px] font-bold text-slate-900 shadow-xs" title="Click to copy Trip ID"><span className="truncate tracking-tight">{bookingId}</span>{copied && <Check size={13} className="text-emerald-600" />}</button>
          <button type="button" onClick={(event) => { event.stopPropagation(); onToggle?.(); }} className={`flex h-7 w-7 items-center justify-center rounded-lg border shadow-xs ${expanded ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-slate-300 bg-white text-slate-600'}`} aria-label={expanded ? 'Collapse trip' : 'Open trip'}>{expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button>
        </div>
      </div>
      <div className="mt-1 flex min-w-0 items-center justify-between gap-2 text-[13px] font-normal tracking-[-0.1px] text-slate-500"><div className="flex min-w-0 items-center gap-2"><span className="shrink-0 tabular-nums">{resolvedMiles} mi</span><span className="shrink-0 text-slate-300">•</span><span className="truncate">{driverName || '—'}</span></div><span className="max-w-[130px] shrink-0 truncate pr-8 text-right text-[12.5px]">{vehicleName || '—'}</span></div>
    </div>
  );
}

function Stop({ tone, label, address, clock, odometer }) {
  const pickup = tone === 'pickup';
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-2.5 shadow-xs">
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5"><span className={`h-2 w-2 shrink-0 rounded-full ${pickup ? 'bg-emerald-500' : 'bg-rose-500'}`} /><span className={`text-[11px] font-bold uppercase tracking-wider ${pickup ? 'text-emerald-800' : 'text-rose-800'}`}>{label}</span></div>
        <div className="flex items-center gap-1.5 text-[12px] text-slate-600">
          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-800">{valueOrDash(clock)}</span>
          <span className={`rounded border px-1.5 py-0.5 font-mono text-[11px] font-medium ${pickup ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>Odo: <strong className="font-bold text-slate-950">{valueOrDash(odometer)}</strong></span>
        </div>
      </div>
      <p className="truncate text-[13.5px] font-semibold leading-snug tracking-[-0.24px] text-slate-900" title={valueOrDash(address)}>{valueOrDash(address)}</p>
    </div>
  );
}

export function MobileHistoryStops({ pickupAddress, dropoffAddress, pickupClock, dropoffClock, pickupOdometer, dropoffOdometer }) {
  return (
    <div className="grid grid-cols-1 gap-2" data-testid="mobile-history-stops">
      <Stop tone="pickup" label="Pickup" address={pickupAddress} clock={pickupClock} odometer={pickupOdometer} />
      <Stop tone="dropoff" label="Dropoff" address={dropoffAddress} clock={dropoffClock} odometer={dropoffOdometer} />
    </div>
  );
}
