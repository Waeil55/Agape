import { ChevronLeft, ChevronRight } from 'lucide-react';
import { localCalendarYmd } from '../../utils/tripDate';

export function shiftDateValue(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return localCalendarYmd(d);
}

export function formatDateLabel(dateStr, long = false) {
  if (!dateStr) return 'No Date';
  const d = new Date(dateStr + 'T12:00:00');
  if (long) return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function DateNavigator({ dateStr, onShiftDate, label, extra, className = '' }) {
  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <button onClick={() => onShiftDate(-1)} className="w-7 h-7 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-600 hover:bg-slate-50 transition-colors" aria-label="Previous date">
        <ChevronLeft size={14} />
      </button>
      <div className="flex-1 text-center">
        <span className="text-[11px] font-bold text-slate-700">{label}</span>
        {extra && <span className="text-[10px] font-semibold text-slate-500 ml-1">{extra}</span>}
      </div>
      <button onClick={() => onShiftDate(1)} className="w-7 h-7 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-600 hover:bg-slate-50 transition-colors" aria-label="Next date">
        <ChevronRight size={14} />
      </button>
    </div>
  );
}
