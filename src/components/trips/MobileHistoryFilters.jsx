import { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, Check, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { localCalendarYmd } from '../../utils/tripDate';

const shortDate = (value) => {
  const [, month, day] = String(value || '').split('-');
  return month && day ? `${Number(month)}/${Number(day)}` : 'Select';
};

const shiftIsoDay = (value, amount) => {
  const date = new Date(`${value || localCalendarYmd()}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return localCalendarYmd(date);
};

export default function MobileHistoryFilters({
  startDate,
  endDate,
  onDateChange,
  status = 'all',
  onStatusChange,
  driver = 'all',
  onDriverChange,
  drivers = [],
  count = 0,
  statusOptions: statusOptionsProp = null,
}) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [driverOpen, setDriverOpen] = useState(false);
  const [monthDate, setMonthDate] = useState(() => new Date(`${startDate || localCalendarYmd()}T12:00:00`));
  const rootRef = useRef(null);

  useEffect(() => {
    const close = (event) => {
      if (!rootRef.current?.contains(event.target)) {
        setCalendarOpen(false);
        setStatusOpen(false);
        setDriverOpen(false);
      }
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);

  const days = useMemo(() => {
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const blanks = new Date(year, month, 1).getDay();
    const countDays = new Date(year, month + 1, 0).getDate();
    return [
      ...Array.from({ length: blanks }, () => null),
      ...Array.from({ length: countDays }, (_, index) => {
        const day = index + 1;
        return { day, iso: `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}` };
      }),
    ];
  }, [monthDate]);

  const selectDay = (iso) => {
    if (!startDate || endDate) onDateChange?.(iso, null);
    else if (iso < startDate) onDateChange?.(iso, null);
    else if (iso === startDate) onDateChange?.(iso, null);
    else onDateChange?.(startDate, iso);
  };
  const statusOptions = statusOptionsProp || [
    { value: 'all', label: 'All Trips' },
    { value: 'completed', label: 'Completed' },
    { value: 'cancelled', label: 'Cancelled' },
  ];
  const driverOptions = [{ value: 'all', label: 'All Drivers' }, ...drivers.filter(Boolean).map((name) => ({ value: name, label: name }))];
  const statusLabel = statusOptions.find((item) => item.value === status)?.label || 'All Trips';

  return (
    <div ref={rootRef} className="relative z-30 flex w-full items-center justify-between gap-1 border-b border-slate-200 bg-white px-2 py-2" data-testid="mobile-history-filters">
      <div className="flex min-w-0 shrink items-center gap-1">
        <div className="relative shrink-0">
          <div className="flex shrink-0 items-center overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xs">
            <button type="button" onClick={() => onDateChange?.(shiftIsoDay(startDate, -1), null)} className="flex h-7 w-6 items-center justify-center text-slate-600" aria-label="Previous day"><ChevronLeft size={14} /></button>
            <button type="button" onClick={() => { setCalendarOpen((open) => !open); setStatusOpen(false); setDriverOpen(false); }} className={`flex h-7 max-w-[96px] items-center gap-1 border-x border-slate-200 px-1.5 text-[12.5px] font-semibold ${calendarOpen ? 'bg-indigo-600 text-white' : endDate ? 'bg-indigo-50 text-indigo-700' : 'text-slate-800'}`} aria-expanded={calendarOpen}>
              <Calendar size={14} /><span className="truncate whitespace-nowrap">{endDate ? `${shortDate(startDate)}–${shortDate(endDate)}` : shortDate(startDate)}</span><ChevronDown size={12} />
            </button>
            <button type="button" onClick={() => onDateChange?.(shiftIsoDay(startDate, 1), null)} className="flex h-7 w-6 items-center justify-center text-slate-600" aria-label="Next day"><ChevronRight size={14} /></button>
          </div>
          {calendarOpen && (
            <div className="absolute left-0 top-full z-50 mt-1.5 w-[290px] rounded-xl border border-slate-200 bg-white p-3 shadow-2xl">
              <div className="mb-2 flex items-center justify-between">
                <div><p className="text-[13px] font-bold text-slate-900">{monthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p><p className="text-[10.5px] text-slate-400">Tap 1 day or tap 2 days for range</p></div>
                <div className="flex gap-1">
                  <button type="button" onClick={() => setMonthDate(new Date(monthDate.getFullYear(), monthDate.getMonth() - 1, 1))} className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-slate-100"><ChevronLeft size={12} /></button>
                  <button type="button" onClick={() => setMonthDate(new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1))} className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-slate-100"><ChevronRight size={12} /></button>
                </div>
              </div>
              <div className="mb-1 grid grid-cols-7 text-center text-[10.5px] font-semibold text-slate-400">{['Su','Mo','Tu','We','Th','Fr','Sa'].map((day) => <span key={day}>{day}</span>)}</div>
              <div className="grid grid-cols-7 gap-y-1 text-center">
                {days.map((item, index) => item ? (
                  <button key={item.iso} type="button" onClick={() => selectDay(item.iso)} className={`flex h-7 items-center justify-center text-[12px] font-semibold ${item.iso === startDate || item.iso === endDate ? 'rounded-lg bg-indigo-600 text-white' : startDate && endDate && item.iso > startDate && item.iso < endDate ? 'bg-indigo-50 text-indigo-900' : 'rounded-lg text-slate-800 hover:bg-slate-100'}`}>{item.day}</button>
                ) : <div key={`blank-${index}`} className="h-7" />)}
              </div>
              <div className="mt-2.5 flex items-center justify-between border-t border-slate-100 pt-2 text-[11px]">
                <button type="button" onClick={() => { const today = localCalendarYmd(); onDateChange?.(today, null); setMonthDate(new Date(`${today}T12:00:00`)); setCalendarOpen(false); }} className="rounded bg-slate-100 px-2 py-0.5 font-medium text-slate-700">Today</button>
                <button type="button" onClick={() => setCalendarOpen(false)} className="rounded bg-indigo-600 px-2.5 py-0.5 font-semibold text-white">Done</button>
              </div>
            </div>
          )}
        </div>

        <div className="relative shrink-0">
          <button type="button" onClick={() => { setStatusOpen((open) => !open); setCalendarOpen(false); setDriverOpen(false); }} className={`flex h-7 items-center gap-1 whitespace-nowrap rounded-lg border px-2 text-[12.5px] font-semibold ${status === 'completed' ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : status === 'cancelled' ? 'border-rose-300 bg-rose-50 text-rose-800' : 'border-slate-200 bg-white text-slate-700'}`}><span>{statusLabel}</span><ChevronDown size={12} /></button>
          {statusOpen && <Menu options={statusOptions} value={status} onSelect={(value) => { onStatusChange?.(value); setStatusOpen(false); }} />}
        </div>

        <div className="relative min-w-0 shrink">
          <button type="button" onClick={() => { setDriverOpen((open) => !open); setCalendarOpen(false); setStatusOpen(false); }} className={`flex h-7 max-w-[105px] items-center gap-1 whitespace-nowrap rounded-lg border px-2 text-[12.5px] font-semibold ${driver !== 'all' ? 'border-indigo-300 bg-indigo-50 text-indigo-800' : 'border-slate-200 bg-white text-slate-700'}`}><span className="truncate">{driver === 'all' ? 'All Drivers' : driver}</span><ChevronDown size={12} className="shrink-0" /></button>
          {driverOpen && <Menu options={driverOptions} value={driver} onSelect={(value) => { onDriverChange?.(value); setDriverOpen(false); }} />}
        </div>
      </div>
      <span className="shrink-0 whitespace-nowrap rounded-md bg-slate-100 px-2 py-0.5 text-[11.5px] font-semibold text-slate-700">{count} trips</span>
    </div>
  );
}

function Menu({ options, value, onSelect }) {
  return <div className="absolute left-0 top-full z-50 mt-1.5 max-h-56 w-36 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl">{options.map((item) => <button key={item.value} type="button" onClick={() => onSelect(item.value)} className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-[12.5px] font-semibold hover:bg-slate-50 ${value === item.value ? 'text-indigo-600' : 'text-slate-700'}`}><span className="truncate">{item.label}</span>{value === item.value && <Check size={12} />}</button>)}</div>;
}
