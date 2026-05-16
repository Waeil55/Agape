import React, { useState } from 'react';
import { User, Truck, Plus, Trash2, Edit2, AlertCircle, X, Save, ClipboardList, Upload, CheckSquare, Clock, Phone, MessageSquare } from 'lucide-react';

const DriversVehiclesPage = ({ role, drivers, setDrivers, dispatchers = [], addAuditLog, currentUser, trips, onAssignTrip, onUploadForDriver, requestAuthAction, vehicles = [], setVehicles }) => {
  const [activeTab, setActiveTab] = useState('drivers');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ 
    currentZone: '', vin: '', insuranceExpiry: '', capacity: '1',
    licenseNumber: '', cdlStatus: 'Active', assignedDispatcher: ''
  });
  const [assignDriver, setAssignDriver] = useState(null);
  const [selectedTrips, setSelectedTrips] = useState([]);
  const [editScheduleDriver, setEditScheduleDriver] = useState(null);
  const [scheduleForm, setScheduleForm] = useState({ start: '09:00 AM', end: '10:00 AM', status: 'free' });
  const [editingScheduleIdx, setEditingScheduleIdx] = useState(null);
  const [vehicleForm, setVehicleForm] = useState(false);
  const [editVehicleId, setEditVehicleId] = useState(null);
  const [vForm, setVForm] = useState({ name: '', make: '', model: '', year: '', color: '', plate: '', vin: '', odometer: '' });
  
  const resetVForm = () => setVForm({ name: '', make: '', model: '', year: '', color: '', plate: '', vin: '', odometer: '' });
  
  const openVAdd = () => { setEditVehicleId(null); resetVForm(); setVehicleForm(true); };
  
  const openVEdit = (v) => {
    setEditVehicleId(v.id);
    setVForm({ name: v.name, make: v.make || '', model: v.model || '', year: v.year || '', color: v.color || '', plate: v.plate || '', vin: v.vin || '', odometer: v.odometer || '' });
    setVehicleForm(true);
  };
  
  const saveVehicle = () => {
    if (!vForm.name.trim()) return;
    if (editVehicleId) {
      setVehicles(prev => prev.map(v => v.id === editVehicleId ? { ...v, ...vForm } : v));
      addAuditLog('Vehicle Updated', `${currentUser} updated vehicle ${vForm.name}.`, 'blue');
    } else {
      const id = `VHC-${String(vehicles.length + 1).padStart(3, '0')}`;
      setVehicles(prev => [...prev, { ...vForm, id, status: 'Available' }]);
      addAuditLog('Vehicle Added', `${currentUser} added vehicle ${vForm.name}.`, 'emerald');
    }
    setVehicleForm(false);
    resetVForm();
  };
  
  const deleteVehicle = (v) => {
    if (!window.confirm(`Delete vehicle ${v.name}?`)) return;
    setVehicles(prev => prev.filter(x => x.id !== v.id));
    addAuditLog('Vehicle Deleted', `${currentUser} deleted vehicle ${v.name}.`, 'rose');
  };

  
  // Filter drivers for dispatcher role — only show drivers assigned to this dispatcher
  const filteredDrivers = role === 'dispatcher'
    ? drivers.filter(d => {
        const disp = dispatchers.find(ds => ds.email === currentUser);
        return disp && d.assignedDispatcher === disp.id;
      })
    : drivers;

  const resetForm = () => setForm({ name: '', email: '', phone: '', vehicle: '', status: 'Available', currentZone: '', assignedDispatcher: '' });

  const openAdd = () => { setEditing(null); resetForm(); setShowForm(true); };

  const openEdit = (d) => {
    setEditing(d.id);
    setForm({ 
      name: d.name, email: d.email || '', phone: d.phone || '', 
      vehicle: d.vehicle || '', status: d.status, 
      currentZone: d.currentZone || '',
      vin: d.vin || '', insuranceExpiry: d.insuranceExpiry || '',
      capacity: d.capacity || '1',
      licenseNumber: d.licenseNumber || '',
      cdlStatus: d.cdlStatus || 'Active',
      assignedDispatcher: d.assignedDispatcher || ''
    });
    setShowForm(true);
  };

  const saveDriver = () => {
    if (!form.name.trim()) return;
    if (editing) {
      setDrivers(prev => prev.map(d => d.id === editing ? { ...d, ...form } : d));
      addAuditLog('Driver Updated', `${currentUser} updated driver ${form.name}.`, 'blue');
    } else {
      const id = `DRV-${String(drivers.length + 1).padStart(3, '0')}`;
      setDrivers(prev => [...prev, {
        id, name: form.name, status: form.status, vehicle: form.vehicle, dist: '--',
        currentZone: form.currentZone, odometer: 0, nextOilChange: 5000,
        assignedTo: '', schedule: [],
        email: form.email, phone: form.phone,
      }]);
      addAuditLog('Driver Added', `${currentUser} added driver ${form.name}.`, 'emerald');
    }
    setShowForm(false);
    resetForm();
  };

  const deleteDriver = (driver) => {
    const doDelete = () => {
      setDrivers(prev => prev.filter(d => d.id !== driver.id));
      addAuditLog('Driver Deleted', `${currentUser} deleted driver ${driver.name}.`, 'rose');
    };
    if (requestAuthAction) {
      requestAuthAction('Delete Driver', doDelete);
    } else {
      doDelete();
    }
  };

  const toggleTripSelection = (tripId) => {
    setSelectedTrips(prev => prev.includes(tripId) ? prev.filter(id => id !== tripId) : [...prev, tripId]);
  };

  const assignSelectedTrips = () => {
    if (!assignDriver || selectedTrips.length === 0) return;
    selectedTrips.forEach(tripId => onAssignTrip(tripId, assignDriver.id));
    addAuditLog('Bulk Assign', `${currentUser} assigned ${selectedTrips.length} trips to ${assignDriver.name}`, 'emerald');
    setSelectedTrips([]);
    setAssignDriver(null);
  };

  const unassignedTrips = trips.filter(t => t.status === 'Unassigned');

  const openScheduleEditor = (driver) => {
    setEditScheduleDriver(driver);
    setScheduleForm({ start: '09:00 AM', end: '10:00 AM', status: 'free' });
    setEditingScheduleIdx(null);
  };

  const saveScheduleBlock = () => {
    if (!editScheduleDriver || !scheduleForm.start || !scheduleForm.end) return;
    setDrivers(prev => prev.map(d => {
      if (d.id !== editScheduleDriver.id) return d;
      const schedule = [...(d.schedule || [])];
      if (editingScheduleIdx !== null) {
        schedule[editingScheduleIdx] = { start: scheduleForm.start, end: scheduleForm.end, status: scheduleForm.status };
      } else {
        schedule.push({ start: scheduleForm.start, end: scheduleForm.end, status: scheduleForm.status });
      }
      return { ...d, schedule };
    }));
    setScheduleForm({ start: '09:00 AM', end: '10:00 AM', status: 'free' });
    setEditingScheduleIdx(null);
  };

  const editScheduleBlock = (idx) => {
    const block = editScheduleDriver.schedule[idx];
    if (block) {
      setScheduleForm({ start: block.start, end: block.end, status: block.status });
      setEditingScheduleIdx(idx);
    }
  };

  const deleteScheduleBlock = (idx) => {
    if (!editScheduleDriver) return;
    setDrivers(prev => prev.map(d => {
      if (d.id !== editScheduleDriver.id) return d;
      const schedule = (d.schedule || []).filter((_, i) => i !== idx);
      return { ...d, schedule };
    }));
    if (editingScheduleIdx === idx) {
      setScheduleForm({ start: '09:00 AM', end: '10:00 AM', status: 'free' });
      setEditingScheduleIdx(null);
    }
  };

  const getScheduleBlocks = (schedule) => {
    if (!schedule) return [];
    return schedule.map(slot => {
      const toMin = (t) => {
        const m = t.match(/(\d+):(\d+)\s*(AM|PM)/i);
        if (!m) return 0;
        let h = parseInt(m[1], 10);
        if (m[3].toUpperCase() === 'PM' && h !== 12) h += 12;
        if (m[3].toUpperCase() === 'AM' && h === 12) h = 0;
        return h * 60 + parseInt(m[2], 10);
      };
      return { ...slot, startMin: toMin(slot.start), endMin: toMin(slot.end) };
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex gap-2 sm:gap-4 flex-wrap">
        {[
          { id: 'drivers', label: 'Drivers', icon: User },
          { id: 'vehicles', label: 'Vehicles', icon: Truck }
        ].map(tab => {
          const Icon = tab.icon;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`px-4 sm:px-6 py-2.5 sm:py-3 rounded-lg font-semibold flex items-center gap-2 transition text-sm ${
                activeTab === tab.id ? 'bg-blue-600 text-white' : 'bg-white text-slate-700 border border-slate-200 hover:border-slate-300'
              }`}>
              <Icon size={16} /> {tab.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-0">
        <h2 className="text-xl sm:text-2xl font-bold text-slate-900">
          {activeTab === 'drivers' ? 'Drivers' : 'Vehicles'}
        </h2>
        {(role === 'admin' || role === 'dispatcher') && (
          <button onClick={activeTab === 'drivers' ? openAdd : openVAdd} className="w-full sm:w-auto px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2 text-sm">
            <Plus size={18} /> Add {activeTab === 'drivers' ? 'Driver' : 'Vehicle'}
          </button>
        )}
      </div>

      {activeTab === 'drivers' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-[11px] sm:text-sm font-semibold text-slate-600">Name</th>
                  <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-[11px] sm:text-sm font-semibold text-slate-600 hidden sm:table-cell">Vehicle</th>
                  <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-[11px] sm:text-sm font-semibold text-slate-600 hidden md:table-cell">Zone</th>
                  <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-[11px] sm:text-sm font-semibold text-slate-600 hidden lg:table-cell">Dispatcher</th>
                  <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-[11px] sm:text-sm font-semibold text-slate-600">Status</th>
                  <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-[11px] sm:text-sm font-semibold text-slate-600">Assign</th>
                  <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-[11px] sm:text-sm font-semibold text-slate-600">Contact</th>
                  <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-[11px] sm:text-sm font-semibold text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredDrivers.length === 0 ? (
                  <tr><td colSpan="6" className="px-3 sm:px-6 py-8 sm:py-12 text-center text-slate-500 text-sm">{role === 'dispatcher' ? 'No drivers assigned to you yet.' : 'No drivers yet. Click "Add Driver" to create one.'}</td></tr>
                ) : (
                  filteredDrivers.map((d) => {
                    const assignedCount = trips.filter(t => t.driverId === d.id).length;
                    return (
                      <tr key={d.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-3 sm:px-6 py-2 sm:py-4 text-xs sm:text-sm font-semibold text-slate-900">{d.name}</td>
                        <td className="px-3 sm:px-6 py-2 sm:py-4 text-xs sm:text-sm text-slate-600 hidden sm:table-cell">{d.vehicle || '-'}</td>
                        <td className="px-3 sm:px-6 py-2 sm:py-4 text-xs sm:text-sm text-slate-600 hidden md:table-cell">{d.currentZone || '-'}</td>
                        <td className="px-3 sm:px-6 py-2 sm:py-4 text-xs sm:text-sm text-slate-600 hidden lg:table-cell">
                          {d.assignedDispatcher ? (dispatchers.find(ds => ds.id === d.assignedDispatcher)?.name || d.assignedDispatcher) : '-'}
                        </td>
                        <td className="px-3 sm:px-6 py-2 sm:py-4">
                          <span className={`px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-semibold ${d.status === 'Available' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{d.status}</span>
                          {assignedCount > 0 && <span className="ml-1 text-[10px] text-blue-600 font-semibold">({assignedCount})</span>}
                        </td>
                        <td className="px-3 sm:px-6 py-2 sm:py-4">
                          {d.phone ? (
                            <div className="flex gap-2">
                              <a href={`tel:${d.phone}`} className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 transition"><Phone size={14} /></a>
                              <a href={`sms:${d.phone}`} className="p-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition"><MessageSquare size={14} /></a>
                            </div>
                          ) : <span className="text-[10px] text-slate-400 italic">No Phone</span>}
                        </td>
                        <td className="px-3 sm:px-6 py-2 sm:py-4">
                          <div className="flex gap-1">
                            <button onClick={() => setAssignDriver(d)} className="px-2 py-1 bg-blue-100 text-blue-700 rounded-lg text-[10px] font-semibold hover:bg-blue-200 flex items-center gap-1" title="Assign trips">
                              <ClipboardList size={12} /> Trips
                            </button>
                            {onUploadForDriver && (
                              <button onClick={() => onUploadForDriver(d.id)} className="px-2 py-1 bg-indigo-100 text-indigo-700 rounded-lg text-[10px] font-semibold hover:bg-indigo-200 flex items-center gap-1" title="Upload & assign">
                                <Upload size={12} /> Upload
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-3 sm:px-6 py-2 sm:py-4 flex gap-1 sm:gap-2">
                          <button onClick={() => openScheduleEditor(d)} className="p-1.5 sm:p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition" title="Edit Schedule"><Clock size={14} /></button>
                          <button onClick={() => openEdit(d)} className="p-1.5 sm:p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition"><Edit2 size={14} /></button>
                          {(role === 'admin' || role === 'dispatcher') && (
                            <button onClick={() => deleteDriver(d)} className="p-1.5 sm:p-2 text-red-600 hover:bg-red-50 rounded-lg transition"><Trash2 size={14} /></button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'vehicles' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-[11px] sm:text-sm font-semibold text-slate-600">Name</th>
                  <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-[11px] sm:text-sm font-semibold text-slate-600 hidden sm:table-cell">Make / Model</th>
                  <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-[11px] sm:text-sm font-semibold text-slate-600 hidden md:table-cell">Year / Color</th>
                  <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-[11px] sm:text-sm font-semibold text-slate-600 hidden lg:table-cell">Plate / VIN</th>
                  <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-[11px] sm:text-sm font-semibold text-slate-600 hidden lg:table-cell">Odometer</th>
                  <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-[11px] sm:text-sm font-semibold text-slate-600">Driver</th>
                  <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-[11px] sm:text-sm font-semibold text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {vehicles.length === 0 ? (
                  <tr><td colSpan="7" className="px-3 sm:px-6 py-8 sm:py-12 text-center text-slate-500 text-sm">No vehicles yet. Click "Add Vehicle" to create one.</td></tr>
                ) : (
                  vehicles.map((v) => {
                    const assignedDriver = drivers.find(d => d.vehicle === v.name);
                    return (
                      <tr key={v.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-3 sm:px-6 py-2 sm:py-4 text-xs sm:text-sm font-semibold text-slate-900">{v.name}</td>
                        <td className="px-3 sm:px-6 py-2 sm:py-4 text-xs sm:text-sm text-slate-600 hidden sm:table-cell">{v.make || '-'} {v.model || ''}</td>
                        <td className="px-3 sm:px-6 py-2 sm:py-4 text-xs sm:text-sm text-slate-600 hidden md:table-cell">{v.year || '-'} / {v.color || '-'}</td>
                        <td className="px-3 sm:px-6 py-2 sm:py-4 text-xs sm:text-sm text-slate-600 hidden lg:table-cell font-mono">{v.plate || '-'} / {v.vin ? v.vin.slice(-6) : '-'}</td>
                        <td className="px-3 sm:px-6 py-2 sm:py-4 text-xs sm:text-sm text-slate-600 hidden lg:table-cell">{v.odometer ? Number(v.odometer).toLocaleString() : '0'} mi</td>
                        <td className="px-3 sm:px-6 py-2 sm:py-4 text-xs sm:text-sm text-slate-600">{assignedDriver?.name || <span className="italic text-slate-400">Unassigned</span>}</td>
                        <td className="px-3 sm:px-6 py-2 sm:py-4">
                          <div className="flex gap-1">
                            <button onClick={() => openVEdit(v)} className="p-1.5 sm:p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition" title="Edit"><Edit2 size={14} /></button>
                            {(role === 'admin' || role === 'dispatcher') && (
                              <button onClick={() => deleteVehicle(v)} className="p-1.5 sm:p-2 text-red-600 hover:bg-red-50 rounded-lg transition" title="Delete"><Trash2 size={14} /></button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Assign Trips Modal */}
      {assignDriver && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-3 sm:p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto mx-0 sm:mx-4">
            <div className="p-4 sm:p-8">
              <div className="flex justify-between items-center mb-4 sm:mb-6">
                <div>
                  <h3 className="text-lg sm:text-xl font-bold text-slate-900">Assign Trips to {assignDriver.name}</h3>
                  <p className="text-xs sm:text-sm text-slate-500">{unassignedTrips.length} unassigned trips available</p>
                </div>
                <button onClick={() => { setAssignDriver(null); setSelectedTrips([]); }} className="p-1.5 sm:p-2 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
              </div>

              {unassignedTrips.length === 0 ? (
                <div className="p-8 text-center text-slate-500">
                  <CheckSquare size={40} className="mx-auto text-slate-300 mb-4" />
                  <p className="font-semibold">No unassigned trips</p>
                  <p className="text-sm mt-1">All trips are already assigned.</p>
                </div>
              ) : (
                <>
                  <div className="max-h-64 sm:max-h-80 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
                    {unassignedTrips.map(trip => (
                      <label key={trip.id} className={`flex items-center gap-3 p-3 sm:p-4 cursor-pointer hover:bg-slate-50 transition ${selectedTrips.includes(trip.id) ? 'bg-blue-50' : ''}`}>
                        <input type="checkbox" checked={selectedTrips.includes(trip.id)} onChange={() => toggleTripSelection(trip.id)} className="w-4 h-4 accent-blue-600 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs sm:text-sm font-semibold text-slate-900 truncate">{trip.patient}</p>
                          <p className="text-[10px] sm:text-xs text-slate-500 truncate">{trip.pickup} → {trip.dropoff}</p>
                        </div>
                        <span className="text-[10px] sm:text-xs text-slate-500 shrink-0">{trip.time}</span>
                      </label>
                    ))}
                  </div>

                  <div className="flex items-center justify-between mt-4 sm:mt-6">
                    <p className="text-xs sm:text-sm text-slate-600 font-semibold">{selectedTrips.length} trip{selectedTrips.length !== 1 ? 's' : ''} selected</p>
                    <div className="flex gap-2 sm:gap-3">
                      <button onClick={() => { setAssignDriver(null); setSelectedTrips([]); }} className="px-4 py-2 border border-slate-300 text-slate-700 font-semibold rounded-lg hover:bg-slate-50 text-sm">Cancel</button>
                      <button onClick={assignSelectedTrips} disabled={selectedTrips.length === 0} className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm">
                        <CheckSquare size={16} /> Assign {selectedTrips.length > 0 ? `(${selectedTrips.length})` : ''}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Schedule Editor Modal */}
      {editScheduleDriver && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-3 sm:p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto mx-0 sm:mx-4">
            <div className="p-4 sm:p-8">
              <div className="flex justify-between items-center mb-4 sm:mb-6">
                <div>
                  <h3 className="text-lg sm:text-xl font-bold text-slate-900">Schedule: {editScheduleDriver.name}</h3>
                  <p className="text-xs sm:text-sm text-slate-500">Manage time blocks (6 AM – 8 PM)</p>
                </div>
                <button onClick={() => { setEditScheduleDriver(null); setEditingScheduleIdx(null); }} className="p-1.5 sm:p-2 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
              </div>

              {/* Timeline Preview */}
              <div className="bg-slate-50 rounded-xl p-4 mb-4 border border-slate-200">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Schedule Timeline</p>
                <div className="relative h-6 bg-slate-200 rounded-lg overflow-hidden">
                  {(() => {
                    const blocks = getScheduleBlocks(editScheduleDriver.schedule);
                    const HOURS_START = 6 * 60;
                    const TOTAL = (20 * 60) - HOURS_START;
                    return blocks.map((block, idx) => {
                      const left = Math.max(0, ((block.startMin - HOURS_START) / TOTAL) * 100);
                      const width = Math.max(1, Math.min(100 - left, ((block.endMin - block.startMin) / TOTAL) * 100));
                      return (
                        <div key={idx}
                          className={`absolute top-0 h-full ${block.status === 'free' ? 'bg-emerald-300' : 'bg-slate-300'}`}
                          style={{ left: `${left}%`, width: `${width}%` }}
                          title={`${block.start} - ${block.end} (${block.status})`}
                        />
                      );
                    });
                  })()}
                  {[6, 8, 10, 12, 14, 16, 18, 20].map(h => {
                    const pos = ((h * 60 - 360) / 840) * 100;
                    return (
                      <div key={h} className="absolute top-0 h-full border-l border-white/40" style={{ left: `${pos}%` }}>
                        <span className="text-[7px] text-slate-400 absolute -bottom-3.5 -translate-x-1/2 font-mono">{h > 12 ? h - 12 : h}{h >= 12 ? 'p' : 'a'}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Existing Schedule Blocks */}
              <div className="space-y-2 mb-4">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Time Blocks</p>
                {(editScheduleDriver.schedule || []).length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-4">No schedule blocks yet. Add one below.</p>
                )}
                {(editScheduleDriver.schedule || []).map((block, idx) => (
                  <div key={idx} className={`flex items-center justify-between p-3 rounded-lg border ${editingScheduleIdx === idx ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 bg-white'}`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${block.status === 'free' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900">{block.start} – {block.end}</p>
                        <p className="text-[10px] text-slate-500 capitalize">{block.status}</p>
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => editScheduleBlock(idx)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg"><Edit2 size={14} /></button>
                      <button onClick={() => deleteScheduleBlock(idx)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Add/Edit Schedule Block Form */}
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                <p className="text-xs font-bold text-slate-700 mb-3">{editingScheduleIdx !== null ? 'Edit Block' : 'Add New Block'}</p>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 mb-1">Start</label>
                    <select value={scheduleForm.start} onChange={(e) => setScheduleForm({ ...scheduleForm, start: e.target.value })} className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold">
                      {['06:00 AM','07:00 AM','08:00 AM','09:00 AM','10:00 AM','11:00 AM','12:00 PM','01:00 PM','02:00 PM','03:00 PM','04:00 PM','05:00 PM','06:00 PM','07:00 PM','08:00 PM'].map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 mb-1">End</label>
                    <select value={scheduleForm.end} onChange={(e) => setScheduleForm({ ...scheduleForm, end: e.target.value })} className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold">
                      {['06:00 AM','07:00 AM','08:00 AM','09:00 AM','10:00 AM','11:00 AM','12:00 PM','01:00 PM','02:00 PM','03:00 PM','04:00 PM','05:00 PM','06:00 PM','07:00 PM','08:00 PM'].map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 mb-1">Status</label>
                    <select value={scheduleForm.status} onChange={(e) => setScheduleForm({ ...scheduleForm, status: e.target.value })} className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold">
                      <option value="free">Free</option>
                      <option value="busy">Busy</option>
                    </select>
                  </div>
                </div>
                <div className="flex gap-2">
                  {editingScheduleIdx !== null && (
                    <button onClick={() => { setScheduleForm({ start: '09:00 AM', end: '10:00 AM', status: 'free' }); setEditingScheduleIdx(null); }} className="px-3 py-1.5 border border-slate-300 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-50">Cancel</button>
                  )}
                  <button onClick={saveScheduleBlock} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 flex items-center gap-1">
                    <Save size={12} /> {editingScheduleIdx !== null ? 'Update' : 'Add'} Block
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="p-8">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-slate-900">{editing ? 'Edit Driver' : 'Add Driver'}</h3>
                <button onClick={() => { setShowForm(false); resetForm(); }} className="p-2 hover:bg-slate-100 rounded-lg"><X size={20} /></button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Name</label>
                  <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500" placeholder="Driver name" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Email</label>
                  <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500" placeholder="email@example.com" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Phone</label>
                  <input type="text" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500" placeholder="(555) 123-4567" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Vehicle</label>
                    <select value={form.vehicle} onChange={(e) => setForm({ ...form, vehicle: e.target.value })} className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500">
                      <option value="">— Select Vehicle —</option>
                      {vehicles.map(v => (
                        <option key={v.id} value={v.name}>{v.name} {v.plate ? `(${v.plate})` : ''}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">VIN Number</label>
                    <input type="text" value={form.vin} onChange={(e) => setForm({ ...form, vin: e.target.value })} className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500" placeholder="17-digit VIN" />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Insurance Expiry</label>
                    <input type="date" value={form.insuranceExpiry} onChange={(e) => setForm({ ...form, insuranceExpiry: e.target.value })} className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Wheelchair Capacity</label>
                    <select value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500">
                      <option value="0">0 (Sedan)</option>
                      <option value="1">1 (Standard Van)</option>
                      <option value="2">2 (Large Van)</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Assigned Dispatcher</label>
                  <select value={form.assignedDispatcher} onChange={(e) => setForm({ ...form, assignedDispatcher: e.target.value })} className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500">
                    <option value="">Unassigned</option>
                    {dispatchers.map(ds => (
                      <option key={ds.id} value={ds.id}>{ds.name} ({ds.email})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Zone</label>
                  <input type="text" value={form.currentZone} onChange={(e) => setForm({ ...form, currentZone: e.target.value })} className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500" placeholder="Downtown Indy" />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => { setShowForm(false); resetForm(); }} className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 font-semibold rounded-lg hover:bg-slate-50">Cancel</button>
                <button onClick={saveDriver} className="flex-1 px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2"><Save size={16} /> {editing ? 'Update' : 'Add'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Vehicle Form Modal */}
      {vehicleForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="p-8">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-slate-900">{editVehicleId ? 'Edit Vehicle' : 'Add Vehicle'}</h3>
                <button onClick={() => { setVehicleForm(false); resetVForm(); }} className="p-2 hover:bg-slate-100 rounded-lg"><X size={20} /></button>
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Vehicle Name</label>
                    <input type="text" required value={vForm.name} onChange={(e) => setVForm({ ...vForm, name: e.target.value })} className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500" placeholder="Van #42" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Make</label>
                    <input type="text" value={vForm.make} onChange={(e) => setVForm({ ...vForm, make: e.target.value })} className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500" placeholder="Ford" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Model</label>
                    <input type="text" value={vForm.model} onChange={(e) => setVForm({ ...vForm, model: e.target.value })} className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500" placeholder="Transit" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Year</label>
                    <input type="text" value={vForm.year} onChange={(e) => setVForm({ ...vForm, year: e.target.value })} className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500" placeholder="2024" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Color</label>
                    <input type="text" value={vForm.color} onChange={(e) => setVForm({ ...vForm, color: e.target.value })} className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500" placeholder="White" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">License Plate</label>
                    <input type="text" value={vForm.plate} onChange={(e) => setVForm({ ...vForm, plate: e.target.value })} className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500" placeholder="ABC-1234" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">VIN</label>
                    <input type="text" value={vForm.vin} onChange={(e) => setVForm({ ...vForm, vin: e.target.value })} className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500" placeholder="17-digit VIN" maxLength="17" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Odometer</label>
                    <input type="number" value={vForm.odometer} onChange={(e) => setVForm({ ...vForm, odometer: e.target.value })} className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500" placeholder="0" />
                  </div>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => { setVehicleForm(false); resetVForm(); }} className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 font-semibold rounded-lg hover:bg-slate-50">Cancel</button>
                <button onClick={saveVehicle} className="flex-1 px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2"><Save size={16} /> {editVehicleId ? 'Update' : 'Add'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DriversVehiclesPage;
