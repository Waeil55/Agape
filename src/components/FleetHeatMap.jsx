import React, { useMemo } from 'react';
import { MapPin, Truck, Activity, Clock, TrendingUp } from 'lucide-react';

export function FleetHeatMap({ drivers = [], trips = [], driverTelemetry = [] }) {
  const zones = useMemo(() => {
    const zoneMap = {};

    trips.forEach(trip => {
      if (!trip.pickup && !trip.dropoff) return;

      const pickupZone = extractZone(trip.pickup);
      const dropoffZone = extractZone(trip.dropoff);

      if (pickupZone) {
        if (!zoneMap[pickupZone]) zoneMap[pickupZone] = { pickups: 0, dropoffs: 0, trips: 0 };
        zoneMap[pickupZone].pickups++;
        zoneMap[pickupZone].trips++;
      }
      if (dropoffZone) {
        if (!zoneMap[dropoffZone]) zoneMap[dropoffZone] = { pickups: 0, dropoffs: 0, trips: 0 };
        zoneMap[dropoffZone].dropoffs++;
        zoneMap[dropoffZone].trips++;
      }
    });

    return Object.entries(zoneMap)
      .map(([zone, data]) => ({ zone, ...data }))
      .sort((a, b) => b.trips - a.trips)
      .slice(0, 10);
  }, [trips]);

  const activityStats = useMemo(() => {
    const now = new Date();
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const recentTrips = trips.filter(t => {
      const tripTime = new Date(t.completedAt || t.updatedAtLocal || 0);
      return tripTime >= hourAgo;
    });

    const activeDrivers = drivers.filter(d =>
      d.clockedIn && d.status !== 'Offline'
    );

    const movingDrivers = driverTelemetry.filter(t =>
      t.movementState === 'moving'
    );

    return {
      activeDrivers: activeDrivers.length,
      totalDrivers: drivers.length,
      recentTrips: recentTrips.length,
      movingDrivers: movingDrivers.length,
      stoppedDrivers: activeDrivers.length - movingDrivers.length,
    };
  }, [drivers, trips, driverTelemetry]);

  return (
    <div className="space-y-4">
      {/* Activity Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl border border-slate-200 p-3 text-center">
          <div className="w-8 h-8 mx-auto rounded-lg bg-emerald-50 flex items-center justify-center mb-2">
            <Truck size={16} className="text-emerald-600" />
          </div>
          <p className="text-xl font-black text-slate-900">{activityStats.activeDrivers}</p>
          <p className="text-[10px] text-slate-500">Active Drivers</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-3 text-center">
          <div className="w-8 h-8 mx-auto rounded-lg bg-blue-50 flex items-center justify-center mb-2">
            <Activity size={16} className="text-blue-600" />
          </div>
          <p className="text-xl font-black text-slate-900">{activityStats.movingDrivers}</p>
          <p className="text-[10px] text-slate-500">Moving Now</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-3 text-center">
          <div className="w-8 h-8 mx-auto rounded-lg bg-amber-50 flex items-center justify-center mb-2">
            <Clock size={16} className="text-amber-600" />
          </div>
          <p className="text-xl font-black text-slate-900">{activityStats.stoppedDrivers}</p>
          <p className="text-[10px] text-slate-500">Stopped</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-3 text-center">
          <div className="w-8 h-8 mx-auto rounded-lg bg-purple-50 flex items-center justify-center mb-2">
            <TrendingUp size={16} className="text-purple-600" />
          </div>
          <p className="text-xl font-black text-slate-900">{activityStats.recentTrips}</p>
          <p className="text-[10px] text-slate-500">Last Hour</p>
        </div>
      </div>

      {/* Hot Zones */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-900">Hot Zones</h3>
          <p className="text-[10px] text-slate-500">Most active pickup/dropoff locations</p>
        </div>
        <div className="divide-y divide-slate-100">
          {zones.length === 0 ? (
            <div className="px-4 py-6 text-center text-slate-400 text-sm">
              No zone data available
            </div>
          ) : (
            zones.map((zone, i) => {
              const maxTrips = zones[0]?.trips || 1;
              const barWidth = (zone.trips / maxTrips) * 100;

              return (
                <div key={zone.zone} className="px-4 py-2.5 flex items-center gap-3">
                  <div className="w-6 h-6 rounded-lg bg-blue-50 flex items-center justify-center text-[10px] font-bold text-blue-600 shrink-0">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-900 truncate">{zone.zone}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-[10px] text-emerald-600">↑ {zone.pickups} pickup</span>
                      <span className="text-[10px] text-rose-600">↓ {zone.dropoffs} dropoff</span>
                    </div>
                  </div>
                  <div className="w-20 h-2 bg-slate-100 rounded-full overflow-hidden shrink-0">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full"
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                  <span className="text-xs font-bold text-slate-700 w-8 text-right">{zone.trips}</span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Driver Activity Grid */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-900">Driver Activity</h3>
          <p className="text-[10px] text-slate-500">Current status of all drivers</p>
        </div>
        <div className="p-3 grid grid-cols-5 sm:grid-cols-10 gap-1.5">
          {drivers.map(driver => {
            const isMoving = driverTelemetry.find(t => t.driverId === driver.id)?.movementState === 'moving';

            return (
              <div
                key={driver.id}
                className={`aspect-square rounded-lg flex items-center justify-center text-[9px] font-bold uppercase ${
                  isMoving ? 'bg-emerald-100 text-emerald-700' :
                  'bg-amber-100 text-amber-700'
                }`}
                title={`${driver.name || 'Driver'} - ${isMoving ? 'Moving' : 'Stopped'}`}
              >
                {(driver.name || '?')[0]}
              </div>
            );
          })}
        </div>
        <div className="px-4 py-2 border-t border-slate-100 flex items-center gap-4 text-[10px]">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-emerald-100 border border-emerald-200" />
            <span className="text-slate-600">Moving</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-amber-100 border border-amber-200" />
            <span className="text-slate-600">Stopped</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function extractZone(address) {
  if (!address) return null;
  const parts = address.split(',');
  if (parts.length >= 2) {
    return parts[1].trim();
  }
  return parts[0].trim();
}

export default FleetHeatMap;
