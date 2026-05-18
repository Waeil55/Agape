import React, { useState } from 'react';
import { tripMatchesCalendarDay } from '../utils/tripDate';
import { MapPin, Clock, AlertCircle, Users, UserCheck, X, BrainCircuit, Loader2, Plus, Save, Trash2, Edit2, CheckCircle2, Phone, MessageSquare, Flag, Sparkles, Check } from 'lucide-react';
import { suggestBatchAssignment } from '../config/ai';

const getTodayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const today = getTodayStr();

const TripsPage = ({ trips, role, drivers, selectedTasks, toggleTaskSelection, onCreateLegMission, onBulkAssignTrips, onAssignTrip, onUnassignTrip, onAddTrip, onUpdateTrip, onDeleteTrip }) => {
  const [sortBy, setSortBy] = useState('time');
  const [selectedTrip, setSelectedTrip] = useState(null);
  const [legsDetailPatient, setLegsDetailPatient] = useState(null);
  const [showAssign, setShowAssign] = useState(false);
  const [assignMode, setAssignMode] = useState('assign');
  const [isBatchAssigning, setIsBatchAssigning] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [assignmentFeedback, setAssignmentFeedback] = useState('');
  const [newTrip, setNewTrip] = useState({ patient: '', bookingId: '', date: today, time: '', type: '', pickup: '', dropoff: '', pickupPhone: '', dropoffPhone: '', notes: '', driverId: '' });
  const [editTrip, setEditTrip] = useState(null);
  const [manifestDate, setManifestDate] = useState(today);
  const [showAllDates, setShowAllDates] = useState(false);

  const handleBulkAssign = (driverId) => {
    if (assignMode === 'mission') {
      onCreateLegMission(driverId);
      return;
    }
    if (onBulkAssignTrips) {
      onBulkAssignTrips(driverId);
      setShowAssign(false);
    }
  };

  const handleBulkDelete = () => {
    if (!window.confirm(`Delete ${selectedTasks.length} selected trips?`)) return;
    selectedTasks.forEach(id => {
      onDeleteTrip(id);
    });
    selectedTasks.forEach(id => toggleTaskSelection(id));
  };

  const getZip = (addr) => (addr || '').match(/\b(\d{5})\b/)?.[1] || '';

  const timeToMinutes = (t) => {
    if (!t) return 1440;
    const cleanTime = String(t).toUpperCase().trim();
    if (cleanTime === 'WILL CALL' || cleanTime === 'WC') return 1440;
    
    // Robust regex: HH:MM AM/PM or HH AM/PM or HH:MM
    const m = cleanTime.match(/(\d{1,2})(?::(\d{1,2}))?\s*(AM|PM)?/);
    if (!m) return 1440;
    
    let h = parseInt(m[1], 10);
    let min = parseInt(m[2] || '0', 10);
    const p = m[3];
    
    if (p === 'PM' && h < 12) h += 12;
    if (p === 'AM' && h === 12) h = 0;
    
    return h * 60 + min;
  };

  const filteredTrips = [...trips]
    .filter(t => showAllDates || tripMatchesCalendarDay(t.date, manifestDate))
    .sort((a, b) => {
      if (sortBy === 'time') {
        const timeA = timeToMinutes(a.time);
        const timeB = timeToMinutes(b.time);
        
        if (timeA !== timeB) return timeA - timeB;
        // If times are same, sort by patient
        return (a.patient || '').localeCompare(b.patient || '');
      }
      if (sortBy === 'patient') return (a.patient || '').localeCompare(b.patient || '');
      if (sortBy === 'zip') {
        const za = getZip(a.pickup);
        const zb = getZip(b.pickup);
        if (za !== zb) return za.localeCompare(zb);
        return (a.patient || '').localeCompare(b.patient || '');
      }
      return 0;
    });

  const handleAssign = (driverId) => {
    if (onAssignTrip && selectedTrip) {
      const driver = drivers.find(d => d.id === driverId);
      onAssignTrip(selectedTrip.id, driverId);
      setAssignmentFeedback(`✓ ${selectedTrip.patient} assigned to ${driver?.name || 'Driver'}`);
      setTimeout(() => setAssignmentFeedback(''), 3000);
      setShowAssign(false);
      setSelectedTrip(null);
    }
  };

  const handleUpdate = (e) => {
    e.preventDefault();
    onUpdateTrip(editTrip);
    setShowEditForm(false);
    setEditTrip(null);
  };

  const openEdit = (trip) => {
    setEditTrip({ ...trip });
    setShowEditForm(true);
  };

  return (
    <div className="space-y-6">
      {/* Assignment Success Feedback */}
      {assignmentFeedback && (
        <div className="fixed top-24 left-1/2 transform -translate-x-1/2 z-50 animate-in">
          <div className="bg-emerald-600 text-white px-6 py-4 rounded-2xl font-bold text-base shadow-xl shadow-emerald-500/30 flex items-center gap-2">
            <Check size={20} /> {assignmentFeedback}
          </div>
        </div>
      )}
      {/* HEADER CONTROLS */}
      <div className="card p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row justify-between gap-4">
          <div className="flex-1 max-w-xs">
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Sort Preference</label>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 font-bold text-base outline-none">
              <option value="time">Sort by Time</option>
              <option value="patient">Sort by Patient</option>
              <option value="zip">Sort by Zip Area</option>
            </select>
          </div>

          <div className="flex-1 max-w-xs">
            <div className="flex items-center justify-between mb-1.5 ml-1">
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest">Manifest Date</label>
              <button onClick={() => setShowAllDates(!showAllDates)} className={`text-xs font-bold uppercase tracking-widest ${showAllDates ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>
                {showAllDates ? 'Showing All' : 'Show All'}
              </button>
            </div>
            <input 
              type="date" 
              value={manifestDate} 
              disabled={showAllDates}
              onChange={(e) => setManifestDate(e.target.value)} 
              className={`w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 font-bold text-base outline-none transition-opacity ${showAllDates ? 'opacity-50' : 'opacity-100'}`} 
            />
          </div>
          
          <div className="flex items-center gap-2">
            {selectedTasks.length > 0 && (
              <div className="flex items-center gap-2 animate-in">
                <button onClick={() => { setAssignMode('assign'); setShowAssign(true); }} className="btn bg-emerald-600 text-white">
                  <Users size={16} /> Assign ({selectedTasks.length})
                </button>
                {selectedTasks.length > 1 && (
                  <button onClick={() => { setAssignMode('mission'); setShowAssign(true); }} className="btn bg-indigo-600 text-white">
                    <Sparkles size={16} /> Create Mission
                  </button>
                )}
              </div>
            )}
            <button onClick={() => setShowCreateForm(true)} className="btn btn-primary">
              <Plus size={18} /> New Trip
            </button>
          </div>
        </div>
      </div>

      {/* TABLE / LIST */}
      <div className="card overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-slate-100 flex justify-between items-center">
          <h3 className="text-heading text-slate-900">Live Manifest Queue</h3>
          <div className="flex items-center gap-3">
            {showAllDates && <span className="badge badge-warning text-xs">Viewing All Dates</span>}
            <span className="badge badge-info">{filteredTrips.length} Trips</span>
          </div>
        </div>

        <div className="divide-y divide-slate-100">
          {filteredTrips.length === 0 ? (
            <div className="p-12 text-center">
              <AlertCircle size={48} className="mx-auto text-slate-200 mb-4" />
              <p className="text-slate-400 font-bold text-lg">Queue is empty</p>
            </div>
          ) : (
            filteredTrips.map((trip) => {
              const driver = drivers.find(d => d.id === trip.driverId);
              const isSelected = selectedTasks.includes(trip.id);
              return (
                <div key={trip.id} className={`flex items-center gap-4 p-4 sm:px-6 sm:py-5 transition-all ${isSelected ? 'bg-blue-50/50' : 'hover:bg-slate-50'}`}>
                  <input type="checkbox" checked={isSelected} onChange={() => toggleTaskSelection(trip.id)} className="w-5 h-5 rounded-lg border-slate-300 text-blue-600 focus:ring-blue-500 shrink-0" />
                  
                  <div className="flex-1 min-w-0" onClick={() => setSelectedTrip(trip)}>
                    <div className="flex items-center gap-3 mb-1.5">
                      <div className="flex items-center gap-2 truncate">
                        <p className="font-extrabold text-slate-900 text-base sm:text-lg truncate">{trip.patient}</p>
                        {(() => {
                          const legs = filteredTrips.filter(t => (t.patient || '').toLowerCase() === (trip.patient || '').toLowerCase()).length;
                          return legs > 1 ? (
                            <button onClick={(e) => { e.stopPropagation(); setLegsDetailPatient(trip.patient); }} className="badge badge-info cursor-pointer hover:opacity-80">
                              <Users size={12} /> {legs}L
                            </button>
                          ) : null;
                        })()}
                      </div>
                      {trip.bookingId ? (
                        <span className="badge badge-info bg-slate-100 text-slate-500">
                          {trip.bookingId}
                        </span>
                      ) : null}
                      <span className={`badge ${trip.status === 'Assigned' ? 'badge-success' : 'badge-warning'}`}>
                        {trip.status}
                      </span>
                    </div>
                    <div className="flex flex-col gap-2 mt-1.5">
                      <div className="flex items-start gap-2 min-w-0">
                        <div className="w-5 h-5 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                          <MapPin size={12} className="text-blue-600" />
                        </div>
                        <p className="text-sm font-semibold text-slate-600 truncate leading-tight">{trip.pickup}</p>
                      </div>
                      <div className="flex items-start gap-2 min-w-0">
                        <div className="w-5 h-5 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
                          <Flag size={12} className="text-emerald-600" />
                        </div>
                        <p className="text-sm font-semibold text-slate-600 truncate leading-tight">{trip.dropoff}</p>
                      </div>
                    </div>
                    
                    {/* Phone & SMS for Admin/Dispatcher */}
                    {(role === 'admin' || role === 'dispatcher') && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {trip.pickupPhone && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-slate-400 uppercase">Client:</span>
                            <a href={`tel:${trip.pickupPhone}`} className="text-xs font-bold text-blue-600 hover:underline">{trip.pickupPhone}</a>
                            <a href={`sms:${trip.pickupPhone}`} className="p-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100"><MessageSquare size={12} /></a>
                          </div>
                        )}
                        {trip.notes && (
                          <div className="flex items-center gap-1 ml-2">
                            <span className="text-xs font-bold text-amber-600 uppercase bg-amber-50 px-2 py-1 rounded-lg">Note: {trip.notes}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {driver && (
                      <p className="mt-2 text-xs font-bold text-emerald-600 flex items-center gap-1.5 uppercase">
                         <UserCheck size={14} /> {driver.name} &bull; {driver.vehicle}
                      </p>
                    )}
                  </div>

                  <div className="text-right shrink-0">
                    <p className="text-xl font-black text-blue-600 leading-none">{trip.time}</p>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">{trip.type}</p>
                    <div className="flex flex-col items-end gap-2 mt-2">
                      <select 
                        value={trip.driverId || ''} 
                        onChange={(e) => onAssignTrip(trip.id, e.target.value)}
                        className="text-xs font-bold uppercase tracking-wider bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-emerald-500 text-slate-600"
                      >
                        <option value="">Quick Assign</option>
                        {drivers.map(d => (
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                      </select>
                      <div className="flex items-center gap-1">
                        <button onClick={(e) => { e.stopPropagation(); openEdit(trip); }} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition"><Edit2 size={16} /></button>
                        <button onClick={(e) => { e.stopPropagation(); onDeleteTrip(trip.id); }} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition"><Trash2 size={16} /></button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* CREATE MODAL */}
      {showCreateForm && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center p-4 pt-8 overflow-y-auto">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setShowCreateForm(false)} />
          <div className="bg-white w-full max-w-2xl rounded-[2.5rem] p-8 shadow-2xl relative z-10 border border-white/20 animate-in my-auto">
            <div className="flex justify-between items-center mb-8">
              <h3 className="text-lg font-extrabold text-slate-900 flex items-center gap-3"><Plus size={28} className="text-emerald-500" /> New Manifest Entry</h3>
              <button onClick={() => setShowCreateForm(false)} className="p-2.5 bg-slate-100 rounded-xl text-slate-500 hover:text-slate-700 hover:bg-slate-200"><X size={20} /></button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); onAddTrip(newTrip); setShowCreateForm(false); setNewTrip({ patient: '', bookingId: '', date: today, time: '', type: '', pickup: '', dropoff: '', pickupPhone: '', dropoffPhone: '', notes: '', driverId: '' }); }} className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Patient Name</label>
                  <input type="text" required value={newTrip.patient} onChange={(e) => setNewTrip({...newTrip, patient: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-base focus:border-blue-500 outline-none" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Booking ID</label>
                  <input type="text" value={newTrip.bookingId} onChange={(e) => setNewTrip({...newTrip, bookingId: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-base focus:border-blue-500 outline-none" placeholder="Optional" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Pickup Time</label>
                  <input type="text" required placeholder="08:00 AM" value={newTrip.time} onChange={(e) => setNewTrip({...newTrip, time: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-base focus:border-blue-500 outline-none" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Service Type</label>
                  <input type="text" required placeholder="AM1" value={newTrip.type} onChange={(e) => setNewTrip({...newTrip, type: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-base focus:border-blue-500 outline-none" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Pickup Address</label>
                  <input type="text" required value={newTrip.pickup} onChange={(e) => setNewTrip({...newTrip, pickup: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-base focus:border-blue-500 outline-none" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Dropoff Address</label>
                  <input type="text" required value={newTrip.dropoff} onChange={(e) => setNewTrip({...newTrip, dropoff: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-base focus:border-blue-500 outline-none" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Patient Phone</label>
                  <input type="text" value={newTrip.pickupPhone} onChange={(e) => setNewTrip({...newTrip, pickupPhone: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-base focus:border-blue-500 outline-none" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Hospital Phone</label>
                  <input type="text" value={newTrip.dropoffPhone} onChange={(e) => setNewTrip({...newTrip, dropoffPhone: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-base focus:border-blue-500 outline-none" />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Notes</label>
                <textarea value={newTrip.notes} onChange={(e) => setNewTrip({...newTrip, notes: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-base focus:border-blue-500 outline-none" rows="2" placeholder="Special instructions, comments..." />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Assign to Driver</label>
                <select value={newTrip.driverId} onChange={(e) => setNewTrip({...newTrip, driverId: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-base focus:border-blue-500 outline-none">
                  <option value="">Unassigned</option>
                  {drivers.map(d => <option key={d.id} value={d.id}>{d.name} {d.vehicle ? `(${d.vehicle})` : ''}</option>)}
                </select>
              </div>
              <button type="submit" className="w-full py-5 bg-emerald-600 text-white rounded-2xl font-bold text-base shadow-xl shadow-emerald-500/20 active:scale-[0.98] transition">Create Manifest Entry</button>
            </form>
          </div>
        </div>
      )}

      {/* EDIT MODAL */}
      {showEditForm && editTrip && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setShowEditForm(false)} />
          <div className="bg-white w-full max-w-2xl rounded-[2.5rem] p-8 shadow-2xl relative z-10 border border-white/20 animate-in">
            <div className="flex justify-between items-center mb-8">
              <h3 className="text-lg font-extrabold text-slate-900 flex items-center gap-3"><Edit2 size={28} className="text-blue-500" /> Modify Trip Details</h3>
              <button onClick={() => setShowEditForm(false)} className="p-2.5 bg-slate-100 rounded-xl text-slate-500 hover:text-slate-700 hover:bg-slate-200"><X size={20} /></button>
            </div>
            <form onSubmit={handleUpdate} className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Patient Name</label>
                  <input type="text" required value={editTrip.patient} onChange={(e) => setEditTrip({...editTrip, patient: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-base focus:border-blue-500 outline-none" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Booking ID</label>
                  <input type="text" value={editTrip.bookingId || ''} onChange={(e) => setEditTrip({...editTrip, bookingId: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-base focus:border-blue-500 outline-none" placeholder="Optional" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Date</label>
                  <input type="date" required value={editTrip.date || ''} onChange={(e) => setEditTrip({...editTrip, date: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-base focus:border-blue-500 outline-none" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Pickup Time</label>
                  <input type="text" required placeholder="08:00 AM" value={editTrip.time || ''} onChange={(e) => setEditTrip({...editTrip, time: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-base focus:border-blue-500 outline-none" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Service Type</label>
                  <input type="text" required placeholder="AM1" value={editTrip.type || ''} onChange={(e) => setEditTrip({...editTrip, type: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-base focus:border-blue-500 outline-none" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Pickup Address</label>
                  <input type="text" required value={editTrip.pickup || ''} onChange={(e) => setEditTrip({...editTrip, pickup: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-base focus:border-blue-500 outline-none" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Dropoff Address</label>
                  <input type="text" required value={editTrip.dropoff || ''} onChange={(e) => setEditTrip({...editTrip, dropoff: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-base focus:border-blue-500 outline-none" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Patient Phone</label>
                  <input type="text" value={editTrip.pickupPhone || ''} onChange={(e) => setEditTrip({...editTrip, pickupPhone: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-base focus:border-blue-500 outline-none" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Hospital Phone</label>
                  <input type="text" value={editTrip.dropoffPhone || ''} onChange={(e) => setEditTrip({...editTrip, dropoffPhone: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-base focus:border-blue-500 outline-none" />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Notes</label>
                <textarea value={editTrip.notes || ''} onChange={(e) => setEditTrip({...editTrip, notes: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-base focus:border-blue-500 outline-none" rows="2" placeholder="Special instructions, comments..." />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Assign to Driver</label>
                <select value={editTrip.driverId || ''} onChange={(e) => setEditTrip({...editTrip, driverId: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-base focus:border-blue-500 outline-none">
                  <option value="">Unassigned</option>
                  {drivers.map(d => <option key={d.id} value={d.id}>{d.name} {d.vehicle ? `(${d.vehicle})` : ''}</option>)}
                </select>
              </div>
              <button type="submit" className="w-full py-5 bg-blue-600 text-white rounded-2xl font-bold text-base shadow-xl shadow-blue-500/20 active:scale-[0.98] transition">Update Trip Information</button>
            </form>
          </div>
        </div>
      )}

      {/* ASSIGN MODAL */}
      {showAssign && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setShowAssign(false)} />
          <div className="bg-white w-full max-w-lg rounded-[2.5rem] p-8 shadow-2xl relative z-10 border border-white/20">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black text-slate-900 flex items-center gap-2"><Users size={24} className="text-blue-600" /> {assignMode === 'mission' ? 'Create Driver Mission' : 'Assign to Driver'}</h3>
              <button onClick={() => setShowAssign(false)} className="p-2 bg-slate-100 rounded-xl text-slate-500 hover:text-slate-700 hover:bg-slate-200"><X size={20} /></button>
            </div>
            <p className="text-xs font-bold text-slate-500 mb-6 uppercase tracking-widest">
              {assignMode === 'mission'
                ? `Create a multi-stop mission for ${selectedTasks.length || 1} trips`
                : `Select driver for ${selectedTasks.length || 1} trips`}
            </p>
            <div className="space-y-2">
              {drivers.map(d => (
                <button key={d.id} onClick={() => selectedTasks.length > 0 ? handleBulkAssign(d.id) : handleAssign(d.id)} 
                  className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-blue-50 border border-slate-100 rounded-2xl transition group">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-blue-600 font-black shadow-sm group-hover:bg-blue-600 group-hover:text-white transition-colors">{d.name.charAt(0)}</div>
                    <div className="text-left">
                      <p className="text-sm font-black text-slate-900">{d.name}</p>
                      <p className="text-xs font-bold text-slate-400">{d.vehicle || 'No Vehicle'}</p>
                    </div>
                  </div>
                  <span className="text-xs font-black text-blue-600 uppercase">Select &rarr;</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Legs Detail Modal */}
      {legsDetailPatient && (() => {
        const patientName = legsDetailPatient;
        const legs = filteredTrips.filter(t => (t.patient || '').trim().toLowerCase() === patientName.trim().toLowerCase());
        return (
          <div className="fixed inset-0 z-[130] flex items-center justify-center p-4" onClick={() => setLegsDetailPatient(null)}>
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <div className="bg-white w-full max-w-lg rounded-3xl p-5 relative z-10 shadow-2xl border border-white/20 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-slate-900">{patientName}</h3>
                <button onClick={() => setLegsDetailPatient(null)} className="p-1.5 bg-slate-100 rounded-xl text-slate-500 hover:bg-slate-200"><X size={16} /></button>
              </div>
              <p className="text-xs text-slate-500 font-medium mb-4">{legs.length} legs</p>
              <div className="space-y-2">
                {legs.map((leg, idx) => (
                  <div key={leg.id} className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-slate-400 uppercase">Leg {idx + 1}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase ${leg.status === 'Completed' ? 'bg-emerald-50 text-emerald-600' : leg.status === 'Assigned' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>{leg.status}</span>
                    </div>
                    <p className="text-sm font-bold text-slate-400 mb-1">Booking: {leg.bookingId || '—'}</p>
                    <div className="space-y-1.5">
                      <div className="flex items-start gap-2">
                        <div className="w-3 h-3 rounded-full bg-blue-500 shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-500">Pickup</p>
                          <p className="text-sm text-slate-500 truncate">{leg.pickup}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <div className="w-3 h-3 rounded-full bg-emerald-500 shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-500">Dropoff</p>
                          <p className="text-sm text-slate-500 truncate">{leg.dropoff}</p>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
                      <span>Time: {leg.time || '—'}</span>
                      <span>Type: {leg.type || '—'}</span>
                    </div>
                    {leg.notes && <p className="mt-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-2 py-1.5">{leg.notes}</p>}
                    {leg.pickupPhone && <p className="mt-1.5 text-xs text-slate-400">Phone: {leg.pickupPhone}</p>}
                    {leg.driverId && (() => {
                      const d = drivers.find(drv => drv.id === leg.driverId);
                      return d ? <p className="mt-1.5 text-xs text-slate-400">Driver: {d.name}</p> : null;
                    })()}
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default TripsPage;
