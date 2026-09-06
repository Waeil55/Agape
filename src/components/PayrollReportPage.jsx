import { useState, useMemo, useCallback } from 'react';
import { Clock, DollarSign, AlertTriangle, Download, Calendar, ChevronDown, ChevronUp, Shield, Play, FileText, TrendingUp, Navigation } from 'lucide-react';
import { buildTimeEvents, generatePayrollOutput, POLICY_MODES } from '../utils/timeTracking';
import { localCalendarYmd, tripCalendarDateKey } from '../utils/tripDate';
import { getDriverTelemetryBreadcrumbs } from '../utils/driverTelemetry';
import { eventMatchesPayrollServiceDate, tripMatchesPayrollServiceDate } from '../utils/portalSelectors';

const fmt = (min) => {
  if (!min && min !== 0) return '--';
  const h = Math.floor(min / 60); const m = Math.round(min % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};
const fmtTime = (iso) => {
  if (!iso) return '--';
  try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch { return '--'; }
};

const fmtCurrency = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);

const POLICY_LABELS = {
  [POLICY_MODES.PAY_FROM_HOME]: 'Pay from Home',
  [POLICY_MODES.PAY_FROM_FIRST_PICKUP]: 'Pay from 1st Pickup',
  [POLICY_MODES.SMART_MODE]: 'Smart Mode',
};

const gapColor = (c) => ({
  WORK_WAITING: 'bg-emerald-100 text-emerald-800',
  NEEDS_REVIEW: 'bg-amber-100 text-amber-800',
  VERIFIED_PERSONAL: 'bg-blue-100 text-blue-800',
}[c] || 'bg-slate-100 text-slate-700');



