import React, { memo } from 'react';
import { Truck, Calendar, Shield, Wrench, Gauge, Fuel, AlertTriangle, CheckCircle2 } from 'lucide-react';

export default memo(function VehicleDetailsCard({ vehicle, driver, compact = false }) {
  if (!vehicle && !driver) return null;

  const vehicleName = vehicle?.name || driver?.vehicle || 'No vehicle';
  const make = vehicle?.make || '';
  const model = vehicle?.model || '';
  const year = vehicle?.year || '';
  const color = vehicle?.color || '';
  const plate = vehicle?.plate || '';
  const odometer = vehicle?.odometer || driver?.odometer || 0;
  const nextOilChange = driver?.nextOilChange || 50000;
  const oilDue = nextOilChange - odometer;

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center">
          <Truck size={14} className="text-blue-600" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-bold text-slate-900 truncate">{vehicleName}</p>
          <p className="text-[9px] text-slate-500">
            {year && `${year} `}{make && `${make} `}{model && `${model}`}
            {plate && ` · ${plate}`}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 border border-blue-200 flex items-center justify-center">
            <Truck size={18} className="text-blue-600" />
          </div>
          <div>
            <p className="text-sm font-black text-slate-900">{vehicleName}</p>
            <p className="text-[11px] text-slate-500">
              {year && `${year} `}{make && `${make} `}{model && `${model}`}
              {color && ` · ${color}`}
            </p>
          </div>
        </div>
      </div>

      {/* Details Grid */}
      <div className="px-4 py-3 grid grid-cols-2 gap-3">
        {plate && (
          <div className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2">
            <div className="w-6 h-6 rounded bg-blue-100 flex items-center justify-center">
              <span className="text-[8px] font-black text-blue-600">PLT</span>
            </div>
            <div>
              <p className="text-[9px] text-slate-500 uppercase">Plate</p>
              <p className="text-xs font-bold text-slate-900">{plate}</p>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2">
          <Gauge size={14} className="text-slate-400" />
          <div>
            <p className="text-[9px] text-slate-500 uppercase">Odometer</p>
            <p className="text-xs font-bold text-slate-900">{odometer?.toLocaleString() || 0} mi</p>
          </div>
        </div>

        {vehicle?.type && (
          <div className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2">
            <Truck size={14} className="text-slate-400" />
            <div>
              <p className="text-[9px] text-slate-500 uppercase">Type</p>
              <p className="text-xs font-bold text-slate-900">{vehicle.type}</p>
            </div>
          </div>
        )}

        {vehicle?.fuelType && (
          <div className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2">
            <Fuel size={14} className="text-slate-400" />
            <div>
              <p className="text-[9px] text-slate-500 uppercase">Fuel</p>
              <p className="text-xs font-bold text-slate-900">{vehicle.fuelType}</p>
            </div>
          </div>
        )}
      </div>

      {/* Maintenance Status */}
      <div className="px-4 py-3 border-t border-slate-100">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Maintenance</p>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wrench size={12} className="text-slate-400" />
              <span className="text-[11px] text-slate-600">Oil Change</span>
            </div>
            {oilDue > 500 ? (
              <span className="flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[10px] font-bold">
                <CheckCircle2 size={10} /> {oilDue.toLocaleString()} mi due
              </span>
            ) : oilDue > 0 ? (
              <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] font-bold">
                <AlertTriangle size={10} /> {oilDue.toLocaleString()} mi due
              </span>
            ) : (
              <span className="flex items-center gap-1 px-2 py-0.5 bg-rose-100 text-rose-700 rounded text-[10px] font-bold">
                <AlertTriangle size={10} /> Overdue
              </span>
            )}
          </div>

          {vehicle?.insuranceExpiry && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield size={12} className="text-slate-400" />
                <span className="text-[11px] text-slate-600">Insurance</span>
              </div>
              {new Date(vehicle.insuranceExpiry) > new Date() ? (
                <span className="flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[10px] font-bold">
                  <CheckCircle2 size={10} /> Expires {new Date(vehicle.insuranceExpiry).toLocaleDateString()}
                </span>
              ) : (
                <span className="flex items-center gap-1 px-2 py-0.5 bg-rose-100 text-rose-700 rounded text-[10px] font-bold">
                  <AlertTriangle size={10} /> Expired
                </span>
              )}
            </div>
          )}

          {vehicle?.lastService && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar size={12} className="text-slate-400" />
                <span className="text-[11px] text-slate-600">Last Service</span>
              </div>
              <span className="text-[11px] font-medium text-slate-700">{new Date(vehicle.lastService).toLocaleDateString()}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
