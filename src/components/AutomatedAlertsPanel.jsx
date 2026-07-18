import React, { useState, useMemo } from 'react';
import { AlertTriangle, Clock, MapPin, Truck, X, Bell, BellOff, Filter } from 'lucide-react';

const SEVERITY_STYLES = {
  critical: { bg: 'bg-rose-50', border: 'border-rose-200', icon: 'text-rose-600', badge: 'bg-rose-100 text-rose-700' },
  warning: { bg: 'bg-amber-50', border: 'border-amber-200', icon: 'text-amber-600', badge: 'bg-amber-100 text-amber-700' },
  info: { bg: 'bg-blue-50', border: 'border-blue-200', icon: 'text-blue-600', badge: 'bg-blue-100 text-blue-700' },
};

const ALERT_ICONS = {
  late_trip: Clock,
  missed_pickup: MapPin,
  driver_offline: Truck,
  trip_overdue: AlertTriangle,
  low_capacity: AlertTriangle,
};

const ALERT_TYPE_LABELS = {
  late_trip: 'Late Trip',
  missed_pickup: 'Missed Pickup',
  driver_offline: 'Driver Offline',
  trip_overdue: 'Trip Overdue',
  low_capacity: 'Low Capacity',
};

function formatTimestamp(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function minutesSince(ts) {
  return Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
}

function AlertCard({ alert, onDismiss }) {
  const style = SEVERITY_STYLES[alert.severity];
  const Icon = ALERT_ICONS[alert.type] || AlertTriangle;
  return (
    <div className={`${style.bg} border ${style.border} rounded-xl px-3 py-2.5 flex items-start gap-2.5 relative`}>
      <div className={`w-7 h-7 rounded-lg bg-white border ${style.border} flex items-center justify-center flex-shrink-0 mt-0.5`}>
        <Icon size={14} className={style.icon} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${style.badge}`}>{alert.severity.toUpperCase()}</span>
          <span className="text-[10px] font-semibold text-slate-500">{ALERT_TYPE_LABELS[alert.type]}</span>
        </div>
        <p className="text-xs font-semibold text-slate-800 leading-snug">{alert.message}</p>
        {alert.entity && (
          <p className="text-[10px] text-slate-500 mt-0.5">{alert.entity}</p>
        )}
      </div>
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        <span className="text-[9px] text-slate-400">{formatTimestamp(alert.timestamp)}</span>
        <button onClick={() => onDismiss(alert.id)} className="p-0.5 rounded hover:bg-white/60 text-slate-400 hover:text-slate-600">
          <X size={12} />
        </button>
      </div>
    </div>
  );
}

function generateAlerts({ trips, drivers, vehicles, thresholds }) {
  const alerts = [];
  let id = 0;
  const now = Date.now();
  const vehicleCapMap = {};
  (vehicles || []).forEach(v => { vehicleCapMap[v.id || v.name] = v.capacity || v.seats || 15; });
  const driverStatusMap = {};
  (drivers || []).forEach(d => { driverStatusMap[d.id || d.name] = d; });

  (trips || []).forEach(trip => {
    const schedTime = trip.scheduledTime || trip.pickupTime;
    const tripStart = trip.startedAt || trip.actualStart;
    const status = (trip.status || '').toLowerCase();

    if (schedTime && tripStart) {
      const diff = minutesSince(schedTime);
      if (diff > thresholds.lateTripMinutes && (status === 'in_transit' || status === 'completed' || status === 'in progress')) {
        alerts.push({
          id: `late-${id++}`, type: 'late_trip', severity: diff > 60 ? 'critical' : 'warning',
          message: `Trip started ${diff - thresholds.lateTripMinutes} min late`,
          entity: `${trip.passengerName || trip.passenger || 'Passenger'} — ${trip.pickupAddress || trip.pickup || ''}`,
          timestamp: tripStart,
        });
      }
    }

    if (status === 'assigned' && schedTime && minutesSince(schedTime) > thresholds.missedPickupMinutes) {
      alerts.push({
        id: `missed-${id++}`, type: 'missed_pickup', severity: 'critical',
        message: `Pickup missed — ${minutesSince(schedTime)} min past scheduled time`,
        entity: `${trip.passengerName || trip.passenger || 'Passenger'} — ${trip.pickupAddress || trip.pickup || ''}`,
        timestamp: schedTime,
      });
    }

    if (status === 'in_transit' || status === 'in progress') {
      const start = trip.startedAt || trip.actualStart;
      if (start && minutesSince(start) > thresholds.overdueTripMinutes) {
        alerts.push({
          id: `overdue-${id++}`, type: 'trip_overdue', severity: 'critical',
          message: `Trip in transit for ${minutesSince(start)} min (limit: ${thresholds.overdueTripMinutes})`,
          entity: `${trip.passengerName || trip.passenger || 'Passenger'} → ${trip.dropoffAddress || trip.dropoff || ''}`,
          timestamp: start,
        });
      }
    }

    if (trip.vehicleId && trip.passengerCount && vehicleCapMap[trip.vehicleId] !== undefined) {
      if (trip.passengerCount > vehicleCapMap[trip.vehicleId]) {
        alerts.push({
          id: `cap-${id++}`, type: 'low_capacity', severity: 'warning',
          message: `Over capacity: ${trip.passengerCount}/${vehicleCapMap[trip.vehicleId]} seats assigned`,
          entity: `Vehicle: ${trip.vehicleName || trip.vehicleId}`,
          timestamp: now,
        });
      }
    }
  });

  (drivers || []).forEach(driver => {
    if ((driver.status === 'clocked_in' || driver.status === 'active' || driver.isOnDuty) && driver.lastGpsUpdate) {
      const mins = minutesSince(driver.lastGpsUpdate);
      if (mins > thresholds.driverOfflineMinutes) {
        alerts.push({
          id: `offline-${id++}`, type: 'driver_offline', severity: mins > 30 ? 'critical' : 'warning',
          message: `No GPS update for ${mins} min (limit: ${thresholds.driverOfflineMinutes})`,
          entity: driver.name || driver.id,
          timestamp: driver.lastGpsUpdate,
        });
      }
    }
  });

  return alerts.sort((a, b) => {
    const sev = { critical: 0, warning: 1, info: 2 };
    return (sev[a.severity] ?? 3) - (sev[b.severity] ?? 3) || new Date(b.timestamp) - new Date(a.timestamp);
  });
}

const DEFAULT_THRESHOLDS = {
  lateTripMinutes: 30,
  missedPickupMinutes: 15,
  driverOfflineMinutes: 15,
  overdueTripMinutes: 120,
};

const AutomatedAlertsPanel = ({ trips = [], drivers = [], vehicles = [], thresholds = {}, onDismiss }) => {
  const [dismissed, setDismissed] = useState(new Set());
  const [filter, setFilter] = useState('all');
  const [muted, setMuted] = useState(false);

  const mergedThresholds = useMemo(() => ({ ...DEFAULT_THRESHOLDS, ...thresholds }), [thresholds]);

  const allAlerts = useMemo(
    () => generateAlerts({ trips, drivers, vehicles, thresholds: mergedThresholds }),
    [trips, drivers, vehicles, mergedThresholds]
  );

  const activeAlerts = useMemo(
    () => allAlerts.filter(a => !dismissed.has(a.id)),
    [allAlerts, dismissed]
  );

  const filtered = useMemo(() => {
    if (filter === 'all') return activeAlerts;
    return activeAlerts.filter(a => a.severity === filter);
  }, [activeAlerts, filter]);

  const counts = useMemo(() => {
    const c = { critical: 0, warning: 0, info: 0, total: 0 };
    activeAlerts.forEach(a => { c[a.severity]++; c.total++; });
    return c;
  }, [activeAlerts]);

  const handleDismiss = (id) => {
    setDismissed(prev => new Set([...prev, id]));
    onDismiss?.(id);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 bg-gradient-to-r from-orange-50 to-amber-50 border-b border-slate-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center relative">
              {muted ? <BellOff size={16} className="text-orange-500" /> : <Bell size={16} className="text-orange-600" />}
              {counts.total > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white rounded-full flex items-center justify-center text-[8px] font-semibold">
                  {counts.total > 9 ? '9+' : counts.total}
                </span>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-900">Automated Alerts</p>
              <p className="text-[10px] text-slate-500">{counts.total} active</p>
            </div>
          </div>
          <button onClick={() => setMuted(m => !m)} className="p-1.5 rounded-lg hover:bg-orange-100 text-orange-500 hover:text-orange-700">
            {muted ? <BellOff size={14} /> : <Bell size={14} />}
          </button>
        </div>

        <div className="flex items-center gap-1.5 mt-2">
          {['all', 'critical', 'warning', 'info'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2 py-1 rounded-lg text-[10px] font-semibold transition-colors ${
                filter === f
                  ? 'bg-white border border-slate-200 text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:bg-white/50'
              }`}
            >
              {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
              {f !== 'all' && (
                <span className="ml-1 text-[9px] font-semibold">{counts[f]}</span>
              )}
              {f === 'all' && (
                <span className="ml-1 text-[9px] font-semibold">{counts.total}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="px-3 py-2 max-h-80 overflow-y-auto space-y-2">
        {filtered.length === 0 && (
          <div className="py-6 text-center">
            <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-2">
              <Bell size={16} className="text-emerald-500" />
            </div>
            <p className="text-xs font-semibold text-slate-500">No alerts</p>
            <p className="text-[10px] text-slate-400">All systems operating normally</p>
          </div>
        )}
        {filtered.map(alert => (
          <AlertCard key={alert.id} alert={alert} onDismiss={handleDismiss} />
        ))}
      </div>
    </div>
  );
};

export default AutomatedAlertsPanel;