export default function PayrollReportPage({ drivers = [], trips = [], driverTelemetry = [], timeTrackingDeclarations = [], policyMode = POLICY_MODES.SMART_MODE, onPolicyChange }) {
  const [selectedDate, setSelectedDate] = useState(localCalendarYmd());
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
        const matchDate = tripMatchesPayrollServiceDate(t, selectedDate);
        const matchDriver = t.driverId === driver.id || (t.driverEmail && t.driverEmail.toLowerCase() === (driver.email || '').toLowerCase());
        return matchDate && matchDriver;
      });
      const driverKeys = new Set([driver.id, driver.driverId, driver.uid, driver.email].filter(Boolean).map((value) => String(value).trim().toLowerCase()));
      const immutableDeclarations = timeTrackingDeclarations.filter((event) => [event?.driverId, event?.driverEmail, event?.email, event?.userId]
        .filter(Boolean).map((value) => String(value).trim().toLowerCase()).some((value) => driverKeys.has(value)));
      const clockEvts = [...(driver.clockEvents || []), ...immutableDeclarations]
        .filter((event) => eventMatchesPayrollServiceDate(event, selectedDate));
      const timeData = buildTimeEvents(driverTrips, driver, clockEvts, policyMode, {
        date: selectedDate,
        breadcrumbs: getDriverTelemetryBreadcrumbs(driverTelemetry, driver, selectedDate),
        automaticShift: true,
      });
      const payroll = generatePayrollOutput(timeData, Number(driver.hourlyRate || 0));
      return { driver, timeData, payroll, driverTrips, clockEvts, approvalEligible: timeData.approvalEligible };
    });
  }, [filtered, trips, driverTelemetry, timeTrackingDeclarations, selectedDate, policyMode]);

  const totals = useMemo(() => ({
    billableMin: reportData.filter(r => r.approvalEligible).reduce((s, r) => s + (r.payroll.payTime?.billableMinutes || 0), 0),
    totalPay: reportData.filter(r => r.approvalEligible).reduce((s, r) => s + (r.payroll.payTime?.totalPay || 0), 0),
    trips: reportData.reduce((s, r) => s + r.driverTrips.length, 0),
    gaps: reportData.reduce((s, r) => s + (r.timeData.gapLog?.length || 0), 0),
    abuse: reportData.filter(r => r.timeData.abuse?.suspicious).length,
  }), [reportData]);

  const hasUnscopedSourceRecords = useMemo(() => {
    if (!selectedDate) return false;
    const invalidTrip = trips.some((trip) => {
      const hasDeclaredServiceDate = trip?.date !== undefined && trip?.date !== null && trip?.date !== '';
      const sourceDate = hasDeclaredServiceDate
        ? trip.date
        : (trip?.arrivalTime ?? trip?.startedAt ?? trip?.completedAt);
      return !tripCalendarDateKey(sourceDate);
    });
    if (invalidTrip) return true;
    return timeTrackingDeclarations.some((event) => !tripCalendarDateKey(event?.timestamp ?? event?.at ?? event?.time));
  }, [selectedDate, timeTrackingDeclarations, trips]);

  const exportCSV = useCallback(() => {
    if (hasUnscopedSourceRecords) return;
    const rows = [['Driver', 'Email', 'Date', 'Policy', 'Approval', 'Clock In', 'Clock Out', 'Billable Hrs', 'Break Min', 'Trips', 'Verified Personal Min', 'Review Gaps', 'Regular Pay', 'Overtime Pay', 'Total Pay', 'Integrity Signals']];
    reportData.forEach(({ driver, payroll, timeData }) => {
      const pt = payroll.payTime;
      const excludedMin = (timeData.gapLog || []).filter(g => g.payrollEffect === 'EXCLUDED').reduce((s, g) => s + (g.durationMinutes || 0), 0);
      const approved = timeData.approvalEligible;
      rows.push([
        driver.name || '', driver.email || '', selectedDate, POLICY_LABELS[policyMode] || policyMode,
        approved ? 'Approved' : 'Needs review',
        fmtTime(timeData.sessions?.[0]?.clockInTime),
        fmtTime(timeData.sessions?.[timeData.sessions.length - 1]?.clockOutTime),
        approved ? (pt?.billableHours || 0).toFixed(2) : '', Math.round(payroll.sessionBreakdown?.reduce((s, b) => s + (b.breakMinutes || 0), 0) || 0),
        timeData.trips?.length || 0, Math.round(excludedMin), timeData.reviewRequiredGaps?.length || 0,
        approved ? (pt?.regularPay || 0).toFixed(2) : '', approved ? (pt?.overtimePay || 0).toFixed(2) : '', approved ? (pt?.totalPay || 0).toFixed(2) : '',
        (timeData.abuse?.flags || []).join('; '),
      ]);
    });
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `payroll_${selectedDate}.csv`; a.click();
  }, [hasUnscopedSourceRecords, reportData, selectedDate, policyMode]);

  const toggle = (id) => setExpandedDriver(prev => prev === id ? null : id);
  const toggleSect = (id, sect) => setExpandedSection(prev => ({ ...prev, [`${id}_${sect}`]: !prev[`${id}_${sect}`] }));

  return (
    <div className="min-h-0 flex-1 text-slate-900 pb-24 max-md:[&_button]:min-h-11">
      <div role="toolbar" aria-label="Payroll report controls" data-testid="payroll-toolbar" className="grid grid-cols-2 gap-2 border-b border-slate-200 bg-white px-3 py-2 sm:flex sm:flex-nowrap sm:items-center sm:px-4">
        <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
          aria-label="Payroll service date" className="h-9 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-900 focus:border-indigo-400 focus:outline-none sm:w-[126px] sm:shrink-0" />
        <select value={selectedDriverId} onChange={e => setSelectedDriverId(e.target.value)}
          aria-label="Payroll driver" className="h-9 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-900 focus:border-indigo-400 focus:outline-none sm:w-[130px] sm:shrink-0">
          <option value="ALL">All Drivers</option>
          {drivers.map(d => <option key={d.id} value={d.id}>{d.name || d.email}</option>)}
        </select>
        <select value={policyMode} onChange={e => onPolicyChange?.(e.target.value)}
          aria-label="Payroll policy" className="h-9 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-900 focus:border-indigo-400 focus:outline-none sm:w-[150px] sm:shrink-0">
          {Object.entries(POLICY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search driver..."
          aria-label="Search payroll drivers" className="h-9 w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-900 placeholder-slate-400 focus:border-indigo-400 focus:outline-none sm:!min-w-[100px] sm:flex-1" />
        <button onClick={exportCSV} disabled={hasUnscopedSourceRecords} title={hasUnscopedSourceRecords ? 'Export blocked: one or more source records has no valid service date.' : 'Export payroll CSV'} className="col-span-2 inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-3 text-xs font-bold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-300 sm:col-span-1 sm:shrink-0">
          <Download size={13} /> Export CSV
        </button>
      </div>

      <div className="px-3 py-2 sm:px-4">
        <div className="app-summary-strip" aria-label="Payroll summary" data-testid="payroll-summary">
          <div className="app-summary-metrics">
        {[
          { label: 'Billable', value: fmt(totals.billableMin), icon: <Clock size={14} />, color: 'text-indigo-700' },
          { label: 'Total Pay', value: fmtCurrency(totals.totalPay), icon: <DollarSign size={14} />, color: 'text-emerald-700' },
          { label: 'Trips', value: totals.trips, icon: <Navigation size={14} />, color: 'text-blue-700' },
          { label: 'Gap Events', value: totals.gaps, icon: <TrendingUp size={14} />, color: 'text-amber-700' },
          { label: 'Abuse Flags', value: totals.abuse, icon: <Shield size={14} />, color: totals.abuse > 0 ? 'text-red-700' : 'text-slate-600' },
        ].filter((item) => item.label !== 'Abuse Flags' || item.value > 0).map(c => (
          <span key={c.label} className={`app-summary-item ${c.label === 'Abuse Flags' ? 'app-summary-item--danger' : ''}`}>
            <span className={c.color}>{c.icon}</span><strong>{c.value}</strong> {c.label.toLowerCase()}
          </span>
        ))}
          </div>
        </div>
      </div>

      {/* Driver Cards */}
      <div className="px-3 sm:px-4 pb-24 space-y-3">
        {reportData.length === 0 && (
          <div className="text-center py-12 text-slate-500">
            <Calendar size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">No payroll data for this date.</p>
          </div>
        )}
        {reportData.map(({ driver, payroll, timeData, approvalEligible }) => {
          const pt = payroll.payTime;
          const isExpanded = expandedDriver === driver.id;
          const sessions = payroll.sessionBreakdown || [];
          const gaps = timeData.gapLog || [];
          const abuseFl = timeData.abuse?.flags || [];
          const hasAbuse = abuseFl.length > 0;
          const excludedMin = gaps.filter(g => g.payrollEffect === 'EXCLUDED').reduce((s, g) => s + (g.durationMinutes || 0), 0);

          return (
            <div key={driver.id} className={`rounded-xl border transition-all shadow-sm ${hasAbuse ? 'border-red-200 bg-red-50/70' : 'border-slate-200 bg-white'}`}>
              {/* Driver Header */}
              <button onClick={() => toggle(driver.id)} className="w-full flex items-center justify-between p-4 text-left">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${hasAbuse ? 'bg-red-600' : 'bg-indigo-600'}`}>
                    {(driver.name || driver.email || '?')[0].toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{driver.name || driver.email}</span>
                      {hasAbuse && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500 text-white">? ABUSE FLAG</span>}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                      <span className="flex items-center gap-1"><Clock size={10} />{approvalEligible ? fmt(pt?.billableMinutes) : 'Review required'}</span>
                      <span>·</span>
                      <span className={`flex items-center gap-1 ${approvalEligible ? 'text-emerald-600' : 'text-amber-600'}`}><DollarSign size={10} />{approvalEligible ? fmtCurrency(pt?.totalPay) : 'Not approved'}</span>
                      {driver.hourlyRate && <span className="text-slate-500">@ ${Number(driver.hourlyRate).toFixed(2)}/hr</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right hidden sm:block">
                    <div className="text-xs text-slate-500">{POLICY_LABELS[policyMode]}</div>
                    {pt?.overtimeHours > 0 && <div className="text-xs text-amber-600">{pt.overtimeHours}h OT</div>}
                  </div>
                  {isExpanded ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-slate-200 p-4 space-y-4">
                  {/* Pay Summary */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {[
                      { label: 'Regular', value: `${pt?.regularHours || 0}h`, sub: fmtCurrency(pt?.regularPay) },
                      { label: 'Overtime', value: `${pt?.overtimeHours || 0}h`, sub: fmtCurrency(pt?.overtimePay) },
                      { label: 'Total', value: fmtCurrency(pt?.totalPay), sub: `${fmt(pt?.billableMinutes)} billable` },
                    ].map(c => (
                      <div key={c.label} className="bg-slate-50 rounded-xl p-3 text-center">
                        <div className="text-[10px] text-slate-500 uppercase tracking-wide">{c.label}</div>
                        <div className="text-base font-semibold mt-1">{c.value}</div>
                        <div className="text-xs text-slate-500">{c.sub}</div>
                      </div>
                    ))}
                  </div>

                  {/* Admin Notes */}
                  {payroll.adminNotes?.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                      <div className="text-xs font-semibold text-amber-700 mb-1 flex items-center gap-1"><FileText size={12} /> Admin Notes</div>
                      {payroll.adminNotes.map((n, i) => <p key={i} className="text-xs text-amber-800">{n}</p>)}
                    </div>
                  )}

                  {/* Sessions Breakdown */}
                  <div>
                    <button onClick={() => toggleSect(driver.id, 'sessions')} className="w-full flex items-center justify-between text-xs font-semibold text-slate-700 mb-2">
                      <span className="flex items-center gap-1"><Play size={11} /> Sessions ({sessions.length})</span>
                      {expandedSection[`${driver.id}_sessions`] ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </button>
                    {expandedSection[`${driver.id}_sessions`] && sessions.map((s, i) => (
                      <div key={i} className="bg-slate-50 rounded-xl p-3 mb-2 text-xs">
                        <div className="flex justify-between mb-1">
                          <span className="text-slate-600">{fmtTime(s.clockIn)} ? {s.clockOut === 'OPEN' ? <span className="text-green-600">OPEN</span> : fmtTime(s.clockOut)}</span>
                          <span className="font-semibold text-indigo-600">{fmt(s.billableMinutes)} billable</span>
                        </div>
                        <div className="flex gap-3 text-slate-500">
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
                      <button onClick={() => toggleSect(driver.id, 'gaps')} className="w-full flex items-center justify-between text-xs font-semibold text-slate-700 mb-2">
                        <span className="flex items-center gap-1"><TrendingUp size={11} /> Gap Log ({gaps.length}) · {fmt(excludedMin)} excluded</span>
                        {expandedSection[`${driver.id}_gaps`] ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      </button>
                      {expandedSection[`${driver.id}_gaps`] && gaps.map((g, i) => (
                        <div key={i} className="flex items-center justify-between bg-slate-50 rounded-xl p-2.5 mb-1.5 text-xs">
                          <div>
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold mr-2 ${gapColor(g.classification)}`}>{g.classification}</span>
                            <span className="text-slate-500">{fmtTime(g.startTime)} ? {fmtTime(g.endTime)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-slate-700">{fmt(g.durationMinutes)}</span>
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
                    <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                      <div className="text-xs font-semibold text-red-700 mb-2 flex items-center gap-1"><Shield size={12} /> Anti-Abuse Flags</div>
                      {abuseFl.map((f, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs text-red-700 mb-1">
                          <AlertTriangle size={11} /> {f}
                          {timeData.abuse?.details && <span className="text-slate-500 ml-1">{JSON.stringify(timeData.abuse.details).slice(0, 60)}</span>}
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
