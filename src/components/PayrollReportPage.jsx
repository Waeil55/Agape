import React, { useState, useMemo, useCallback } from 'react';
import {
  Clock, DollarSign, AlertTriangle, CheckCircle, XCircle, Download,
  User, Calendar, ChevronDown, ChevronUp, Shield, MapPin, Play, Pause,
  FileText, TrendingUp, Filter, RefreshCw, Home, Navigation, Zap, Eye
} from 'lucide-react';
import { buildTimeEvents, generatePayrollOutput, POLICY_MODES, GAP_CLASSIFICATIONS } from '../utils/timeTracking';

const fmt = (min) => {
  if (!min && min !== 0) return '--';
  const h = Math.floor(min / 60); const m = Math.round(min % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};
const fmtTime = (iso) => {
  if (!iso) return '--';
  try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch { return '--'; }
};
const fmtDate = (iso) => {
  if (!iso) return '--';
  try { return new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }); } catch { return iso; }
};
const fmtCurrency = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);

const POLICY_LABELS = {
  [POLICY_MODES.PAY_FROM_HOME]: 'Pay from Home',
  [POLICY_MODES.PAY_FROM_FIRST_PICKUP]: 'Pay from 1st Pickup',
  [POLICY_MODES.SMART_MODE]: 'Smart Mode',
};

const gapColor = (c) => ({
  SHORT: 'bg-emerald-100 text-emerald-800',
  MEDIUM: 'bg-amber-100 text-amber-800',
  LONG: 'bg-red-100 text-red-800',
}[c] || 'bg-slate-100 text-slate-700');

const abuseColor = (f) => f.length > 0 ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200';

