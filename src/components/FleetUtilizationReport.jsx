import React, { useMemo, useState } from 'react';
import { Truck, TrendingUp, Calendar, Download, BarChart3, Clock, MapPin, Filter } from 'lucide-react';

const DATE_RANGES = [
  { label: 'Today', value: 'today' },
  { label: 'This Week', value: 'week' },
  { label: 'This Month', value: 'month' },
  { label: 'Custom', value: 'custom' },
];

function filterByDate(trips, range) {
  const now = new Date();
  const start = new Date();
  if (range === 'today') {
    start.setHours(0, 0, 0, 0);
  } else if (range === 'week') {
    start.setDate(now.getDate() - now.getDay());
    start.setHours(0, 0, 0, 0);
  } else if (range === 'month') {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  } else {
    return trips;
  }
  return trips.filter((t) => {
    const d = new Date(t.date || t.pickupTime || t.createdAt);
    return d >= start && d <= now;
  });
}

function calcDurationMinutes(trip) {
  if (trip.durationMinutes) return trip.durationMinutes;
  if (trip.startTime && trip.endTime) {
    return (new Date(trip.endTime) - new Date(trip.startTime)) / 60000;
  }
  return 0;
}

function efficiencyRating(ratio) {
  if (ratio >= 0.8) return { label: 'Excellent', color: 'text-green-700 bg-green-100' };
  if (ratio >= 0.6) return { label: 'Good', color: 'text-blue-700 bg-blue-100' };
  if (ratio >= 0.4) return { label: 'Fair', color: 'text-yellow-700 bg-yellow-100' };
  return { label: 'Low', color: 'text-red-700 bg-red-100' };
}

