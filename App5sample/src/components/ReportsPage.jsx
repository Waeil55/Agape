import React, { useState, useMemo } from 'react';
import { BarChart3, Download, Filter, FileText, Calendar, X, Award, CheckCircle2, AlertTriangle, MapPin, Phone, MessageSquare } from 'lucide-react';

const Badge = ({ children, variant = 'info' }) => {
  const variants = { success: "bg-emerald-50 text-emerald-700 border-emerald-100", warning: "bg-amber-50 text-amber-700 border-amber-100", info: "bg-blue-50 text-blue-700 border-blue-100", danger: "bg-rose-50 text-rose-700 border-rose-100" };
  return <span className={`px-2 py-0.5 rounded-full text-[9px] font-black border uppercase tracking-widest whitespace-nowrap ${variants[variant]}`}>{children}</span>;
};

const today = new Date().toISOString().split('T')[0];
const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];

const ReportsPage = ({ trips = [], drivers = [] }) => {
  const [startDate, setStartDate] = useState(weekAgo);
  const [endDate, setEndDate] = useState(today);
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [driverFilter, setDriverFilter] = useState('all');
  const [selectedTrip, setSelectedTrip] = useState(null);
  const [view, setView] = useState('summary'); // 'summary' or 'manifest'

  const uniqueTypes = useMemo(() => [...new Set(trips.map(t => t.type).filter(Boolean))], [trips]);

  const filteredTrips = useMemo(() => {
    return trips.filter(t => {
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (typeFilter !== 'all' && t.type !== typeFilter) return false;
      if (driverFilter !== 'all' && t.driverId !== driverFilter) return false;
      if (startDate || endDate) {
        const d = t.date || '';
        if (startDate && d < startDate) return false;
        if (endDate && d > endDate) return false;
      }
      return true;
    }).sort((a, b) => {
      // Sort by date first
      if (a.date !== b.date) return (a.date || '').localeCompare(b.date || '');
      
      // Then by time
      const timeToMinutes = (t) => {
        if (!t) return 1440;
        const cleanTime = String(t).toUpperCase().trim();
        if (cleanTime === 'WILL CALL' || cleanTime === 'WC') return 1440;
        const m = cleanTime.match(/(\d{1,2})(?::(\d{1,2}))?\s*(AM|PM)?/);
        if (!m) return 1440;
        let h = parseInt(m[1], 10);
        let min = parseInt(m[2] || '0', 10);
        const p = m[3];
        if (p === 'PM' && h < 12) h += 12;
        if (p === 'AM' && h === 12) h = 0;
        return h * 60 + min;
      };
      
      const ta = timeToMinutes(a.time);
      const tb = timeToMinutes(b.time);
      if (ta !== tb) return ta - tb;
      return (a.patient || '').localeCompare(b.patient || '');
    });
  }, [trips, startDate, endDate, statusFilter, typeFilter, driverFilter]);

  const stats = useMemo(() => {
    const total = filteredTrips.length;
    const unassigned = filteredTrips.filter(t => t.status === 'Unassigned').length;
    const assigned = filteredTrips.filter(t => t.status === 'Assigned').length;
    const willCall = filteredTrips.filter(t => t.time === 'Will Call').length;
    const completed = filteredTrips.filter(t => t.status === 'Completed').length;
    const noDates = filteredTrips.filter(t => !t.date).length;
    const noShow = filteredTrips.filter(t => t.status === 'No Show').length;

    const byType = {};
    filteredTrips.forEach(t => { byType[t.type] = (byType[t.type] || 0) + 1; });

    const byDriver = {};
    filteredTrips.forEach(t => {
      if (t.driverId) {
        const name = drivers.find(d => d.id === t.driverId)?.name || t.driverId;
        if (!byDriver[name]) byDriver[name] = { total: 0, completed: 0, noShow: 0 };
        byDriver[name].total++;
        if (t.status === 'Completed') byDriver[name].completed++;
        if (t.status === 'No Show') byDriver[name].noShow++;
      }
    });

    const byDate = {};
    filteredTrips.forEach(t => {
      const d = t.date || 'No Date';
      byDate[d] = (byDate[d] || 0) + 1;
    });
    const sortedDates = Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b));

    return { total, unassigned, assigned, willCall, completed, noDates, noShow, byType, byDriver, sortedDates };
  }, [filteredTrips, drivers]);

  const driverPerformance = useMemo(() => {
    return Object.entries(stats.byDriver).map(([name, data]) => {
      const completionRate = data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0;
      const noShowRate = data.total > 0 ? Math.round((data.noShow / data.total) * 100) : 0;
      return { name, ...data, completionRate, noShowRate };
    }).sort((a, b) => b.completionRate - a.completionRate);
  }, [stats.byDriver]);

  const resetFilters = () => {
    setStartDate('');
    setEndDate('');
    setStatusFilter('all');
    setTypeFilter('all');
    setDriverFilter('all');
  };

  const hasActiveFilters = startDate || endDate || statusFilter !== 'all' || typeFilter !== 'all' || driverFilter !== 'all';

  const exportCSV = () => {
    const headers = ['Date', 'Trip ID', 'Patient', 'Pickup', 'Dropoff', 'Time', 'Type', 'Pickup Phone', 'Dropoff Phone', 'Status', 'Driver', 'Notes'];
    const rows = filteredTrips.map(t => {
      const driver = drivers.find(d => d.id === t.driverId);
      return [
        t.date || '', t.id, t.patient,
        `"${(t.pickup || '').replace(/"/g, '""')}"`,
        `"${(t.dropoff || '').replace(/"/g, '""')}"`,
        t.time, t.type, t.pickupPhone || '', t.dropoffPhone || '',
        t.status, driver?.name || '', `"${(t.notes || '').replace(/"/g, '""')}"`,
      ];
    });
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trip-report-${today}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDF = async () => {
    const { default: jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    doc.setFontSize(18);
    doc.text('Agape Care - Operational Manifest', 14, 20);
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleDateString()} | Period: ${startDate || 'All'} to ${endDate || 'All'}`, 14, 28);
    
    if (view === 'manifest') {
      const manifestRows = [];
      filteredTrips.forEach(t => {
        const driver = drivers.find(d => d.id === t.driverId);
        // Pickup Row
        manifestRows.push([
          t.date, t.status, 'P', t.pickup, t.id, t.patient, 'Pickup', t.time, 
          driver?.name || '', driver?.vehicle || '', 
          t.arrivalTime ? new Date(t.arrivalTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '',
          t.departedPickupTime ? new Date(t.departedPickupTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '',
          t.pickupOdometer || '', t.pickupPhone || '', t.signature ? 'YES' : 'NO'
        ]);
        // Dropoff Row
        manifestRows.push([
          t.date, t.status, 'S', t.dropoff, t.id, t.patient, 'Dropoff', t.time, 
          driver?.name || '', driver?.vehicle || '', 
          t.arrivalDropoffTime ? new Date(t.arrivalDropoffTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '',
          t.completedAt ? new Date(t.completedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '',
          t.dropoffOdometer || '', t.dropoffPhone || '', t.signature ? 'YES' : 'NO'
        ]);
      });
      autoTable(doc, { 
        head: [['Date', 'Status', 'S', 'Address', 'ID', 'Client', 'Activity', 'Sch Time', 'Driver', 'Vehicle', 'Arr', 'Dep', 'Odo', 'Phone', 'Sign']], 
        body: manifestRows, startY: 35, styles: { fontSize: 6 }, headStyles: { fillColor: [30, 41, 59] } 
      });
    } else {
      const tableHeaders = [['Date', 'ID', 'Patient', 'Pickup', 'Dropoff', 'Time', 'Type', 'Status', 'Driver']];
      const tableRows = filteredTrips.map(t => {
        const driver = drivers.find(d => d.id === t.driverId);
        return [t.date || '', t.id, t.patient, t.pickup, t.dropoff, t.time, t.type, t.status, driver?.name || ''];
      });
      autoTable(doc, { head: tableHeaders, body: tableRows, startY: 40, styles: { fontSize: 7 }, headStyles: { fillColor: [37, 99, 235] } });
    }

    doc.save(`agapecare-report-${today}.pdf`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-0">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Reports</h2>
          <div className="flex bg-slate-100 p-1 rounded-lg w-fit">
            <button onClick={() => setView('summary')} className={`px-4 py-1.5 text-[11px] font-black uppercase tracking-widest rounded-md transition-all ${view === 'summary' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Dashboard</button>
            <button onClick={() => setView('manifest')} className={`px-4 py-1.5 text-[11px] font-black uppercase tracking-widest rounded-md transition-all ${view === 'manifest' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Daily Manifest</button>
          </div>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          {hasActiveFilters && (
            <button onClick={resetFilters} className="flex-1 sm:flex-none px-3 py-2 border border-slate-300 text-slate-700 font-semibold rounded-lg hover:bg-slate-50 flex items-center justify-center gap-2 text-sm">
              <X size={16} /> Clear
            </button>
          )}
          <button onClick={exportPDF} disabled={filteredTrips.length === 0} className="flex-1 sm:flex-none px-4 py-2 bg-rose-600 text-white font-semibold rounded-lg hover:bg-rose-700 disabled:opacity-50 flex items-center justify-center gap-2 text-sm">
            <FileText size={18} /> Export PDF
          </button>
          <button onClick={exportCSV} disabled={filteredTrips.length === 0} className="flex-1 sm:flex-none px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 text-sm">
            <Download size={18} /> CSV
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          <Filter size={16} className="text-blue-600" />
          <h3 className="text-sm font-bold text-slate-700">Filters</h3>
          <span className="text-[10px] text-slate-400">({filteredTrips.length} of {trips.length} trips match)</span>
        </div>
        <div className="flex flex-wrap gap-1.5 mb-4">
          {[
            { label: 'Today', range: () => { setStartDate(today); setEndDate(today); } },
            { label: 'This Week', range: () => { setStartDate(weekAgo); setEndDate(today); } },
            { label: 'This Month', range: () => {
              const m = new Date(); m.setDate(1);
              setStartDate(m.toISOString().split('T')[0]); setEndDate(today);
            }},
            { label: 'All Time', range: () => { setStartDate(''); setEndDate(''); } },
          ].map(p => (
            <button key={p.label} onClick={p.range}
              className={`px-3 py-1.5 text-[11px] font-bold rounded-lg border transition ${
                (!startDate && !endDate && p.label === 'All Time') ||
                (startDate === today && endDate === today && p.label === 'Today')
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
              }`}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <Calendar size={14} className="text-blue-500" /> Start Date
            </label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <Calendar size={14} className="text-blue-500" /> End Date
            </label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Status</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-blue-500">
              <option value="all">All Statuses</option>
              <option value="Unassigned">Unassigned</option>
              <option value="Assigned">Assigned</option>
              <option value="Completed">Completed</option>
              <option value="No Show">No Show</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Type</label>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-blue-500">
              <option value="all">All Types</option>
              {uniqueTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Driver</label>
            <select value={driverFilter} onChange={(e) => setDriverFilter(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-blue-500">
              <option value="all">All Drivers</option>
              <option value="unassigned">Unassigned</option>
              {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Content Switcher */}
      {view === 'summary' ? (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
            <div className="bg-white p-3 sm:p-4 rounded-xl shadow-sm border border-slate-200">
              <p className="text-[10px] sm:text-xs text-slate-600 mb-1">Filtered</p>
              <p className="text-xl sm:text-2xl font-bold text-slate-900">{stats.total}</p>
            </div>
            <div className="bg-amber-50 p-3 sm:p-4 rounded-xl shadow-sm border border-amber-200">
              <p className="text-[10px] sm:text-xs text-amber-600 mb-1">Unassigned</p>
              <p className="text-xl sm:text-2xl font-bold text-amber-700">{stats.unassigned}</p>
            </div>
            <div className="bg-emerald-50 p-3 sm:p-4 rounded-xl shadow-sm border border-emerald-200">
              <p className="text-[10px] sm:text-xs text-emerald-600 mb-1">Assigned</p>
              <p className="text-xl sm:text-2xl font-bold text-emerald-700">{stats.assigned}</p>
            </div>
            <div className="bg-blue-50 p-3 sm:p-4 rounded-xl shadow-sm border border-blue-200">
              <p className="text-[10px] sm:text-xs text-blue-600 mb-1">Will Call</p>
              <p className="text-xl sm:text-2xl font-bold text-blue-700">{stats.willCall}</p>
            </div>
            <div className="bg-indigo-50 p-3 sm:p-4 rounded-xl shadow-sm border border-indigo-200">
              <p className="text-[10px] sm:text-xs text-indigo-600 mb-1">Completed</p>
              <p className="text-xl sm:text-2xl font-bold text-indigo-700">{stats.completed}</p>
            </div>
            <div className="bg-rose-50 p-3 sm:p-4 rounded-xl shadow-sm border border-rose-200">
              <p className="text-[10px] sm:text-xs text-rose-600 mb-1">No Show</p>
              <p className="text-xl sm:text-2xl font-bold text-rose-700">{stats.noShow}</p>
            </div>
            <div className="bg-slate-50 p-3 sm:p-4 rounded-xl shadow-sm border border-slate-200">
              <p className="text-[10px] sm:text-xs text-slate-600 mb-1">No Date</p>
              <p className="text-xl sm:text-2xl font-bold text-slate-700">{stats.noDates}</p>
            </div>
          </div>

          {/* Driver Performance */}
          {driverPerformance.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6">
              <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
                <Award size={18} className="text-amber-500" /> Driver Performance
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {driverPerformance.map(d => (
                  <div key={d.name} className="rounded-xl border border-slate-200 p-4 bg-slate-50/50">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-bold text-sm text-slate-900">{d.name}</h4>
                      <Badge variant={d.completionRate >= 80 ? 'success' : d.completionRate >= 50 ? 'warning' : 'danger'}>
                        {d.completionRate}%
                      </Badge>
                    </div>
                    <div className="flex gap-4 text-xs text-slate-600">
                      <span className="flex items-center gap-1"><CheckCircle2 size={12} className="text-emerald-500" /> {d.total} trips</span>
                      <span className="flex items-center gap-1"><CheckCircle2 size={12} className="text-emerald-600" /> {d.completed} done</span>
                      <span className="flex items-center gap-1"><AlertTriangle size={12} className="text-rose-500" /> {d.noShow} no-show</span>
                    </div>
                    <div className="mt-3 w-full bg-slate-200 rounded-full h-2">
                      <div className="bg-emerald-500 h-2 rounded-full" style={{ width: `${d.completionRate}%` }}></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Breakdown Stats */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
              <h4 className="text-xs font-bold text-slate-700 mb-3 flex items-center gap-2"><BarChart3 size={14} /> By Type</h4>
              {Object.keys(stats.byType).length === 0 ? (
                <p className="text-xs text-slate-400">No data</p>
              ) : (
                <div className="space-y-2">
                  {Object.entries(stats.byType).sort(([,a], [,b]) => b - a).map(([type, count]) => {
                    const pct = stats.total ? Math.round((count / stats.total) * 100) : 0;
                    return (
                      <div key={type}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="font-semibold text-slate-700">{type}</span>
                          <span className="text-slate-500">{count} ({pct}%)</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-1.5">
                          <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${pct}%` }}></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
              <h4 className="text-xs font-bold text-slate-700 mb-3 flex items-center gap-2"><Filter size={14} /> By Driver</h4>
              {Object.keys(stats.byDriver).length === 0 ? (
                <p className="text-xs text-slate-400">No assigned trips</p>
              ) : (
                <div className="space-y-2">
                  {Object.entries(stats.byDriver).sort(([,a], [,b]) => b.completed - a.completed).map(([name, data]) => {
                    const pct = stats.total ? Math.round((data.total / stats.total) * 100) : 0;
                    return (
                      <div key={name}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="font-semibold text-slate-700 truncate">{name}</span>
                          <span className="text-slate-500">{data.total} ({pct}%)</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-1.5">
                          <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${pct}%` }}></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
              <h4 className="text-xs font-bold text-slate-700 mb-3 flex items-center gap-2"><Calendar size={14} /> By Date</h4>
              {stats.sortedDates.length === 0 ? (
                <p className="text-xs text-slate-400">No data</p>
              ) : (
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {stats.sortedDates.map(([date, count]) => {
                    const pct = stats.total ? Math.round((count / stats.total) * 100) : 0;
                    return (
                      <div key={date} className="flex items-center gap-2 text-xs">
                        <span className="text-slate-500 w-24 shrink-0 font-mono">{date === 'No Date' ? '—' : date}</span>
                        <div className="flex-1 bg-slate-100 rounded-full h-2">
                          <div className="bg-indigo-400 h-2 rounded-full" style={{ width: `${pct}%` }}></div>
                        </div>
                        <span className="text-slate-600 font-semibold w-6 text-right">{count}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Trip Table */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-3 sm:p-4 border-b border-slate-200 flex items-center gap-2 sm:gap-3">
              <FileText size={16} className="text-blue-600 shrink-0" />
              <h3 className="text-sm sm:text-lg font-bold text-slate-900">Trips ({filteredTrips.length})</h3>
              {hasActiveFilters && <Badge variant="info">Filtered</Badge>}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[10px] sm:text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-2 sm:px-3 py-1.5 sm:py-2.5 text-left font-semibold text-slate-600">Date</th>
                    <th className="px-2 sm:px-3 py-1.5 sm:py-2.5 text-left font-semibold text-slate-600">ID</th>
                    <th className="px-2 sm:px-3 py-1.5 sm:py-2.5 text-left font-semibold text-slate-600">Patient</th>
                    <th className="px-2 sm:px-3 py-1.5 sm:py-2.5 text-left font-semibold text-slate-600 hidden sm:table-cell">Pickup</th>
                    <th className="px-2 sm:px-3 py-1.5 sm:py-2.5 text-left font-semibold text-slate-600 hidden sm:table-cell">Dropoff</th>
                    <th className="px-2 sm:px-3 py-1.5 sm:py-2.5 text-left font-semibold text-slate-600">Time</th>
                    <th className="px-2 sm:px-3 py-1.5 sm:py-2.5 text-left font-semibold text-slate-600">Type</th>
                    <th className="px-2 sm:px-3 py-1.5 sm:py-2.5 text-left font-semibold text-slate-600">Status</th>
                    <th className="px-2 sm:px-3 py-1.5 sm:py-2.5 text-left font-semibold text-slate-600 hidden lg:table-cell">Driver</th>
                    <th className="px-2 sm:px-3 py-1.5 sm:py-2.5 text-left font-semibold text-slate-600">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTrips.length === 0 ? (
                    <tr><td colSpan="10" className="px-3 sm:px-6 py-8 sm:py-12 text-center text-slate-500 font-semibold text-sm">No trips match the selected filters.</td></tr>
                  ) : (
                    filteredTrips.map((t, idx) => {
                      const driver = drivers.find(d => d.id === t.driverId);
                      return (
                        <tr key={t.id || idx} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="px-2 sm:px-3 py-1.5 sm:py-2.5 text-[10px] sm:text-xs text-slate-600 font-mono">{t.date || '—'}</td>
                          <td className="px-2 sm:px-3 py-1.5 sm:py-2.5 font-mono text-[10px] sm:text-xs text-blue-600 font-semibold">{t.id}</td>
                          <td className="px-2 sm:px-3 py-1.5 sm:py-2.5 text-[10px] sm:text-xs font-semibold text-slate-900 whitespace-nowrap">{t.patient}</td>
                          <td className="px-2 sm:px-3 py-1.5 sm:py-2.5 text-[10px] sm:text-xs text-slate-600 max-w-[80px] sm:max-w-[150px] truncate hidden sm:table-cell">{t.pickup}</td>
                          <td className="px-2 sm:px-3 py-1.5 sm:py-2.5 text-[10px] sm:text-xs text-slate-600 max-w-[80px] sm:max-w-[150px] truncate hidden sm:table-cell">{t.dropoff}</td>
                          <td className="px-2 sm:px-3 py-1.5 sm:py-2.5 text-[10px] sm:text-xs text-slate-700">{t.time}</td>
                          <td className="px-2 sm:px-3 py-1.5 sm:py-2.5"><Badge variant="info">{t.type}</Badge></td>
                          <td className="px-2 sm:px-3 py-1.5 sm:py-2.5">
                            <Badge variant={t.status === 'Assigned' ? 'success' : t.status === 'Completed' ? 'info' : t.status === 'No Show' ? 'danger' : 'warning'}>{t.status}</Badge>
                          </td>
                          <td className="px-2 sm:px-3 py-1.5 sm:py-2.5 text-[10px] sm:text-xs text-slate-600 hidden lg:table-cell">{driver?.name || '—'}</td>
                          <td className="px-2 sm:px-3 py-1.5 sm:py-2.5">
                            <button onClick={() => setSelectedTrip(t)} className="text-blue-600 hover:text-blue-800 font-bold">View</button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        /* HIGH-DENSITY DAILY MANIFEST VIEW (SPREADSHEET STYLE) */
        <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto overflow-y-auto max-h-[70vh]">
            <table className="w-full text-[9px] border-collapse min-w-[2000px]">
              <thead className="sticky top-0 z-10">
                <tr className="bg-slate-800 text-white divide-x divide-slate-700">
                  <th className="p-2 text-left whitespace-nowrap">Date</th>
                  <th className="p-2 text-left whitespace-nowrap">Status</th>
                  <th className="p-2 text-left whitespace-nowrap">S</th>
                  <th className="p-2 text-left whitespace-nowrap min-w-[300px]">Address</th>
                  <th className="p-2 text-left whitespace-nowrap">Booking ID</th>
                  <th className="p-2 text-left whitespace-nowrap">Pass On/Off</th>
                  <th className="p-2 text-left whitespace-nowrap">Event Id</th>
                  <th className="p-2 text-left whitespace-nowrap">Client Name</th>
                  <th className="p-2 text-left whitespace-nowrap">Client Id</th>
                  <th className="p-2 text-left whitespace-nowrap">Activity</th>
                  <th className="p-2 text-left whitespace-nowrap">Sch Time</th>
                  <th className="p-2 text-left whitespace-nowrap">Req Late</th>
                  <th className="p-2 text-left whitespace-nowrap">Driver</th>
                  <th className="p-2 text-left whitespace-nowrap">Vehicle</th>
                  <th className="p-2 text-left whitespace-nowrap">Arr Time</th>
                  <th className="p-2 text-left whitespace-nowrap">Dep Time</th>
                  <th className="p-2 text-left whitespace-nowrap">Mileage/Odo</th>
                  <th className="p-2 text-left whitespace-nowrap">Distance</th>
                  <th className="p-2 text-left whitespace-nowrap">Phone</th>
                  <th className="p-2 text-left whitespace-nowrap">Sign Captured?</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTrips.length === 0 ? (
                  <tr><td colSpan="20" className="p-12 text-center text-slate-400 font-bold text-lg">No data for selected filters.</td></tr>
                ) : (
                  filteredTrips.map((t) => {
                    const driver = drivers.find(d => d.id === t.driverId);
                    return (
                      <React.Fragment key={t.id}>
                        {/* Pickup Row */}
                        <tr className="hover:bg-slate-50 divide-x divide-slate-100 bg-white">
                          <td className="p-2 whitespace-nowrap font-mono">{t.date}</td>
                          <td className="p-2 whitespace-nowrap"><Badge variant={t.status === 'Completed' ? 'success' : 'info'}>{t.status}</Badge></td>
                          <td className="p-2 whitespace-nowrap font-bold text-emerald-600">P</td>
                          <td className="p-2 font-medium text-slate-800">{t.pickup}</td>
                          <td className="p-2 whitespace-nowrap font-mono text-blue-600">{t.id}</td>
                          <td className="p-2 whitespace-nowrap text-slate-400">ADULT-1</td>
                          <td className="p-2 whitespace-nowrap text-slate-400">+{t.id?.slice(-4)}</td>
                          <td className="p-2 whitespace-nowrap font-black">{t.patient}</td>
                          <td className="p-2 whitespace-nowrap text-slate-400">#9290</td>
                          <td className="p-2 whitespace-nowrap font-bold text-emerald-600">Pickup</td>
                          <td className="p-2 whitespace-nowrap font-bold">{t.time}</td>
                          <td className="p-2 whitespace-nowrap text-slate-400">00:00</td>
                          <td className="p-2 whitespace-nowrap font-bold">{driver?.name || '—'}</td>
                          <td className="p-2 whitespace-nowrap text-slate-500">{driver?.vehicle || '—'}</td>
                          <td className="p-2 whitespace-nowrap font-mono text-emerald-600">{t.arrivalTime ? new Date(t.arrivalTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '—'}</td>
                          <td className="p-2 whitespace-nowrap font-mono text-emerald-600">{t.departedPickupTime ? new Date(t.departedPickupTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '—'}</td>
                          <td className="p-2 whitespace-nowrap font-mono font-black">{t.pickupOdometer || '0.000'}</td>
                          <td className="p-2 whitespace-nowrap text-slate-400">0.000mi</td>
                          <td className="p-2 whitespace-nowrap">{t.pickupPhone}</td>
                          <td className="p-2 text-center text-emerald-500 font-bold">{t.signature ? '✔' : ''}</td>
                        </tr>
                        {/* Dropoff Row */}
                        <tr className="hover:bg-slate-50 divide-x divide-slate-100 bg-slate-50/30">
                          <td className="p-2 whitespace-nowrap font-mono">{t.date}</td>
                          <td className="p-2 whitespace-nowrap"><Badge variant={t.status === 'Completed' ? 'success' : 'info'}>{t.status}</Badge></td>
                          <td className="p-2 whitespace-nowrap font-bold text-rose-600">S</td>
                          <td className="p-2 font-medium text-slate-800">{t.dropoff}</td>
                          <td className="p-2 whitespace-nowrap font-mono text-blue-600">{t.id}</td>
                          <td className="p-2 whitespace-nowrap text-slate-400">ADULT-1</td>
                          <td className="p-2 whitespace-nowrap text-slate-400">+{t.id?.slice(-4)}</td>
                          <td className="p-2 whitespace-nowrap font-black">{t.patient}</td>
                          <td className="p-2 whitespace-nowrap text-slate-400">#9290</td>
                          <td className="p-2 whitespace-nowrap font-bold text-rose-600">Dropoff</td>
                          <td className="p-2 whitespace-nowrap font-bold">{t.time}</td>
                          <td className="p-2 whitespace-nowrap text-slate-400">00:00</td>
                          <td className="p-2 whitespace-nowrap font-bold">{driver?.name || '—'}</td>
                          <td className="p-2 whitespace-nowrap text-slate-500">{driver?.vehicle || '—'}</td>
                          <td className="p-2 whitespace-nowrap font-mono text-rose-600">{t.arrivalDropoffTime ? new Date(t.arrivalDropoffTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '—'}</td>
                          <td className="p-2 whitespace-nowrap font-mono text-rose-600">{t.completedAt ? new Date(t.completedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '—'}</td>
                          <td className="p-2 whitespace-nowrap font-mono font-black">{t.dropoffOdometer || '0.000'}</td>
                          <td className="p-2 whitespace-nowrap text-slate-900 font-bold">{t.dropoffOdometer && t.pickupOdometer ? (t.dropoffOdometer - t.pickupOdometer).toFixed(3) : '0.000'}mi</td>
                          <td className="p-2 whitespace-nowrap">{t.dropoffPhone}</td>
                          <td className="p-2 text-center text-emerald-500 font-bold">{t.signature ? '✔' : ''}</td>
                        </tr>
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedTrip && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setSelectedTrip(null)} />
          <div className="bg-white w-full max-w-lg rounded-[2rem] p-6 sm:p-8 shadow-2xl relative z-10 border border-slate-200 overflow-y-auto max-h-[90vh]">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black text-slate-900">Trip Details</h3>
              <button onClick={() => setSelectedTrip(null)} className="p-2 hover:bg-slate-100 rounded-full transition"><X size={20} /></button>
            </div>
            
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Patient</p>
                  <p className="text-sm font-bold text-slate-900">{selectedTrip.patient}</p>
                  <p className="text-[10px] text-slate-500 font-mono mt-1">ID: {selectedTrip.id}</p>
                </div>
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Status</p>
                  <Badge variant={selectedTrip.status === 'Completed' ? 'success' : 'info'}>{selectedTrip.status}</Badge>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><MapPin size={12} /> Route Log</h4>
                <div className="space-y-4">
                  <div className="flex gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                    <div className="flex-1">
                      <p className="text-[10px] font-bold text-slate-400 uppercase leading-none mb-1">Pickup</p>
                      <p className="text-xs font-semibold text-slate-800">{selectedTrip.pickup}</p>
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-[10px] font-mono text-slate-500">{selectedTrip.pickupPhone || 'No Phone'}</span>
                        {selectedTrip.pickupPhone && (
                          <div className="flex gap-2">
                            <a href={`tel:${selectedTrip.pickupPhone}`} className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 transition"><Phone size={12} /></a>
                            <a href={`sms:${selectedTrip.pickupPhone}`} className="p-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition"><MessageSquare size={12} /></a>
                          </div>
                        )}
                      </div>
                      {selectedTrip.arrivalTime && <p className="text-[9px] text-emerald-600 font-bold mt-1">Arrived: {new Date(selectedTrip.arrivalTime).toLocaleTimeString()}</p>}
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-1.5 shrink-0" />
                    <div className="flex-1">
                      <p className="text-[10px] font-bold text-slate-400 uppercase leading-none mb-1">Dropoff</p>
                      <p className="text-xs font-semibold text-slate-800">{selectedTrip.dropoff}</p>
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-[10px] font-mono text-slate-500">{selectedTrip.dropoffPhone || 'No Phone'}</span>
                        {selectedTrip.dropoffPhone && (
                          <div className="flex gap-2">
                            <a href={`tel:${selectedTrip.dropoffPhone}`} className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 transition"><Phone size={12} /></a>
                            <a href={`sms:${selectedTrip.dropoffPhone}`} className="p-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition"><MessageSquare size={12} /></a>
                          </div>
                        )}
                      </div>
                      {selectedTrip.completedAt && <p className="text-[9px] text-rose-600 font-bold mt-1">Completed: {new Date(selectedTrip.completedAt).toLocaleTimeString()}</p>}
                    </div>
                  </div>
                </div>
              </div>

              {selectedTrip.status === 'Completed' && (
                <div className="space-y-3 pt-4 border-t border-slate-100">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Download size={12} /> Telemetry Data</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-blue-50 rounded-xl border border-blue-100">
                      <p className="text-[9px] font-black text-blue-400 uppercase mb-1">Start Odometer</p>
                      <p className="text-lg font-black text-blue-700">{selectedTrip.pickupOdometer || '—'} <span className="text-[10px]">mi</span></p>
                    </div>
                    <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                      <p className="text-[9px] font-black text-emerald-400 uppercase mb-1">End Odometer</p>
                      <p className="text-lg font-black text-emerald-700">{selectedTrip.dropoffOdometer || '—'} <span className="text-[10px]">mi</span></p>
                    </div>
                  </div>
                  <div className="bg-slate-900 text-white p-3 rounded-xl flex justify-between items-center">
                    <span className="text-[10px] font-black uppercase opacity-60">Total Distance</span>
                    <span className="text-lg font-black">{selectedTrip.dropoffOdometer && selectedTrip.pickupOdometer ? selectedTrip.dropoffOdometer - selectedTrip.pickupOdometer : 0} miles</span>
                  </div>
                </div>
              )}

              {selectedTrip.signature && (
                <div className="space-y-2 pt-4 border-t border-slate-100">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><FileText size={12} /> Patient Verification</h4>
                  <div className="bg-slate-50 rounded-xl border border-slate-200 p-2 h-32 flex items-center justify-center">
                    <img src={selectedTrip.signature} alt="Patient Signature" className="max-h-full max-w-full object-contain" />
                  </div>
                  <p className="text-[9px] text-center text-slate-400 font-bold uppercase">Digital Proof of Service</p>
                </div>
              )}

              {selectedTrip.unableToSign && (
                <div className="p-4 bg-amber-50 rounded-xl border border-amber-100 text-center">
                  <p className="text-[10px] font-black text-amber-600 uppercase mb-1">Unable to Sign</p>
                  <p className="text-sm font-bold text-amber-900">{selectedTrip.unableReason || 'Physical Limitation'}</p>
                </div>
              )}
            </div>
            
            <button onClick={() => setSelectedTrip(null)} className="w-full mt-8 py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold active:scale-95 transition-all">Close Inspector</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportsPage;