export default function PayrollReportPage({ drivers = [], trips = [], policyMode = POLICY_MODES.SMART_MODE, onPolicyChange }) {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [selectedDriverId, setSelectedDriverId] = useState('ALL');
  const [expandedDriver, setExpandedDriver] = useState(null);
  const [expandedSection, setExpandedSection] = useState({});
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    let list = drivers.filter(d => d.id);
    if (selectedDriverId !== 'ALL') list = list.filter(d => d.id === selectedDriverId);
    if (search) { const s = search.toLowerCase(); list = list.filter(d => (d.name || d.email || '').toLowerCase().includes(s)); }
    return list;
  }, [drivers, selectedDriverId, search]);

  const reportData = useMemo(() => {
    return filtered.map(driver => {
      const driverTrips = trips.filter(t => {
        const dateKey = t.date || (t.arrivalTime || t.startedAt || t.completedAt || '').slice(0, 10);
        const matchDate = !selectedDate || dateKey === selectedDate;
        const matchDriver = t.driverId === driver.id || (t.driverEmail && t.driverEmail.toLowerCase() === (driver.email || '').toLowerCase());
        return matchDate && matchDriver;
      });
      const clockEvts = (driver.clockEvents || []).filter(e => {
        const d = (e.timestamp || e.at || e.time || '').slice(0, 10);
        return !selectedDate || d === selectedDate;
      });
      const timeData = buildTimeEvents(driverTrips, driver, clockEvts, policyMode, { date: selectedDate, breadcrumbs: driver.breadcrumbs || [] });
      const payroll = generatePayrollOutput(timeData, Number(driver.hourlyRate || 0));
      return { driver, timeData, payroll, driverTrips, clockEvts };
    });
  }, [filtered, trips, selectedDate, policyMode]);

  const totals = useMemo(() => ({
    billableMin: reportData.reduce((s, r) => s + (r.payroll.payTime?.billableMinutes || 0), 0),
    totalPay: reportData.reduce((s, r) => s + (r.payroll.payTime?.totalPay || 0), 0),
    trips: reportData.reduce((s, r) => s + r.driverTrips.length, 0),
    gaps: reportData.reduce((s, r) => s + (r.timeData.gapLog?.length || 0), 0),
    abuse: reportData.filter(r => r.timeData.abuse?.suspicious).length,
  }), [reportData]);

  const exportCSV = useCallback(() => {
    const rows = [['Driver', 'Email', 'Date', 'Policy', 'Clock In', 'Clock Out', 'Billable Hrs', 'Break Min', 'Trips', 'Gaps Excluded Min', 'Regular Pay', 'Overtime Pay', 'Total Pay', 'Abuse Flags']];
    reportData.forEach(({ driver, payroll, timeData }) => {
      const pt = payroll.payTime;
      const excludedMin = (timeData.gapLog || []).filter(g => g.payrollEffect === 'EXCLUDED').reduce((s, g) => s + (g.durationMinutes || 0), 0);
      rows.push([
        driver.name || '', driver.email || '', selectedDate, POLICY_LABELS[policyMode] || policyMode,
        fmtTime(timeData.sessions?.[0]?.clockInTime),
        fmtTime(timeData.sessions?.[timeData.sessions.length - 1]?.clockOutTime),
        (pt?.billableHours || 0).toFixed(2), Math.round(payroll.sessionBreakdown?.reduce((s, b) => s + (b.breakMinutes || 0), 0) || 0),
        timeData.trips?.length || 0, Math.round(excludedMin),
        (pt?.regularPay || 0).toFixed(2), (pt?.overtimePay || 0).toFixed(2), (pt?.totalPay || 0).toFixed(2),
        (timeData.abuse?.flags || []).join('; '),
      ]);
    });
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `payroll_${selectedDate}.csv`; a.click();
  }, [reportData, selectedDate, policyMode]);

  const toggle = (id) => setExpandedDriver(prev => prev === id ? null : id);
  const toggleSect = (id, sect) => setExpandedSection(prev => ({ ...prev, [`${id}_${sect}`]: !prev[`${id}_${sect}`] }));

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif" }} className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white">
      {/* Header */}
      <div className="px-4 pt-6 pb-4">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-indigo-500 flex items-center justify-center"><DollarSign size={16} /></div>
            <h1 className="text-lg font-bold">Payroll Report</h1>
          </div>
          <button onClick={exportCSV} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold transition-colors">
            <Download size={13} /> Export CSV
          </button>
        </div>
        <p className="text-xs text-slate-400 ml-10">Event-driven · GPS-verified · Audit-logged</p>
      </div>

      {/* Filters */}
      <div className="px-4 pb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
          className="col-span-1 px-3 py-2 rounded-xl bg-white/10 border border-white/10 text-sm text-white focus:outline-none focus:border-indigo-400" />
        <select value={selectedDriverId} onChange={e => setSelectedDriverId(e.target.value)}
          className="col-span-1 px-3 py-2 rounded-xl bg-white/10 border border-white/10 text-sm text-white focus:outline-none focus:border-indigo-400">
          <option value="ALL">All Drivers</option>
          {drivers.map(d => <option key={d.id} value={d.id}>{d.name || d.email}</option>)}
        </select>
        <select value={policyMode} onChange={e => onPolicyChange?.(e.target.value)}
          className="col-span-1 px-3 py-2 rounded-xl bg-white/10 border border-white/10 text-sm text-white focus:outline-none focus:border-indigo-400">
          {Object.entries(POLICY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search driver..."
          className="col-span-1 px-3 py-2 rounded-xl bg-white/10 border border-white/10 text-sm text-white placeholder-slate-400 focus:outline-none focus:border-indigo-400" />
      </div>

      {/* Summary Cards */}
      <div className="px-4 pb-4 grid grid-cols-2 sm:grid-cols-5 gap-2">
        {[
          { label: 'Billable', value: fmt(totals.billableMin), icon: <Clock size={14} />, color: 'text-indigo-300' },
          { label: 'Total Pay', value: fmtCurrency(totals.totalPay), icon: <DollarSign size={14} />, color: 'text-emerald-300' },
          { label: 'Trips', value: totals.trips, icon: <Navigation size={14} />, color: 'text-blue-300' },
          { label: 'Gap Events', value: totals.gaps, icon: <TrendingUp size={14} />, color: 'text-amber-300' },
          { label: 'Abuse Flags', value: totals.abuse, icon: <Shield size={14} />, color: totals.abuse > 0 ? 'text-red-300' : 'text-slate-400' },
        ].map(c => (
          <div key={c.label} className="bg-white/5 border border-white/10 rounded-2xl p-3">
            <div className={`flex items-center gap-1 text-xs mb-1 ${c.color}`}>{c.icon}<span>{c.label}</span></div>
            <div className="text-base font-bold text-white">{c.value}</div>
          </div>
        ))}
      </div>

      {/* Driver Cards */}
      <div className="px-4 pb-8 space-y-3">
        {reportData.length === 0 && (
          <div className="text-center py-12 text-slate-400">
            <Calendar size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">No payroll data for this date.</p>
          </div>
        )}
        {reportData.map(({ driver, payroll, timeData }) => {
          const pt = payroll.payTime;
          const isExpanded = expandedDriver === driver.id;
          const sessions = payroll.sessionBreakdown || [];
          const gaps = timeData.gapLog || [];
          const abuseFl = timeData.abuse?.flags || [];
          const hasAbuse = abuseFl.length > 0;
          const excludedMin = gaps.filter(g => g.payrollEffect === 'EXCLUDED').reduce((s, g) => s + (g.durationMinutes || 0), 0);

          return (
            <div key={driver.id} className={`rounded-2xl border transition-all ${hasAbuse ? 'border-red-500/40 bg-red-900/10' : 'border-white/10 bg-white/5'}`}>
              {/* Driver Header */}
              <button onClick={() => toggle(driver.id)} className="w-full flex items-center justify-between p-4 text-left">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${hasAbuse ? 'bg-red-600' : 'bg-indigo-600'}`}>
                    {(driver.name || driver.email || '?')[0].toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{driver.name || driver.email}</span>
                      {hasAbuse && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500 text-white">⚠ ABUSE FLAG</span>}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                      <span className="flex items-center gap-1"><Clock size={10} />{fmt(pt?.billableMinutes)}</span>
                      <span>·</span>
                      <span className="flex items-center gap-1 text-emerald-300"><DollarSign size={10} />{fmtCurrency(pt?.totalPay)}</span>
                      {driver.hourlyRate && <span className="text-slate-500">@ ${Number(driver.hourlyRate).toFixed(2)}/hr</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right hidden sm:block">
                    <div className="text-xs text-slate-400">{POLICY_LABELS[policyMode]}</div>
                    {pt?.overtimeHours > 0 && <div className="text-xs text-amber-300">{pt.overtimeHours}h OT</div>}
                  </div>
                  {isExpanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-white/10 p-4 space-y-4">
                  {/* Pay Summary */}
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'Regular', value: `${pt?.regularHours || 0}h`, sub: fmtCurrency(pt?.regularPay) },
                      { label: 'Overtime', value: `${pt?.overtimeHours || 0}h`, sub: fmtCurrency(pt?.overtimePay) },
                      { label: 'Total', value: fmtCurrency(pt?.totalPay), sub: `${fmt(pt?.billableMinutes)} billable` },
                    ].map(c => (
                      <div key={c.label} className="bg-white/5 rounded-xl p-3 text-center">
                        <div className="text-[10px] text-slate-400 uppercase tracking-wide">{c.label}</div>
                        <div className="text-base font-bold mt-1">{c.value}</div>
                        <div className="text-xs text-slate-400">{c.sub}</div>
                      </div>
                    ))}
                  </div>

                  {/* Admin Notes */}
                  {payroll.adminNotes?.length > 0 && (
                    <div className="bg-amber-900/20 border border-amber-500/30 rounded-xl p-3">
                      <div className="text-xs font-semibold text-amber-300 mb-1 flex items-center gap-1"><FileText size={12} /> Admin Notes</div>
                      {payroll.adminNotes.map((n, i) => <p key={i} className="text-xs text-amber-200">{n}</p>)}
                    </div>
                  )}

                  {/* Sessions Breakdown */}
                  <div>
                    <button onClick={() => toggleSect(driver.id, 'sessions')} className="w-full flex items-center justify-between text-xs font-semibold text-slate-300 mb-2">
                      <span className="flex items-center gap-1"><Play size={11} /> Sessions ({sessions.length})</span>
                      {expandedSection[`${driver.id}_sessions`] ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </button>
                    {expandedSection[`${driver.id}_sessions`] && sessions.map((s, i) => (
                      <div key={i} className="bg-white/5 rounded-xl p-3 mb-2 text-xs">
                        <div className="flex justify-between mb-1">
                          <span className="text-slate-300">{fmtTime(s.clockIn)} → {s.clockOut === 'OPEN' ? <span className="text-green-400">OPEN</span> : fmtTime(s.clockOut)}</span>
                          <span className="font-semibold text-indigo-300">{fmt(s.billableMinutes)} billable</span>
                        </div>
                        <div className="flex gap-3 text-slate-400">
                          <span>Total: {fmt(s.totalMinutes)}</span>
                          <span>Break: {fmt(s.breakMinutes)}</span>
                          <span>Excl: {fmt(s.excludedGapMinutes)}</span>
                          <span>Trips: {s.tripCount}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Gap Log */}
                  {gaps.length > 0 && (
                    <div>
                      <button onClick={() => toggleSect(driver.id, 'gaps')} className="w-full flex items-center justify-between text-xs font-semibold text-slate-300 mb-2">
                        <span className="flex items-center gap-1"><TrendingUp size={11} /> Gap Log ({gaps.length}) · {fmt(excludedMin)} excluded</span>
                        {expandedSection[`${driver.id}_gaps`] ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      </button>
                      {expandedSection[`${driver.id}_gaps`] && gaps.map((g, i) => (
                        <div key={i} className="flex items-center justify-between bg-white/5 rounded-xl p-2.5 mb-1.5 text-xs">
                          <div>
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold mr-2 ${gapColor(g.classification)}`}>{g.classification}</span>
                            <span className="text-slate-400">{fmtTime(g.startTime)} → {fmtTime(g.endTime)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-slate-300">{fmt(g.durationMinutes)}</span>
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${g.payrollEffect === 'EXCLUDED' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                              {g.payrollEffect}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Abuse / Anti-fraud flags */}
                  {hasAbuse && (
                    <div className="bg-red-900/20 border border-red-500/40 rounded-xl p-3">
                      <div className="text-xs font-semibold text-red-300 mb-2 flex items-center gap-1"><Shield size={12} /> Anti-Abuse Flags</div>
                      {abuseFl.map((f, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs text-red-200 mb-1">
                          <AlertTriangle size={11} /> {f}
                          {timeData.abuse?.details && <span className="text-slate-400 ml-1">{JSON.stringify(timeData.abuse.details).slice(0, 60)}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
