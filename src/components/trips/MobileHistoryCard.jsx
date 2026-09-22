import { ChevronDown, ChevronRight, MapPin } from 'lucide-react';

const valueOrDash = (value) => {
  if (value === undefined || value === null || value === '') return '—';
  return String(value);
};

export function MobileHistoryCardHeader({
  trip,
  expanded = false,
  detailed = false,
  driverName,
  vehicleName,
  miles,
  time,
  status,
  onToggle,
}) {
  const patient = trip?.patient || 'Trip';
  const bookingId = trip?.bookingId || trip?.id || '—';
  const route = [trip?.pickupCity, trip?.dropoffCity].filter(Boolean).join(' → ');
  const resolvedMiles = valueOrDash(miles);

  return (
    <div
      className="cursor-pointer px-3 py-2.5"
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      onClick={onToggle}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onToggle?.();
        }
      }}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="shrink-0 text-[13px] font-semibold tabular-nums text-emerald-700">{time || 'Will Call'}</span>
        <span className="h-4 w-px shrink-0 bg-slate-200" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-slate-950">{patient}</span>
        <span className="max-w-[92px] shrink-0 truncate rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-semibold text-slate-600">#{bookingId}</span>
        {expanded ? <ChevronDown size={16} className="shrink-0 text-slate-400" /> : <ChevronRight size={16} className="shrink-0 text-slate-400" />}
      </div>
      <div className="mt-1.5 flex min-w-0 items-center justify-between gap-3 text-[11px] font-semibold text-slate-500">
        <span className="min-w-0 truncate"><span className="text-slate-800">{resolvedMiles} mi</span> · {driverName || 'Unassigned'}</span>
        <span className="max-w-[42%] shrink-0 truncate text-right">{vehicleName || 'No vehicle'}</span>
      </div>
      {detailed && (
        <div className="mt-1.5 flex min-w-0 items-center justify-between gap-2 border-t border-slate-100 pt-1.5 text-[10px] font-semibold text-slate-500">
          <span className="min-w-0 truncate">{trip?.date || 'No date'}{trip?.type ? ` · ${trip.type}` : ''}</span>
          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">{status || trip?.status || 'Pending'}</span>
        </div>
      )}
      {detailed && route && (
        <div className="mt-1 flex min-w-0 items-center gap-1 text-[10px] font-medium text-slate-400">
          <MapPin size={11} className="shrink-0" />
          <span className="truncate">{route}</span>
        </div>
      )}
    </div>
  );
}

function Stop({ tone, label, address, clock, odometer }) {
  const pickup = tone === 'pickup';
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[10px] font-semibold uppercase tracking-wider ${pickup ? 'text-emerald-700' : 'text-rose-700'}`}>{label}</span>
        <div className="flex items-center gap-2 text-[11px] font-semibold tabular-nums text-slate-600">
          <span>Arrived: {valueOrDash(clock)}</span>
          <span>Odo: {valueOrDash(odometer)}</span>
        </div>
      </div>
      <p className="mt-1 text-[13px] font-semibold leading-snug text-slate-900">{valueOrDash(address)}</p>
    </div>
  );
}

export function MobileHistoryStops({ pickupAddress, dropoffAddress, pickupClock, dropoffClock, pickupOdometer, dropoffOdometer }) {
  return (
    <div className="grid grid-cols-1 gap-1.5" data-testid="mobile-history-stops">
      <Stop tone="pickup" label="Pickup" address={pickupAddress} clock={pickupClock} odometer={pickupOdometer} />
      <Stop tone="dropoff" label="Dropoff" address={dropoffAddress} clock={dropoffClock} odometer={dropoffOdometer} />
    </div>
  );
}
