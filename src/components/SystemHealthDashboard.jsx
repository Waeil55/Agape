import React, { useMemo } from 'react';
import {
  Activity, Wifi, AlertTriangle, CheckCircle, Clock,
  Truck, Database, RefreshCw, TrendingUp, TrendingDown, Shield, Zap
} from 'lucide-react';
import { tripCalendarDateKey, localCalendarYmd } from '../utils/tripDate';

const StatusDot = ({ status }) => {
  const colors = {
    healthy: 'bg-emerald-500',
    warning: 'bg-amber-500',
    critical: 'bg-red-500',
  };
  return <span className={`inline-block w-2 h-2 rounded-full ${colors[status] || colors.healthy}`} />;
};

const StatCard = ({ icon: Icon, label, value, color }) => (
  <div className="bg-white rounded-xl border border-slate-200 p-3 text-center">
    <div className={`w-8 h-8 mx-auto rounded-lg ${color} flex items-center justify-center mb-2`}>
      <Icon size={16} />
    </div>
    <p className="text-xl font-semibold text-slate-900">{value}</p>
    <p className="text-[10px] text-slate-500">{label}</p>
  </div>
);

const SectionHeader = ({ icon: Icon, title, status }) => (
  <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
    <div className="flex items-center gap-2">
      <Icon size={14} className="text-slate-500" />
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
    </div>
    {status && <StatusDot status={status} />}
  </div>
);

