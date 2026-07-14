import React, { memo } from 'react';
import { DollarSign, TrendingUp, Clock, Truck, Calendar } from 'lucide-react';
import { calculateTripEarnings, calculateWeeklyEarnings, calculateDailyEarnings } from '../utils/driverEarnings';

export function TripEarningsBadge({ trip, compact = false }) {
  const earnings = calculateTripEarnings(trip);
  if (!earnings) return null;

  if (compact) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded text-[10px] font-semibold">
        <DollarSign size={10} />
        {earnings.total.toFixed(2)}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-1.5 px-2 py-1 bg-emerald-50 border border-emerald-200 rounded-lg">
      <DollarSign size={12} className="text-emerald-600" />
      <span className="text-xs font-semibold text-emerald-700">${earnings.total.toFixed(2)}</span>
    </div>
  );
}

export const DriverEarningsCard = memo(function DriverEarningsCard({ driver, trips }) {
  const today = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })();
  const daily = calculateDailyEarnings(driver, trips, today);
  const weekly = calculateWeeklyEarnings(driver, trips);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 bg-gradient-to-r from-emerald-50 to-green-50 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
            <DollarSign size={16} className="text-emerald-600" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-900">Earnings</p>
            <p className="text-[10px] text-slate-500">{driver?.name || 'Driver'}</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-3 grid grid-cols-2 gap-3">
        <div className="bg-emerald-50 rounded-xl px-3 py-2 text-center">
          <p className="text-lg font-black text-emerald-700">${daily.totalEarnings.toFixed(2)}</p>
          <p className="text-[9px] text-emerald-600 font-medium">Today</p>
          <p className="text-[8px] text-slate-500">{daily.tripsCompleted} trips</p>
        </div>
        <div className="bg-blue-50 rounded-xl px-3 py-2 text-center">
          <p className="text-lg font-black text-blue-700">${weekly.totalEarnings.toFixed(2)}</p>
          <p className="text-[9px] text-blue-600 font-medium">This Week</p>
          <p className="text-[8px] text-slate-500">{weekly.tripsCompleted} trips</p>
        </div>
      </div>

      <div className="px-4 py-3 border-t border-slate-100 grid grid-cols-3 gap-2">
        <div className="text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Truck size={10} className="text-slate-400" />
            <span className="text-[10px] text-slate-500">Miles</span>
          </div>
          <p className="text-xs font-semibold text-slate-900">{weekly.totalMiles.toFixed(1)}</p>
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Clock size={10} className="text-slate-400" />
            <span className="text-[10px] text-slate-500">Hours</span>
          </div>
          <p className="text-xs font-semibold text-slate-900">{weekly.totalHours.toFixed(1)}</p>
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <TrendingUp size={10} className="text-slate-400" />
            <span className="text-[10px] text-slate-500">Avg/Trip</span>
          </div>
          <p className="text-xs font-semibold text-slate-900">${weekly.avgEarningsPerTrip.toFixed(2)}</p>
        </div>
      </div>
    </div>
  );
});

export default DriverEarningsCard;
