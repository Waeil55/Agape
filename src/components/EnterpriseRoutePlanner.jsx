import React, { useState, useMemo } from 'react';
import {
  MapPin, Navigation, GripVertical, Plus, Trash2, Clock, Car, Compass,
  ArrowUpDown, RotateCcw, Bookmark, UserPlus, Check, ChevronRight, X,
  Search, Building2, Edit2, AlertCircle, SlidersHorizontal, Phone,
  Sparkles, CheckCircle2
} from 'lucide-react';
import { openNavigation } from '../utils/nativeActions';

const ENTERPRISE_DEPOTS = [
  { id: 'depot-1', name: 'Agape Care Dispatch Base', address: '100 Transit Way, Indianapolis, IN' },
  { id: 'depot-2', name: 'Methodist Hospital Bay 3', address: '1701 N Senate Blvd, Indianapolis, IN' },
  { id: 'depot-3', name: 'Northside Transit Hub', address: '8500 Keystone Crossing, Indianapolis, IN' }
];

export default function EnterpriseRoutePlanner({ trips = [], drivers = [], appSettings, onOpenInNav }) {
  const [activeTab, setActiveTab] = useState('builder');
  const [currentPlanName, setCurrentPlanName] = useState("Today's Route Plan");
  const [isEditingPlanName, setIsEditingPlanName] = useState(false);
  const [planPriority, setPlanPriority] = useState('Standard');
  const [originType, setOriginType] = useState('none');
  const [selectedDepotId, setSelectedDepotId] = useState(ENTERPRISE_DEPOTS[0].id);
  const [customOriginAddress, setCustomOriginAddress] = useState('');
  const [selectedDriverId, setSelectedDriverId] = useState('');

  const [stops, setStops] = useState([]);
  const [savedPlans, setSavedPlans] = useState([]);
  const [planSearchQuery, setPlanSearchQuery] = useState('');
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [saveFormName, setSaveFormName] = useState('');
  const [saveFormNotes, setSaveFormNotes] = useState('');
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [targetPlanToAssign, setTargetPlanToAssign] = useState(null);
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [toast, setToast] = useState(null);

  const activeTrips = useMemo(() => trips.filter(t => !['Completed', 'Cancelled', 'No Show', 'Rerouted', 'Archived'].includes(t.status)), [trips]);

  const selectedDriver = useMemo(() => drivers.find(d => d.id === selectedDriverId), [drivers, selectedDriverId]);

  const driverTrips = useMemo(() => {
    if (!selectedDriver) return [];
    return activeTrips.filter(t => t.driverId === selectedDriver.id || t.assignedDriverId === selectedDriver.id || t.driverEmail === selectedDriver.email);
  }, [activeTrips, selectedDriver]);

  const validStops = stops.filter(s => s.address.trim() !== '' || (s.clientName && s.clientName.trim() !== ''));
  const puCount = validStops.filter(s => s.type === 'PU').length;
  const doCount = validStops.filter(s => s.type === 'DO').length;
  const estDuration = validStops.length > 0 ? (validStops.length * 12) + (originType !== 'none' ? 8 : 0) : 0;
  const estDistance = validStops.length > 0 ? ((validStops.length * 4.1) + (originType !== 'none' ? 2.8 : 0)).toFixed(1) : '0.0';

  const triggerToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const getOriginLabel = () => {
    if (originType === 'gps') return 'Current GPS Location';
    if (originType === 'depot') { const d = ENTERPRISE_DEPOTS.find(item => item.id === selectedDepotId); return d ? d.name : 'Dispatch Base'; }
    if (originType === 'custom') return customOriginAddress || 'Custom Origin';
    return 'Direct from Stop A';
  };

  const handleAddStop = () => {
    const newId = `st-${Date.now()}`;
    const autoType = stops.length >= 2 ? 'DO' : 'PU';
    setStops(prev => [...prev, { id: newId, clientName: '', address: '', type: autoType, mobility: 'Amb', timeWindow: autoType === 'PU' ? 'PU: Flexible' : 'Appt: Flexible', notes: '', expanded: false }]);
  };

  const handleUpdateStop = (id, field, value) => setStops(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
  const handleToggleExpandStop = (id) => setStops(prev => prev.map(s => s.id === id ? { ...s, expanded: !s.expanded } : s));

  const handleRemoveStop = (id) => {
    if (stops.length <= 1) { setStops([{ id: `st-${Date.now()}`, clientName: '', address: '', type: 'PU', mobility: 'Amb', timeWindow: 'Flexible', notes: '', expanded: false }]); return; }
    setStops(prev => prev.filter(s => s.id !== id));
  };

  const handleReverseRoute = () => { if (stops.length < 2) return; setStops([...stops].reverse()); triggerToast('Route sequence inverted'); };
  const handleClearStops = () => { setStops([]); triggerToast('Route cleared', 'info'); };

  const onDragStart = (e, index) => { setDraggedIndex(index); e.dataTransfer.effectAllowed = 'move'; };
  const onDragOver = (e, index) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    const reordered = [...stops]; const [moved] = reordered.splice(draggedIndex, 1); reordered.splice(index, 0, moved); setDraggedIndex(index); setStops(reordered);
  };

  const handleOpenSaveModal = () => {
    if (validStops.length === 0) { triggerToast('Add at least 1 stop before saving', 'error'); return; }
    setSaveFormName(currentPlanName || `Medical Run #${savedPlans.length + 1}`);
    setSaveModalOpen(true);
  };

  const handleConfirmSavePlan = (e) => {
    e.preventDefault();
    if (!saveFormName.trim()) return;
    const newPlan = { id: `plan-${Date.now()}`, name: saveFormName.trim(), code: `MED-${Math.floor(1000 + Math.random() * 9000)}`, status: 'Scheduled', priority: planPriority, stopsCount: validStops.length, estTime: `${estDuration} min`, distance: `${estDistance} mi`, assignedDriver: null, notes: saveFormNotes || 'Paratransit run', stops: validStops.map(s => ({ ...s })) };
    setSavedPlans([newPlan, ...savedPlans]);
    setCurrentPlanName(saveFormName.trim());
    setSaveModalOpen(false);
    triggerToast(`"${saveFormName}" saved`);
  };

  const handleLoadPlanToBuilder = (plan) => {
    setCurrentPlanName(plan.name);
    setStops(plan.stops.map((s, idx) => ({ id: `st-loaded-${Date.now()}-${idx}`, clientName: s.clientName || '', address: s.address, type: s.type || (idx === plan.stops.length - 1 ? 'DO' : 'PU'), mobility: s.mobility || 'Amb', timeWindow: s.timeWindow || 'Flexible', notes: s.notes || '', expanded: false })));
    setActiveTab('builder');
    triggerToast(`Opened "${plan.name}"`);
  };

  const handleAssignDriver = (driver) => {
    if (targetPlanToAssign) {
      setSavedPlans(prev => prev.map(p => p.id === targetPlanToAssign.id ? { ...p, assignedDriver: driver.name, status: 'Assigned' } : p));
      triggerToast(`${driver.name} assigned to ${targetPlanToAssign.name}`);
    } else {
      setSelectedDriverId(driver.id);
      triggerToast(`${driver.name} selected for route planning`);
    }
    setAssignModalOpen(false);
    setTargetPlanToAssign(null);
  };

  const importTripsAsStops = () => {
    const driverT = selectedDriver ? driverTrips : activeTrips;
    if (driverT.length === 0) { triggerToast('No active trips to import', 'error'); return; }
    const newStops = driverT.slice(0, 12).map((t, idx) => ({
      id: `imported-${t.id}`,
      clientName: t.patient || '',
      address: idx % 2 === 0 ? (t.pickup || '') : (t.dropoff || ''),
      type: idx % 2 === 0 ? 'PU' : 'DO',
      mobility: 'Amb',
      timeWindow: t.time || 'Flexible',
      notes: t.notes || '',
      expanded: false,
    }));
    setStops(newStops);
    triggerToast(`Imported ${newStops.length} stops from ${selectedDriver ? selectedDriver.name : 'active trips'}`);
  };

  const handleOpenNavigation = (address) => {
    if (onOpenInNav) onOpenInNav(address);
    else openNavigation(address);
  };

  const filteredPlans = savedPlans.filter(p => p.name.toLowerCase().includes(planSearchQuery.toLowerCase()) || p.code.toLowerCase().includes(planSearchQuery.toLowerCase()));

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-slate-50 via-slate-50 to-indigo-50/20 text-slate-900 font-sans antialiased">

      {toast && (
        <div className="fixed top-2.5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-3.5 py-2 rounded-full bg-slate-900/90 backdrop-blur-md text-white shadow-xl text-xs font-semibold animate-in fade-in slide-in-from-top-2 duration-150 border border-slate-700/50">
          {toast.type === 'error' ? <AlertCircle size={13} className="text-rose-400 shrink-0" /> : toast.type === 'info' ? <Sparkles size={13} className="text-sky-300 shrink-0" /> : <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />}
          <span>{toast.msg}</span>
        </div>
      )}

      <div className="px-3 pt-2 pb-0.5 w-full">
        <div className="bg-slate-200/70 backdrop-blur-md p-0.5 rounded-xl flex items-center gap-1 border border-slate-300/50 shadow-inner">
          {[
            { id: 'builder', label: 'Route Planner', icon: Compass, count: validStops.length },
            { id: 'saved', label: 'Saved Plans', icon: Bookmark, count: savedPlans.length },
            { id: 'fleet', label: 'Drivers', icon: Car },
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex-1 py-1.5 px-2 rounded-lg flex items-center justify-center gap-1.5 text-xs font-bold transition-all duration-150 ${activeTab === tab.id ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900 hover:bg-white/40'}`}>
              <tab.icon size={14} className={activeTab === tab.id ? 'text-indigo-600' : 'text-slate-500'} />
              <span>{tab.label}</span>
              {tab.count !== undefined && <span className="bg-slate-300/80 text-slate-700 px-1 py-0.2 rounded text-[9px] font-black">{tab.count}</span>}
            </button>
          ))}
        </div>
      </div>

      <main className="flex-1 pb-8 px-3 w-full space-y-2 mt-1 overflow-y-auto overscroll-contain">

        {activeTab === 'builder' && (
          <div className="space-y-2">
            <div className="bg-white/95 backdrop-blur-sm border border-slate-200/90 rounded-xl p-2.5 shadow-xs space-y-2">
              <div className="flex items-center justify-between gap-1.5">
                <div className="flex-1 min-w-0">
                  {isEditingPlanName ? (
                    <div className="flex items-center gap-1">
                      <input type="text" value={currentPlanName} onChange={(e) => setCurrentPlanName(e.target.value)} onBlur={() => setIsEditingPlanName(false)} onKeyDown={(e) => e.key === 'Enter' && setIsEditingPlanName(false)} autoFocus className="w-full bg-indigo-50/50 border border-indigo-500 rounded-lg px-2 py-0.5 text-xs font-bold text-slate-900 outline-none ring-2 ring-indigo-500/20" />
                      <button onClick={() => setIsEditingPlanName(false)} className="px-2 py-0.5 bg-indigo-600 text-white rounded-lg text-xs font-bold shrink-0">Save</button>
                    </div>
                  ) : (
                    <div onClick={() => setIsEditingPlanName(true)} className="group flex items-center gap-1.5 cursor-pointer">
                      <h2 className="text-xs font-black text-slate-900 truncate tracking-tight group-hover:text-indigo-600 transition-colors">{currentPlanName}</h2>
                      <Edit2 size={12} className="text-slate-400 group-hover:text-indigo-600 transition-colors shrink-0" />
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium mt-0.5">
                    <span className="font-semibold text-slate-700">{validStops.length} stops</span>
                    <span className="text-slate-300">·</span>
                    <span className="font-bold text-amber-700 bg-amber-50 px-1 py-0.2 rounded text-[9px] border border-amber-200/60">{puCount} PU</span>
                    <span className="font-bold text-emerald-700 bg-emerald-50 px-1 py-0.2 rounded text-[9px] border border-emerald-200/60">{doCount} DO</span>
                    <span className="text-slate-300">·</span>
                    <span className="text-indigo-600 font-bold">{estDuration} min</span>
                    <span className="text-slate-300">·</span>
                    <span className="text-slate-600 font-semibold">{estDistance} mi</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={handleReverseRoute} className="p-1.5 rounded-lg bg-slate-100/80 hover:bg-indigo-50 hover:text-indigo-600 text-slate-600 transition-colors border border-slate-200/60" title="Reverse"><ArrowUpDown size={13} /></button>
                  <button onClick={handleClearStops} className="p-1.5 rounded-lg bg-slate-100/80 hover:bg-rose-50 hover:text-rose-600 text-slate-600 transition-colors border border-slate-200/60" title="Clear"><RotateCcw size={13} /></button>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" /><span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Departure Origin</span></div>
                  <span className="text-[9px] font-medium text-slate-400">{originType === 'none' ? 'Direct from Stop A' : 'Includes origin'}</span>
                </div>
                <div className="grid grid-cols-4 gap-1 p-0.5 bg-slate-100/80 rounded-lg text-[10px] font-bold border border-slate-200/60">
                  {[{ id: 'none', label: 'Stop A' }, { id: 'gps', label: 'GPS', Icon: Compass }, { id: 'depot', label: 'Hub', Icon: Building2 }, { id: 'custom', label: 'Custom' }].map(o => (
                    <button key={o.id} onClick={() => setOriginType(o.id)} className={`py-1 px-1 rounded-md text-center flex items-center justify-center gap-1 transition-all ${originType === o.id ? 'bg-white text-indigo-700 shadow-xs font-black' : 'text-slate-600 hover:text-slate-900'}`}>
                      {o.Icon && <o.Icon size={11} className={originType === o.id ? 'text-indigo-600' : 'text-slate-500'} />}
                      <span>{o.label}</span>
                    </button>
                  ))}
                </div>
                {originType === 'depot' && (
                  <select value={selectedDepotId} onChange={(e) => setSelectedDepotId(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:border-indigo-600">
                    {ENTERPRISE_DEPOTS.map(d => <option key={d.id} value={d.id}>{d.name} — {d.address}</option>)}
                  </select>
                )}
                {originType === 'custom' && (
                  <div className="relative"><MapPin size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" /><input type="text" value={customOriginAddress} onChange={(e) => setCustomOriginAddress(e.target.value)} placeholder="Enter departure address..." className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-2.5 py-1.5 text-xs text-slate-900 outline-none focus:border-indigo-600 focus:bg-white" /></div>
                )}
              </div>

              <div className="pt-2 border-t border-slate-100">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Plan for Driver</label>
                <select value={selectedDriverId} onChange={(e) => setSelectedDriverId(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:border-indigo-600">
                  <option value="">All active trips</option>
                  {drivers.map(d => <option key={d.id || d.email} value={d.id}>{d.name || d.email}</option>)}
                </select>
              </div>
            </div>

            {stops.length === 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-6 text-center space-y-3">
                <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center mx-auto"><Compass size={22} className="text-indigo-400" /></div>
                <p className="text-xs font-bold text-slate-700">No stops yet</p>
                <p className="text-[11px] text-slate-400 max-w-[240px] mx-auto">Import from active trips or add stops manually to build your route.</p>
                <div className="flex gap-2 justify-center">
                  <button onClick={importTripsAsStops} className="px-3 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-colors">Import Active Trips</button>
                  <button onClick={handleAddStop} className="px-3 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 transition-colors">Add Stop</button>
                </div>
              </div>
            )}

            <div className="relative space-y-1.5">
              {stops.map((stop, index) => {
                const letter = String.fromCharCode(65 + index);
                const isDragging = draggedIndex === index;
                const isPU = stop.type === 'PU';
                const isLast = index === stops.length - 1;
                return (
                  <div key={stop.id} data-stop-index={index} draggable onDragStart={(e) => onDragStart(e, index)} onDragOver={(e) => onDragOver(e, index)} className={`relative bg-white border rounded-xl p-2.5 transition-all duration-150 shadow-xs ${isDragging ? 'border-indigo-500 bg-indigo-50/50 shadow-md ring-2 ring-indigo-500/20 scale-[0.99]' : 'border-slate-200/90 hover:border-slate-300'}`}>
                    {!isLast && <div className="absolute left-[23px] bottom-[-9px] w-0.5 h-2 bg-slate-200 pointer-events-none z-0" />}
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <div className="touch-none cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-600 p-0.5 -ml-1 rounded transition-colors shrink-0"><GripVertical size={15} /></div>
                      <div className="w-5 h-5 rounded-md bg-slate-900 text-white flex items-center justify-center text-[10px] font-black shrink-0 shadow-xs">{letter}</div>
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-black tracking-wider border shrink-0 ${isPU ? 'bg-amber-50 text-amber-800 border-amber-200/80' : 'bg-emerald-50 text-emerald-800 border-emerald-200/80'}`}>{isPU ? 'PU' : 'DO'}</span>
                      <div className="flex-1 min-w-0">
                        <input type="text" value={stop.clientName || ''} onChange={(e) => handleUpdateStop(stop.id, 'clientName', e.target.value)} placeholder="Client or Clinic Name..." className="w-full bg-transparent border-b border-dashed border-slate-200 focus:border-indigo-600 pb-0.5 text-xs font-black text-slate-900 placeholder-slate-400 outline-none transition-colors truncate" />
                      </div>
                      <select value={stop.mobility || 'Amb'} onChange={(e) => handleUpdateStop(stop.id, 'mobility', e.target.value)} className="bg-slate-100/90 border border-slate-200 text-slate-700 text-[10px] font-bold rounded-md px-1 py-0.5 outline-none shrink-0">
                        <option value="Amb">Amb</option><option value="W/C">W/C</option><option value="STR">Str</option>
                      </select>
                      <button type="button" onClick={() => handleToggleExpandStop(stop.id)} className={`p-1 rounded-md text-xs transition-colors shrink-0 ${stop.expanded || stop.notes ? 'bg-indigo-100 text-indigo-700' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}><SlidersHorizontal size={12} /></button>
                      <button type="button" onClick={() => handleRemoveStop(stop.id)} className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors shrink-0"><Trash2 size={12} /></button>
                    </div>
                    <div className="relative w-full">
                      <MapPin size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      <input type="text" value={stop.address} onChange={(e) => handleUpdateStop(stop.id, 'address', e.target.value)} placeholder={`Address for Stop ${letter}...`} className="w-full bg-slate-50/70 hover:bg-slate-100/70 focus:bg-white border border-slate-200 focus:border-indigo-600 rounded-lg pl-8 pr-2.5 py-1.5 text-xs text-slate-900 placeholder-slate-400 outline-none focus:ring-1 focus:ring-indigo-600/20 transition-all font-medium" />
                    </div>
                    {stop.expanded && (
                      <div className="mt-2 pt-2 border-t border-slate-100 grid grid-cols-1 gap-1.5 animate-in fade-in duration-150">
                        <div><label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5">Time Window</label><input type="text" value={stop.timeWindow} onChange={(e) => handleUpdateStop(stop.id, 'timeWindow', e.target.value)} placeholder="08:30 AM" className="w-full bg-slate-50 border border-slate-200 rounded-md px-2 py-1 text-xs text-slate-800 outline-none focus:border-indigo-600" /></div>
                        <div><label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5">Notes</label><input type="text" value={stop.notes} onChange={(e) => handleUpdateStop(stop.id, 'notes', e.target.value)} placeholder="Care notes..." className="w-full bg-slate-50 border border-slate-200 rounded-md px-2 py-1 text-xs text-slate-800 outline-none focus:border-indigo-600" /></div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {stops.length > 0 && (
              <button onClick={handleAddStop} className="w-full py-2 bg-white hover:bg-slate-50 border border-dashed border-slate-300 hover:border-indigo-500 hover:text-indigo-600 rounded-xl text-xs font-bold text-slate-600 flex items-center justify-center gap-1.5 transition-all group">
                <div className="w-4 h-4 rounded-full bg-slate-100 group-hover:bg-indigo-50 text-slate-600 group-hover:text-indigo-600 flex items-center justify-center transition-colors"><Plus size={12} /></div>
                <span>Add Next Stop ({String.fromCharCode(65 + stops.length)})</span>
              </button>
            )}

            <div className="pt-1 space-y-1.5">
              <button disabled={validStops.length === 0} className={`w-full py-2.5 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-sm ${validStops.length > 0 ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white shadow-indigo-500/20 active:scale-[0.99]' : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'}`}>
                <Navigation size={15} /><span>Start Navigation</span>
              </button>
              <div className="grid grid-cols-2 gap-1.5">
                <button onClick={handleOpenSaveModal} disabled={validStops.length === 0} className="py-2 bg-white border border-slate-200 hover:border-indigo-600 rounded-xl text-xs font-bold text-slate-800 flex items-center justify-center gap-1.5 transition-all shadow-2xs hover:shadow-xs disabled:opacity-40">
                  <Bookmark size={14} className="text-indigo-600" /><span>Save Plan</span>
                </button>
                <button onClick={() => { setTargetPlanToAssign(null); setAssignModalOpen(true); }} disabled={validStops.length === 0} className="py-2 bg-indigo-50 hover:bg-indigo-100/80 border border-indigo-200/80 rounded-xl text-xs font-bold text-indigo-700 flex items-center justify-center gap-1.5 transition-all shadow-2xs disabled:opacity-40">
                  <UserPlus size={14} /><span>Assign Driver</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'saved' && (
          <div className="space-y-2">
            <div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input type="text" value={planSearchQuery} onChange={(e) => setPlanSearchQuery(e.target.value)} placeholder="Search saved plans..." className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 outline-none focus:border-indigo-600 shadow-xs" /></div>
            {filteredPlans.length === 0 ? (
              <div className="bg-white rounded-xl p-6 border border-slate-200 text-center space-y-1.5"><Bookmark size={20} className="mx-auto text-slate-300" /><div className="text-xs font-bold text-slate-700">No saved plans</div><p className="text-[10px] text-slate-400">Save your route to access it here.</p></div>
            ) : filteredPlans.map(plan => (
              <div key={plan.id} className="bg-white border border-slate-200 rounded-xl p-3 shadow-xs space-y-2 hover:border-slate-300 transition-all">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-1"><span className="text-[9px] font-mono font-bold bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 text-indigo-700">{plan.code}</span><span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200/60">{plan.status}</span></div>
                    <h4 className="text-xs font-black text-slate-900 mt-1">{plan.name}</h4>
                    <p className="text-[10px] text-slate-500 mt-0.5">{plan.stopsCount} stops · {plan.estTime}</p>
                  </div>
                  <div className="text-right"><div className="text-xs font-black text-indigo-600">{plan.estTime}</div><div className="text-[10px] font-medium text-slate-400">{plan.distance}</div></div>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                  <span className="text-[10px] text-slate-600">Driver: <strong className="text-slate-800 font-bold">{plan.assignedDriver || 'Unassigned'}</strong></span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => { setTargetPlanToAssign(plan); setAssignModalOpen(true); }} className="px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-bold text-slate-700 transition-colors">Assign</button>
                    <button onClick={() => handleLoadPlanToBuilder(plan)} className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors">Open</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'fleet' && (
          <div className="space-y-2">
            {drivers.length === 0 ? (
              <div className="bg-white rounded-xl p-6 border border-slate-200 text-center space-y-1.5"><Car size={20} className="mx-auto text-slate-300" /><div className="text-xs font-bold text-slate-700">No drivers found</div></div>
            ) : drivers.map(driver => (
              <div key={driver.id || driver.email} className="bg-white border border-slate-200 rounded-xl p-3 shadow-xs space-y-2 hover:border-slate-300 transition-all">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-600 to-indigo-500 text-white font-black text-xs flex items-center justify-center shadow-xs">{(driver.name || driver.email || 'D').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}</div>
                    <div><div className="text-xs font-black text-slate-900">{driver.name || driver.email}</div><div className="text-[10px] text-slate-500">{driver.vehicle || 'No vehicle'}</div></div>
                  </div>
                  <button onClick={() => handleAssignDriver(driver)} className="px-2.5 py-1 bg-indigo-50 border border-indigo-200/80 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold transition-colors shadow-2xs">Select</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {saveModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white border border-slate-200 w-full max-w-sm rounded-3xl p-5 shadow-2xl space-y-3.5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5"><h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">Save Route Plan</h3><button onClick={() => setSaveModalOpen(false)} className="text-slate-400 hover:text-slate-700 p-1"><X size={16} /></button></div>
            <form onSubmit={handleConfirmSavePlan} className="space-y-3">
              <div><label className="text-[11px] font-bold text-slate-700 block mb-1">Plan Name *</label><input type="text" value={saveFormName} onChange={(e) => setSaveFormName(e.target.value)} placeholder="e.g. Westside Dialysis Run" required className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 outline-none focus:border-indigo-600 focus:bg-white transition-colors" /></div>
              <div><label className="text-[11px] font-bold text-slate-700 block mb-1">Notes</label><textarea rows={2} value={saveFormNotes} onChange={(e) => setSaveFormNotes(e.target.value)} placeholder="e.g. Return trip scheduled for 1:30 PM..." className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 outline-none focus:border-indigo-600 focus:bg-white transition-colors" /></div>
              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button type="button" onClick={() => setSaveModalOpen(false)} className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700 rounded-xl transition-colors">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-xs font-bold text-white rounded-xl shadow-xs transition-colors">Save Plan</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {assignModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white border border-slate-200 w-full max-w-sm rounded-3xl p-5 shadow-2xl space-y-3.5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5"><h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">Assign Driver</h3><button onClick={() => setAssignModalOpen(false)} className="text-slate-400 hover:text-slate-700 p-1"><X size={16} /></button></div>
            <div className="space-y-2 max-h-64 overflow-y-auto pr-0.5">
              {drivers.map(driver => (
                <button key={driver.id || driver.email} onClick={() => handleAssignDriver(driver)} className="w-full p-2.5 rounded-2xl border border-slate-200 hover:border-indigo-500 hover:bg-indigo-50/30 text-left flex items-center justify-between text-xs transition-all">
                  <div><div className="font-bold text-slate-900">{driver.name || driver.email}</div><div className="text-[10px] text-slate-500">{driver.vehicle || ''}</div></div>
                  <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">Select</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