export const formatSystemSyncTime = (value) => {
  if (!value) return 'Not recorded';
  const raw = String(value).trim();
  if (/^\d{1,2}:\d{2}(?::\d{2})?\s*(AM|PM)$/i.test(raw)) return raw;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Not recorded' : parsed.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

export default function SystemHealthDashboard({ trips = [], drivers = [], logs = [], appSettings = {} }) {
  const todayKey = useMemo(() => localCalendarYmd(), []);

  const appStats = useMemo(() => {
    const todayTrips = trips.filter(t => {
      const d = t.date || t.tripDate || '';
      return tripCalendarDateKey(d) === todayKey;
    });
    const onlineDrivers = drivers.filter(d => d.status === 'Online' || d.status === 'Active' || d.clockedIn);
    return {
      totalTripsToday: todayTrips.length,
      activeDrivers: onlineDrivers.filter(d => d.currentTrip).length,
      totalDrivers: drivers.length,
      onlineDrivers: onlineDrivers.length,
    };
  }, [trips, drivers, todayKey]);

  const systemStatus = useMemo(() => {
    const recentErrors = logs.filter(l => l.level === 'error' || l.type === 'error');
    const pendingWrites = logs.filter(l => l.pending || l.status === 'pending').length;
    const lastLog = logs.length > 0 ? logs[logs.length - 1] : null;
    const lastSyncTime = lastLog?.timestamp || lastLog?.createdAt || null;
    return {
      firestoreStatus: recentErrors.length > 3 ? 'critical' : recentErrors.length > 0 ? 'warning' : 'healthy',
      lastSyncTime,
      pendingWrites,
      errorCount: recentErrors.length,
    };
  }, [logs]);

  const performance = useMemo(() => {
    const completed = trips.filter(t => t.status === 'Completed' || t.completedAt);
    if (completed.length === 0) return { avgCompletion: '--', onTimeRate: '--', utilization: '--' };

    let totalMinutes = 0;
    let onTime = 0;
    completed.forEach(t => {
      if (t.scheduledTime && t.completedTime) {
        const scheduled = new Date(`2000-01-01 ${t.scheduledTime}`).getTime();
        const completed2 = new Date(`2000-01-01 ${t.completedTime}`).getTime();
        const diff = (completed2 - scheduled) / 60000;
        if (diff >= 0) totalMinutes += diff;
        if (diff <= 15) onTime++;
      } else if (t.startedAt && t.completedAt) {
        const dur = (new Date(t.completedAt) - new Date(t.startedAt)) / 60000;
        totalMinutes += dur;
      }
    });

    const avgMin = completed.length > 0 ? Math.round(totalMinutes / completed.length) : 0;
    const onTimePercent = completed.length > 0 ? Math.round((onTime / completed.length) * 100) : 0;
    const activeCount = drivers.filter(d => d.status === 'Online' || d.status === 'Active' || d.clockedIn).length;
    const drivingCount = drivers.filter(d => d.currentTrip).length;
    const utilizationPercent = activeCount > 0 ? Math.round((drivingCount / activeCount) * 100) : 0;

    return {
      avgCompletion: `${avgMin}m`,
      onTimeRate: `${onTimePercent}%`,
      utilization: `${utilizationPercent}%`,
      onTimeStatus: onTimePercent >= 80 ? 'healthy' : onTimePercent >= 60 ? 'warning' : 'critical',
      utilizationStatus: utilizationPercent >= 70 ? 'healthy' : utilizationPercent >= 40 ? 'warning' : 'critical',
    };
  }, [trips, drivers]);

  const alerts = useMemo(() => {
    const recent = [];
    const now = new Date();

    const lateTrips = trips.filter(t => {
      if (t.status === 'Completed') return false;
      if (!t.scheduledTime) return false;
      const sched = new Date(`${t.date || todayKey} ${t.scheduledTime}`);
      return sched < now;
    });
    lateTrips.slice(0, 3).forEach(t => {
      recent.push({ type: 'warning', message: `Trip #${t.tripId || t.id} is late`, time: t.scheduledTime });
    });

    const missed = trips.filter(t => t.status === 'No Show' || t.status === 'Cancelled');
    if (missed.length > 0) {
      recent.push({ type: 'error', message: `${missed.length} historical missed/cancelled trips`, time: 'All records' });
    }

    const offlineDrivers = drivers.filter(d => d.status === 'Offline' && d.wasRecentlyActive);
    if (offlineDrivers.length > 0) {
      recent.push({ type: 'warning', message: `${offlineDrivers.length} driver(s) went offline`, time: 'Recently' });
    }

    const errorLogs = logs.filter(l => l.level === 'error');
    errorLogs.slice(0, 2).forEach(l => {
      recent.push({ type: 'error', message: l.message || 'System error logged', time: l.timestamp || '' });
    });

    return recent.slice(0, 5);
  }, [trips, drivers, logs, todayKey]);

  const fleetStatus = useMemo(() => {
    const vehicleSet = new Set();
    const inUseSet = new Set();
    trips.forEach(t => {
      if (t.vehicleId || t.vehicle) {
        const vid = t.vehicleId || t.vehicle;
        vehicleSet.add(vid);
        if (t.status !== 'Completed' && t.status !== 'Cancelled' && t.status !== 'No Show') {
          inUseSet.add(vid);
        }
      }
    });
    const total = Math.max(vehicleSet.size, drivers.filter(d => d.vehicleId).length);
    const inUse = inUseSet.size;
    const idle = total - inUse;

    let status = 'healthy';
    if (idle === 0 && total > 0) status = 'critical';
    else if (idle <= 2 && total > 0) status = 'warning';

    return { total, inUse, idle, status };
  }, [trips, drivers]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={Truck} label="Trips Today" value={appStats.totalTripsToday} color="bg-blue-50 text-blue-600" />
        <StatCard icon={Activity} label="Active Drivers" value={appStats.activeDrivers} color="bg-emerald-50 text-emerald-600" />
        <StatCard icon={Shield} label="Online Drivers" value={appStats.onlineDrivers} color="bg-indigo-50 text-indigo-600" />
        <StatCard icon={Zap} label="Total Drivers" value={appStats.totalDrivers} color="bg-amber-50 text-amber-600" />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <SectionHeader icon={Database} title="System Status" status={systemStatus.firestoreStatus} />
        <div className="divide-y divide-slate-100">
          <div className="px-4 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wifi size={14} className="text-slate-400" />
              <span className="text-xs font-semibold text-slate-700">Firestore Connection</span>
            </div>
            <StatusDot status={systemStatus.firestoreStatus} />
          </div>
          <div className="px-4 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <RefreshCw size={14} className="text-slate-400" />
              <span className="text-xs font-semibold text-slate-700">Last Sync</span>
            </div>
            <span className="text-[10px] text-slate-500">
              {formatSystemSyncTime(systemStatus.lastSyncTime)}
            </span>
          </div>
          <div className="px-4 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database size={14} className="text-slate-400" />
              <span className="text-xs font-semibold text-slate-700">Pending Writes</span>
            </div>
            <span className={`text-[10px] font-semibold ${systemStatus.pendingWrites > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
              {systemStatus.pendingWrites}
            </span>
          </div>
          <div className="px-4 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle size={14} className="text-slate-400" />
              <span className="text-xs font-semibold text-slate-700">Errors</span>
            </div>
            <span className={`text-[10px] font-semibold ${systemStatus.errorCount > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
              {systemStatus.errorCount}
            </span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <SectionHeader icon={TrendingUp} title="Performance Metrics" />
        <div className="grid grid-cols-3 divide-x divide-slate-100">
          <div className="px-4 py-3 text-center">
            <Clock size={14} className="mx-auto text-slate-400 mb-1" />
            <p className="text-lg font-semibold text-slate-900">{performance.avgCompletion}</p>
            <p className="text-[10px] text-slate-500">Avg Completion</p>
          </div>
          <div className="px-4 py-3 text-center">
            {performance.onTimeStatus === 'critical' ?
              <TrendingDown size={14} className="mx-auto text-red-400 mb-1" /> :
              <CheckCircle size={14} className="mx-auto text-emerald-400 mb-1" />
            }
            <p className="text-lg font-semibold text-slate-900">{performance.onTimeRate}</p>
            <p className="text-[10px] text-slate-500">On-Time Rate</p>
          </div>
          <div className="px-4 py-3 text-center">
            <Activity size={14} className="mx-auto text-slate-400 mb-1" />
            <p className="text-lg font-semibold text-slate-900">{performance.utilization}</p>
            <p className="text-[10px] text-slate-500">Utilization</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <SectionHeader icon={AlertTriangle} title="Recent Alerts" />
        <div className="divide-y divide-slate-100">
          {alerts.length === 0 ? (
            <div className="px-4 py-6 text-center text-slate-400 text-sm">
              <CheckCircle size={20} className="mx-auto mb-2 text-emerald-400" />
              All systems operational
            </div>
          ) : (
            alerts.map((alert, i) => (
              <div key={i} className="px-4 py-2.5 flex items-center gap-3">
                {alert.type === 'error' ? (
                  <AlertTriangle size={14} className="text-red-500 shrink-0" />
                ) : (
                  <Clock size={14} className="text-amber-500 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-900 truncate">{alert.message}</p>
                </div>
                <span className="text-[10px] text-slate-400 shrink-0">{alert.time}</span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <SectionHeader icon={Truck} title="Fleet Status" status={fleetStatus.status} />
        <div className="grid grid-cols-3 divide-x divide-slate-100">
          <div className="px-4 py-3 text-center">
            <Truck size={14} className="mx-auto text-slate-400 mb-1" />
            <p className="text-lg font-semibold text-slate-900">{fleetStatus.total}</p>
            <p className="text-[10px] text-slate-500">Total Vehicles</p>
          </div>
          <div className="px-4 py-3 text-center">
            <Activity size={14} className="mx-auto text-emerald-400 mb-1" />
            <p className="text-lg font-semibold text-slate-900">{fleetStatus.inUse}</p>
            <p className="text-[10px] text-slate-500">In Use</p>
          </div>
          <div className="px-4 py-3 text-center">
            <Clock size={14} className="mx-auto text-amber-400 mb-1" />
            <p className="text-lg font-semibold text-slate-900">{fleetStatus.idle}</p>
            <p className="text-[10px] text-slate-500">Idle</p>
          </div>
        </div>
      </div>
    </div>
  );
}
