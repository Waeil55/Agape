import React, { useState, useEffect, useMemo } from 'react';
import { Gauge, ChevronRight, ChevronDown, Check, AlertCircle, Info } from 'lucide-react';
import { designTokens } from '../../utils/designTokens';
import { buildOdometerDistance, buildTravelDuration } from '../../utils/tripDate';

const OdometerSection = ({ trip, driver, readOnly = false, onUpdate }) => {
  const tokens = designTokens;
  const [editing, setEditing] = useState(false);
  const [pickupOdo, setPickupOdo] = useState(trip?.pickupOdometer || '');
  const [dropoffOdo, setDropoffOdo] = useState(trip?.dropoffOdometer || '');
  const [saving, setSaving] = useState(false);

  const distance = useMemo(() => {
    const start = Number(pickupOdo);
    const end = Number(dropoffOdo);
    if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;
    return (end - start).toFixed(1);
  }, [pickupOdo, dropoffOdo]);

  const travelTime = useMemo(() => {
    return buildTravelDuration(trip?.arrivalTime || trip?.pickupArrivalTime, trip?.arrivalDropoffTime || trip?.completedAt);
  }, [trip?.arrivalTime, trip?.pickupArrivalTime, trip?.arrivalDropoffTime, trip?.completedAt]);

  useEffect(() => {
    setPickupOdo(trip?.pickupOdometer || '');
    setDropoffOdo(trip?.dropoffOdometer || '');
  }, [trip?.pickupOdometer, trip?.dropoffOdometer]);

  const handleSave = async () => {
    if (!onUpdate || saving) return;
    const pickup = Number(pickupOdo);
    const dropoff = Number(dropoffOdo);
    if (Number.isNaN(pickup) || Number.isNaN(dropoff) || dropoff < pickup) return;
    
    setSaving(true);
    try {
      await onUpdate(trip.id, trip.status || 'Assigned', {
        pickupOdometer: pickup,
        dropoffOdometer: dropoff,
        distance: distance ? `${distance} mi` : '',
        workflowUpdatedAt: new Date().toISOString(),
      });
      setEditing(false);
    } catch (err) {
      console.error('[OdometerSection] Save error:', err);
    } finally {
      setSaving(false);
    }
  };

  const hasOdometer = trip?.pickupOdometer || trip?.dropoffOdometer;

  return (
    <div className={`rounded-2xl border overflow-hidden ${tokens.colors.background.secondary} ${tokens.elevation.sm}`}>
      <div className="px-4 py-3 flex items-center justify-between border-b border-slate-200">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
            <Gauge size={18} className="text-emerald-600" />
          </div>
          <h3 className="font-semibold text-slate-900">Odometer</h3>
        </div>
        {!readOnly && (
          <button
            type="button"
            onClick={() => setEditing(!editing)}
            disabled={saving}
            className={`px-3 py-1.5 rounded-lg ${tokens.typography.caption1} transition-colors touch-manipulation ${
              editing ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            } ${saving ? 'opacity-50' : ''}`}
          >
            {editing ? (saving ? 'Saving…' : 'Save') : 'Edit'}
          </button>
        )}
      </div>

      <div className="p-4 space-y-4">
        {editing ? (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Pickup Odometer (mi)</label>
              <input
                type="number"
                min="0"
                step="0.1"
                value={pickupOdo}
                onChange={(e) => setPickupOdo(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:border-blue-500 focus:outline-none"
                placeholder="0.0"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Dropoff Odometer (mi)</label>
              <input
                type="number"
                min="0"
                step="0.1"
                value={dropoffOdo}
                onChange={(e) => setDropoffOdo(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:border-blue-500 focus:outline-none"
                placeholder="0.0"
              />
            </div>
            {distance !== null && (
              <div className="col-span-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                <div className="flex items-center gap-2">
                  <Check size={16} className="text-emerald-600" />
                  <span className="font-semibold text-emerald-800">Distance: {distance} mi</span>
                </div>
              </div>
            )}
            <div className="col-span-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setPickupOdo(trip?.pickupOdometer || ''); setDropoffOdo(trip?.dropoffOdometer || ''); setEditing(false); }}
                className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 font-semibold text-sm touch-manipulation"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || distance === null}
                className="px-4 py-2 rounded-xl bg-blue-600 text-white font-semibold text-sm touch-manipulation disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        ) : hasOdometer ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-slate-50 rounded-xl">
              <p className={`${tokens.typography.caption2Upper} ${tokens.colors.foreground.tertiary}`} style={{ letterSpacing: '0.08em' }}>Pickup</p>
              <p className={`${tokens.typography.headline} ${tokens.colors.foreground.primary} mt-1 font-mono`}>{Number(trip.pickupOdometer).toLocaleString()} mi</p>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl">
              <p className={`${tokens.typography.caption2Upper} ${tokens.colors.foreground.tertiary}`} style={{ letterSpacing: '0.08em' }}>Dropoff</p>
              <p className={`${tokens.typography.headline} ${tokens.colors.foreground.primary} mt-1 font-mono`}>{Number(trip.dropoffOdometer).toLocaleString()} mi</p>
            </div>
            {distance !== null && (
              <div className="col-span-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2">
                <Check size={18} className="text-emerald-600 shrink-0" />
                <div>
                  <p className={`${tokens.typography.caption2Upper} text-emerald-700`} style={{ letterSpacing: '0.08em' }}>Trip Distance</p>
                  <p className={`${tokens.typography.headline} text-emerald-900 font-mono`}>{distance} mi</p>
                </div>
              </div>
            )}
            {travelTime && (
              <div className="col-span-2 p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center gap-2">
                <Clock size={18} className="text-blue-600 shrink-0" />
                <div>
                  <p className={`${tokens.typography.caption2Upper} text-blue-700`} style={{ letterSpacing: '0.08em' }}>Travel Time</p>
                  <p className={`${tokens.typography.headline} text-blue-900`}>{travelTime}</p>
                </div>
              </div>
            )}
          </div>
        ) : !readOnly ? (
          <div className="text-center py-6">
            <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
              <Gauge size={28} className="text-slate-400" />
            </div>
            <p className="text-sm font-medium text-slate-500">No odometer readings</p>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-xl font-semibold text-sm touch-manipulation"
            >
              Add Readings
            </button>
          </div>
        ) : (
          <div className="text-center py-6 text-slate-400">
            <Gauge size={28} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">No odometer data</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(OdometerSection);