function Badge({ children, className }) {
  return <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${className}`}>{children}</span>;
}

function StatCard({ icon: Icon, label, value, sub }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-start gap-3">
      <div className="p-2 bg-blue-50 rounded-lg">
        <Icon size={20} className="text-blue-600" />
      </div>
      <div>
        <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide">{label}</p>
        <p className="text-xl font-semibold text-slate-900">{value}</p>
        {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function TableRow({ children, className = '' }) {
  return <tr className={`border-b border-slate-100 last:border-0 ${className}`}>{children}</tr>;
}

function toCSV(headers, rows) {
  const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join('\n');
}

export default function FleetUtilizationReport({ trips = [], drivers = [], vehicles = [] }) {
  const [dateRange, setDateRange] = useState('month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const filteredTrips = useMemo(() => {
    let result = filterByDate(trips, dateRange);
    if (dateRange === 'custom' && customStart && customEnd) {
      const s = new Date(customStart);
      const e = new Date(customEnd);
      e.setHours(23, 59, 59, 999);
      result = trips.filter((t) => {
        const d = new Date(t.date || t.pickupTime || t.createdAt);
        return d >= s && d <= e;
      });
    }
    return result;
  }, [trips, dateRange, customStart, customEnd]);

  const completedTrips = filteredTrips.filter((t) => t.status === 'completed' || t.completed);

  const vehicleStats = useMemo(() => {
    const map = {};
    completedTrips.forEach((t) => {
      const vid = t.vehicleId || t.vehicle;
      if (!vid) return;
      if (!map[vid]) map[vid] = { trips: 0, miles: 0, hours: 0 };
      map[vid].trips += 1;
      map[vid].miles += t.distance || t.miles || 0;
      map[vid].hours += calcDurationMinutes(t) / 60;
    });
    return vehicles.map((v) => {
      const id = v.id || v._id;
      const s = map[id] || { trips: 0, miles: 0, hours: 0 };
      const idle = Math.max(0, 8 - s.hours);
      return { ...v, ...s, idle };
    });
  }, [vehicles, completedTrips]);

  const driverStats = useMemo(() => {
    const map = {};
    completedTrips.forEach((t) => {
      const did = t.driverId || t.driver;
      if (!did) return;
      if (!map[did]) map[did] = { trips: 0, miles: 0, totalMinutes: 0 };
      map[did].trips += 1;
      map[did].miles += t.distance || t.miles || 0;
      map[did].totalMinutes += calcDurationMinutes(t);
    });
    const maxTrips = Math.max(1, ...Object.values(map).map((d) => d.trips));
    return drivers.map((d) => {
      const id = d.id || d._id;
      const s = map[id] || { trips: 0, miles: 0, totalMinutes: 0 };
      const avgDuration = s.trips ? s.totalMinutes / s.trips : 0;
      const rating = efficiencyRating(s.trips / maxTrips);
      return { ...d, ...s, avgDuration, rating };
    });
  }, [drivers, completedTrips]);

  const summary = useMemo(() => {
    const totalMiles = completedTrips.reduce((a, t) => a + (t.distance || t.miles || 0), 0);
    const totalHours = completedTrips.reduce((a, t) => a + calcDurationMinutes(t) / 60, 0);
    const maxPossible = vehicles.length * 8;
    const utilization = maxPossible ? ((totalHours / maxPossible) * 100).toFixed(1) : '0.0';
    const underutilized = vehicleStats.filter((v) => v.hours < 2).length;
    return { totalMiles: totalMiles.toFixed(1), totalHours: totalHours.toFixed(1), utilization, underutilized };
  }, [completedTrips, vehicles, vehicleStats]);

  const handleExport = () => {
    const headers = ['Vehicle', 'Trips', 'Miles', 'Hours', 'Idle Hours'];
    const rows = vehicleStats.map((v) => [
      v.name || v.id || v._id,
      v.trips,
      v.miles.toFixed(1),
      v.hours.toFixed(1),
      v.idle.toFixed(1),
    ]);
    const blob = new Blob([toCSV(headers, rows)], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fleet-report-${dateRange}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-slate-50 min-h-screen p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <BarChart3 size={24} className="text-blue-600" />
          <h1 className="text-2xl font-semibold text-slate-900">Fleet Utilization Report</h1>
        </div>
        <button onClick={handleExport} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition">
          <Download size={16} />
          Export CSV
        </button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Filter size={16} className="text-slate-500" />
        <div className="flex bg-white rounded-lg border border-slate-200 overflow-hidden">
          {DATE_RANGES.map((r) => (
            <button
              key={r.value}
              onClick={() => setDateRange(r.value)}
              className={`px-3 py-1.5 text-sm font-semibold transition ${
                dateRange === r.value ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        {dateRange === 'custom' && (
          <div className="flex items-center gap-2">
            <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm" />
            <span className="text-slate-400">to</span>
            <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm" />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={MapPin} label="Total Fleet Miles" value={summary.totalMiles} />
        <StatCard icon={Truck} label="Avg Utilization" value={`${summary.utilization}%`} />
        <StatCard icon={Clock} label="Hours in Use" value={summary.totalHours} />
        <StatCard icon={TrendingUp} label="Underutilized" value={summary.underutilized} sub="vehicles < 2 hrs" />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 flex items-center gap-2">
          <Truck size={18} className="text-slate-600" />
          <h2 className="text-base font-semibold text-slate-900">Vehicle Utilization</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-5 py-2.5 font-semibold text-slate-600">Vehicle</th>
                <th className="px-5 py-2.5 font-semibold text-slate-600 text-right">Trips</th>
                <th className="px-5 py-2.5 font-semibold text-slate-600 text-right">Miles</th>
                <th className="px-5 py-2.5 font-semibold text-slate-600 text-right">Hours</th>
                <th className="px-5 py-2.5 font-semibold text-slate-600 text-right">Idle</th>
              </tr>
            </thead>
            <tbody>
              {vehicleStats.length === 0 && (
                <TableRow>
                  <td colSpan={5} className="px-5 py-8 text-center text-slate-400">No vehicle data available</td>
                </TableRow>
              )}
              {vehicleStats.map((v, i) => (
                <TableRow key={v.id || v._id || i} className="hover:bg-slate-50">
                  <td className="px-5 py-2.5 font-semibold text-slate-900">{v.name || v.id || `Vehicle ${i + 1}`}</td>
                  <td className="px-5 py-2.5 text-right text-slate-700">{v.trips}</td>
                  <td className="px-5 py-2.5 text-right text-slate-700">{v.miles.toFixed(1)}</td>
                  <td className="px-5 py-2.5 text-right text-slate-700">{v.hours.toFixed(1)}</td>
                  <td className="px-5 py-2.5 text-right text-slate-700">{v.idle.toFixed(1)}</td>
                </TableRow>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 flex items-center gap-2">
          <TrendingUp size={18} className="text-slate-600" />
          <h2 className="text-base font-semibold text-slate-900">Driver Performance</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-5 py-2.5 font-semibold text-slate-600">Driver</th>
                <th className="px-5 py-2.5 font-semibold text-slate-600 text-right">Trips</th>
                <th className="px-5 py-2.5 font-semibold text-slate-600 text-right">Miles</th>
                <th className="px-5 py-2.5 font-semibold text-slate-600 text-right">Avg Duration</th>
                <th className="px-5 py-2.5 font-semibold text-slate-600 text-center">Rating</th>
              </tr>
            </thead>
            <tbody>
              {driverStats.length === 0 && (
                <TableRow>
                  <td colSpan={5} className="px-5 py-8 text-center text-slate-400">No driver data available</td>
                </TableRow>
              )}
              {driverStats.map((d, i) => (
                <TableRow key={d.id || d._id || i} className="hover:bg-slate-50">
                  <td className="px-5 py-2.5 font-semibold text-slate-900">{d.name || d.id || `Driver ${i + 1}`}</td>
                  <td className="px-5 py-2.5 text-right text-slate-700">{d.trips}</td>
                  <td className="px-5 py-2.5 text-right text-slate-700">{d.miles.toFixed(1)}</td>
                  <td className="px-5 py-2.5 text-right text-slate-700">{d.avgDuration.toFixed(0)} min</td>
                  <td className="px-5 py-2.5 text-center">
                    <Badge className={d.rating.color}>{d.rating.label}</Badge>
                  </td>
                </TableRow>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
