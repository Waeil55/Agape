import React from 'react';
import { Star, TrendingUp, TrendingDown, CheckCircle2, Clock, Truck, Shield, Zap } from 'lucide-react';
import { calculateDriverScore, calculateDriverWeeklyStats, formatScore, TIER_COLORS } from '../utils/driverScore';

export default function DriverPerformanceCard({ driver, trips = [], compact = false }) {
  const score = calculateDriverScore(driver, trips);
  const weekly = calculateDriverWeeklyStats(driver, trips);
  const tierInfo = TIER_COLORS[score.tier] || TIER_COLORS.bronze;

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black ${tierInfo.bg} ${tierInfo.text}`}>
          {score.overall}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1">
            <Star size={10} className="text-amber-500 fill-amber-500" />
            <span className="text-[11px] font-bold text-slate-900">{score.overall}/100</span>
            <span className={`px-1 py-0.5 rounded text-[8px] font-bold ${tierInfo.bg} ${tierInfo.text}`}>{tierInfo.label}</span>
          </div>
          <p className="text-[9px] text-slate-500">{score.totalTrips} trips · {score.onTimeRate}% on-time</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-lg font-black ${tierInfo.bg} ${tierInfo.text} border ${tierInfo.border}`}>
              {score.overall}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <Star size={14} className="text-amber-500 fill-amber-500" />
                <span className="text-base font-black text-slate-900">{score.overall}/100</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${tierInfo.bg} ${tierInfo.text}`}>{tierInfo.label}</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">{formatScore(score.overall)} · {score.totalTrips} total trips</p>
            </div>
          </div>
        </div>
      </div>

      {/* Score Breakdown */}
      <div className="px-4 py-3 grid grid-cols-5 gap-2">
        {[
          { label: 'On-Time', value: score.onTimeRate, icon: Clock, color: 'text-blue-600' },
          { label: 'Completion', value: score.completionRate, icon: CheckCircle2, color: 'text-emerald-600' },
          { label: 'Acceptance', value: score.acceptanceRate, icon: Zap, color: 'text-amber-600' },
          { label: 'Safety', value: score.breakdown.safety, icon: Shield, color: 'text-purple-600' },
          { label: 'Efficiency', value: score.breakdown.efficiency, icon: Truck, color: 'text-cyan-600' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="text-center">
            <div className={`w-8 h-8 mx-auto rounded-lg bg-slate-50 flex items-center justify-center mb-1`}>
              <Icon size={14} className={color} />
            </div>
            <p className="text-xs font-black text-slate-900">{value}%</p>
            <p className="text-[9px] text-slate-500">{label}</p>
          </div>
        ))}
      </div>

      {/* Weekly Stats */}
      <div className="px-4 py-3 border-t border-slate-100 grid grid-cols-4 gap-2">
        {[
          { label: 'This Week', value: weekly.tripsCompleted, suffix: 'trips' },
          { label: 'Miles', value: weekly.totalMiles, suffix: 'mi' },
          { label: 'Hours', value: weekly.totalHours, suffix: 'hrs' },
          { label: 'Avg/Day', value: weekly.avgTripsPerDay, suffix: 'trips' },
        ].map(({ label, value, suffix }) => (
          <div key={label} className="text-center bg-slate-50 rounded-xl px-2 py-2">
            <p className="text-sm font-black text-slate-900">{value}</p>
            <p className="text-[9px] text-slate-500">{suffix}</p>
            <p className="text-[8px] text-slate-400 mt-0.5">{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
