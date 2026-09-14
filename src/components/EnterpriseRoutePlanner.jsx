import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  MapPin, Navigation, GripVertical, Plus, Trash2, Clock, Car, Compass,
  ArrowUpDown, RotateCcw, Bookmark, UserPlus, Check, ChevronRight, X,
  Search, Building2, Edit2, AlertCircle, SlidersHorizontal, Phone,
  Sparkles, CheckCircle2, Route, Timer, Users, DollarSign, BarChart3,
  Download, Upload, Settings, RefreshCw, Target, Zap, TrendingUp,
  AlertTriangle, ChevronDown, Layers, GitBranch, Copy, Share2, FileText,
  Calendar, Map, Satellite, Fuel, Weight, Shield, Eye,
} from 'lucide-react';
import { openNavigation } from '../utils/nativeActions';

// ============================================================================
// CONSTANTS
// ============================================================================

const ENTERPRISE_DEPOTS = [
  { id: 'depot-1', name: 'Agape Care Dispatch Base', address: '100 Transit Way, Indianapolis, IN 46201', lat: 39.7684, lng: -86.1581, capacity: 50 },
  { id: 'depot-2', name: 'Methodist Hospital Bay 3', address: '1701 N Senate Blvd, Indianapolis, IN 46202', lat: 39.7904, lng: -86.1590, capacity: 30 },
  { id: 'depot-3', name: 'Northside Transit Hub', address: '8500 Keystone Crossing, Indianapolis, IN 46240', lat: 39.9142, lng: -86.1463, capacity: 40 },
  { id: 'depot-4', name: 'Community Health Center', address: '2855 N Illinois St, Indianapolis, IN 46208', lat: 39.7990, lng: -86.1540, capacity: 25 },
];

const VEHICLE_TYPES = [
  { id: 'sedan', label: 'Sedan', capacity: 1, mobility: ['Amb'], costPerMile: 0.58, icon: Car },
  { id: 'suv', label: 'SUV', capacity: 3, mobility: ['Amb', 'W/C'], costPerMile: 0.72, icon: Car },
  { id: 'van', label: 'Wheelchair Van', capacity: 2, mobility: ['Amb', 'W/C', 'STR'], costPerMile: 0.85, icon: Car },
  { id: 'minibus', label: 'Minibus', capacity: 8, mobility: ['Amb', 'W/C', 'STR'], costPerMile: 1.20, icon: Car },
  { id: 'bus', label: 'Full Bus', capacity: 16, mobility: ['Amb', 'W/C', 'STR'], costPerMile: 1.80, icon: Car },
];

const MOBILITY_OPTIONS = [
  { id: 'Amb', label: 'Ambulatory', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { id: 'W/C', label: 'Wheelchair', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  { id: 'STR', label: 'Stretcher', color: 'bg-purple-50 text-purple-700 border-purple-200' },
];

const TIME_WINDOW_PRESETS = [
  { id: 'flexible', label: 'Flexible', min: 0, max: 120 },
  { id: 'morning', label: 'Morning (6AM-12PM)', min: 360, max: 720 },
  { id: 'afternoon', label: 'Afternoon (12PM-6PM)', min: 720, max: 1080 },
  { id: 'evening', label: 'Evening (6PM-10PM)', min: 1080, max: 1320 },
  { id: 'appointment', label: 'Appointment Window', min: -15, max: 15 },
  { id: 'custom', label: 'Custom Window', min: 0, max: 60 },
];

const TRAFFIC_LEVELS = [
  { id: 'free', label: 'Free Flow', color: 'text-emerald-600', multiplier: 1.0 },
  { id: 'light', label: 'Light Traffic', color: 'text-emerald-500', multiplier: 1.1 },
  { id: 'moderate', label: 'Moderate', color: 'text-amber-500', multiplier: 1.3 },
  { id: 'heavy', label: 'Heavy', color: 'text-orange-500', multiplier: 1.6 },
  { id: 'severe', label: 'Severe', color: 'text-rose-600', multiplier: 2.0 },
];

const OPTIMIZATION_GOALS = [
  { id: 'time', label: 'Minimize Time', icon: Timer, description: 'Fastest route considering traffic' },
  { id: 'distance', label: 'Minimize Distance', icon: Route, description: 'Shortest total mileage' },
  { id: 'cost', label: 'Minimize Cost', icon: DollarSign, description: 'Lowest operational cost' },
  { id: 'balanced', label: 'Balanced', icon: Sparkles, description: 'Optimal mix of time, cost, and service' },
  { id: 'capacity', label: 'Maximize Capacity', icon: Users, description: 'Most passengers per vehicle' },
];

// ============================================================================
// UTILITIES
// ============================================================================

const estimateTravelTime = (miles, trafficMultiplier = 1.0) => {
  const baseMph = 25;
  const adjustedMph = baseMph / trafficMultiplier;
  return Math.round((miles / adjustedMph) * 60);
};

const estimateDistance = (stops) => {
  if (stops.length === 0) return 0;
  if (stops.length === 1) return 1.5;
  return stops.reduce((total, _, i) => {
    if (i === 0) return 0;
    const isPU = stops[i].type === 'PU';
    return total + (isPU ? 4.2 : 3.8) + (Math.random() * 1.5 - 0.75);
  }, 0);
};

const estimateCost = (miles, vehicleType = 'sedan') => {
  const vehicle = VEHICLE_TYPES.find(v => v.id === vehicleType) || VEHICLE_TYPES[0];
  const fuelCost = miles * vehicle.costPerMile;
  const laborCost = (miles / 25) * 22;
  const overhead = (fuelCost + laborCost) * 0.15;
  return { fuel: fuelCost, labor: laborCost, overhead, total: fuelCost + laborCost + overhead };
};

const timeToMins = (timeStr) => {
  if (!timeStr) return null;
  const clean = String(timeStr).trim();
  if (/will\s*call/i.test(clean)) return null;
  const match = clean.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!match) return null;
  let h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const ap = match[3]?.toUpperCase();
  if (ap === 'PM' && h < 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  return h * 60 + m;
};

const minsToTime = (mins) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const ap = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ap}`;
};

// ============================================================================
// ROUTE OPTIMIZER
// ============================================================================

function optimizeRoute(stops, goal = 'balanced', vehicleType = 'sedan') {
  if (stops.length <= 2) return stops;
  const optimized = [...stops];
  const scores = optimized.map((stop, i) => {
    let score = 0;
    const timeMins = timeToMins(stop.timeWindow);
    if (timeMins !== null) score += (timeMins < 720 ? 2 : timeMins < 1080 ? 1 : 0);
    if (stop.type === 'PU') score += 1;
    if (stop.mobility === 'STR') score += 2;
    if (stop.mobility === 'W/C') score += 1;
    if (goal === 'time') score += (i === 0 ? 5 : 0);
    if (goal === 'cost') score += (stop.type === 'DO' ? 1 : 0);
    if (goal === 'capacity') score += (stop.type === 'PU' ? 2 : 0);
    return { stop, score, originalIndex: i };
  });

  const puStops = scores.filter(s => s.stop.type === 'PU').sort((a, b) => b.score - a.score);
  const doStops = scores.filter(s => s.stop.type === 'DO').sort((a, b) => a.score - b.score);

  const result = [];
  const maxLen = Math.max(puStops.length, doStops.length);
  for (let i = 0; i < maxLen; i++) {
    if (i < puStops.length) result.push(puStops[i].stop);
    if (i < doStops.length) result.push(doStops[i].stop);
  }

  return result;
}

function calculateRouteMetrics(stops, vehicleType = 'sedan', trafficLevel = 'light') {
  const distance = estimateDistance(stops);
  const traffic = TRAFFIC_LEVELS.find(t => t.id === trafficLevel) || TRAFFIC_LEVELS[1];
  const travelTime = estimateTravelTime(distance, traffic.multiplier);
  const stopsTime = stops.length * 8;
  const totalTime = travelTime + stopsTime;
  const cost = estimateCost(distance, vehicleType);
  const vehicle = VEHICLE_TYPES.find(v => v.id === vehicleType) || VEHICLE_TYPES[0];
  const capacityUsed = stops.filter(s => s.type === 'PU').length;
  const capacityTotal = vehicle.capacity;
  const utilizationRate = capacityTotal > 0 ? Math.round((capacityUsed / capacityTotal) * 100) : 0;

  return {
    distance: distance.toFixed(1),
    travelTime,
    stopsTime,
    totalTime,
    cost,
    vehicle,
    capacityUsed,
    capacityTotal,
    utilizationRate,
    trafficLevel: traffic,
    stopCount: stops.length,
    puCount: stops.filter(s => s.type === 'PU').length,
    doCount: stops.filter(s => s.type === 'DO').length,
  };
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function MetricsPanel({ metrics }) {
  if (!metrics) return null;
  return (
    <div className="grid grid-cols-3 gap-1.5">
      <div className="bg-white border border-slate-200 rounded-xl p-2 text-center space-y-0.5">
        <div className="text-[9px] font-bold text-slate-500 uppercase">Distance</div>
        <div className="text-sm font-black text-indigo-600">{metrics.distance} mi</div>
      </div>
      <div className="bg-white border border-slate-200 rounded-xl p-2 text-center space-y-0.5">
        <div className="text-[9px] font-bold text-slate-500 uppercase">Time</div>
        <div className="text-sm font-black text-amber-600">{metrics.totalTime}m</div>
      </div>
      <div className="bg-white border border-slate-200 rounded-xl p-2 text-center space-y-0.5">
        <div className="text-[9px] font-bold text-slate-500 uppercase">Cost</div>
        <div className="text-sm font-black text-emerald-600">${metrics.cost.total.toFixed(0)}</div>
      </div>
      <div className="bg-white border border-slate-200 rounded-xl p-2 text-center space-y-0.5">
        <div className="text-[9px] font-bold text-slate-500 uppercase">Stops</div>
        <div className="text-sm font-black text-slate-900">{metrics.stopCount}</div>
      </div>
      <div className="bg-white border border-slate-200 rounded-xl p-2 text-center space-y-0.5">
        <div className="text-[9px] font-bold text-slate-500 uppercase">Utilization</div>
        <div className={`text-sm font-black ${metrics.utilizationRate > 80 ? 'text-emerald-600' : metrics.utilizationRate > 50 ? 'text-amber-600' : 'text-rose-600'}`}>{metrics.utilizationRate}%</div>
      </div>
      <div className="bg-white border border-slate-200 rounded-xl p-2 text-center space-y-0.5">
        <div className="text-[9px] font-bold text-slate-500 uppercase">Traffic</div>
        <div className={`text-sm font-black ${metrics.trafficLevel.color}`}>{metrics.trafficLevel.label.split(' ')[0]}</div>
      </div>
    </div>
  );
}

function VehicleSelector({ selected, onSelect, stops }) {
  const requiredCapacity = stops.filter(s => s.type === 'PU').length;
  const mobilityNeeds = new Set(stops.map(s => s.mobility).filter(Boolean));

  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
        <Car size={10} /> Vehicle Type
      </label>
      <div className="grid grid-cols-2 gap-1">
        {VEHICLE_TYPES.map((v) => {
          const active = selected === v.id;
          const meetsCapacity = v.capacity >= requiredCapacity;
          const meetsMobility = [...mobilityNeeds].every(m => v.mobility.includes(m));
          const isFeasible = meetsCapacity && meetsMobility;
          return (
            <button key={v.id} type="button" onClick={() => isFeasible && onSelect(v.id)}
              disabled={!isFeasible}
              className={`rounded-xl border p-2 text-left transition-all ${active ? 'border-indigo-500 bg-indigo-50 shadow-sm' : isFeasible ? 'border-slate-200 bg-white hover:border-slate-300' : 'border-slate-200 bg-slate-50 opacity-50 cursor-not-allowed'}`}>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-900">{v.label}</span>
                <span className="text-[9px] font-bold text-slate-500 bg-slate-100 px-1 py-0.5 rounded">{v.capacity} pax</span>
              </div>
              <div className="text-[9px] font-semibold text-slate-400 mt-0.5">
                ${v.costPerMile}/mi · {v.mobility.join(', ')}
              </div>
              {!isFeasible && (
                <div className="text-[9px] font-bold text-rose-500 mt-0.5">
                  {!meetsCapacity ? 'Insufficient capacity' : 'Missing mobility equipment'}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TrafficSelector({ value, onChange }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
        <Satellite size={10} /> Traffic Conditions
      </label>
      <div className="flex gap-1">
        {TRAFFIC_LEVELS.map((t) => {
          const active = value === t.id;
          return (
            <button key={t.id} type="button" onClick={() => onChange(t.id)}
              className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${active ? `bg-white border-slate-300 shadow-xs ${t.color}` : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-white'}`}>
              {t.label.split(' ')[0]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function OptimizationGoalSelector({ value, onChange }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
        <Target size={10} /> Optimization Goal
      </label>
      <div className="space-y-1">
        {OPTIMIZATION_GOALS.map((g) => {
          const active = value === g.id;
          const Icon = g.icon;
          return (
            <button key={g.id} type="button" onClick={() => onChange(g.id)}
              className={`w-full text-left rounded-xl border p-2.5 transition-all flex items-center gap-2 ${active ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
              <Icon size={14} className={active ? 'text-indigo-600' : 'text-slate-400'} />
              <div>
                <div className="text-xs font-bold text-slate-900">{g.label}</div>
                <div className="text-[10px] font-semibold text-slate-500">{g.description}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FleetOverview({ drivers, assignedPlans }) {
  const driverStats = useMemo(() => {
    return drivers.map(d => {
      const plan = assignedPlans.find(p => p.assignedDriverId === d.id);
      return {
        ...d,
        hasPlan: Boolean(plan),
        planName: plan?.name || null,
        stopsCount: plan?.stopsCount || 0,
        status: plan ? 'assigned' : 'available',
      };
    });
  }, [drivers, assignedPlans]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">Fleet Status</h3>
        <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{drivers.length} drivers</span>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2 text-center">
          <div className="text-lg font-black text-emerald-700">{driverStats.filter(d => d.status === 'available').length}</div>
          <div className="text-[9px] font-bold text-emerald-600">Available</div>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-2 text-center">
          <div className="text-lg font-black text-blue-700">{driverStats.filter(d => d.status === 'assigned').length}</div>
          <div className="text-[9px] font-bold text-blue-600">Assigned</div>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-2 text-center">
          <div className="text-lg font-black text-slate-700">{driverStats.length}</div>
          <div className="text-[9px] font-bold text-slate-600">Total</div>
        </div>
      </div>
      <div className="space-y-1 max-h-40 overflow-y-auto">
        {driverStats.map(d => (
          <div key={d.id || d.email} className="flex items-center gap-2 rounded-xl bg-white border border-slate-200 px-2.5 py-2">
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold text-[10px] ${d.status === 'assigned' ? 'bg-blue-600' : 'bg-emerald-600'}`}>
              {(d.name || 'D').split(' ').map(n => n[0]).join('').substring(0, 2)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-bold text-slate-900 truncate">{d.name || d.email}</div>
              <div className="text-[9px] font-semibold text-slate-500">{d.vehicle || 'No vehicle'}</div>
            </div>
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${d.status === 'assigned' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
              {d.status === 'assigned' ? d.planName || 'Assigned' : 'Available'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RouteAuditLog({ log }) {
  if (!log || log.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
        <FileText size={10} /> Audit Trail
      </label>
      <div className="space-y-1 max-h-24 overflow-y-auto">
        {log.slice(-10).reverse().map((entry, i) => (
          <div key={i} className="flex items-center gap-2 text-[10px] font-semibold text-slate-500">
            <span className="text-slate-400">{new Date(entry.time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
            <span className="text-slate-600">{entry.action}</span>
            {entry.user && <span className="text-slate-400">by {entry.user}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function EnterpriseRoutePlanner({ trips = [], drivers = [], appSettings, onOpenInNav }) {
  const [activeTab, setActiveTab] = useState('builder');
  const [currentPlanName, setCurrentPlanName] = useState("Today's Route Plan");
  const [isEditingPlanName, setIsEditingPlanName] = useState(false);
  const [planPriority, setPlanPriority] = useState('Standard');
  const [originType, setOriginType] = useState('none');
  const [selectedDepotId, setSelectedDepotId] = useState(ENTERPRISE_DEPOTS[0].id);
  const [customOriginAddress, setCustomOriginAddress] = useState('');
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [vehicleType, setVehicleType] = useState('sedan');
  const [trafficLevel, setTrafficLevel] = useState('light');
  const [optimizationGoal, setOptimizationGoal] = useState('balanced');
  const [showOptimization, setShowOptimization] = useState(false);

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
  const [auditLog, setAuditLog] = useState([]);
  const [showFleet, setShowFleet] = useState(false);

  const activeTrips = useMemo(() => trips.filter(t => !['Completed', 'Cancelled', 'No Show', 'Rerouted', 'Archived'].includes(t.status)), [trips]);
  const selectedDriver = useMemo(() => drivers.find(d => d.id === selectedDriverId), [drivers, selectedDriverId]);
  const driverTrips = useMemo(() => {
    if (!selectedDriver) return [];
    return activeTrips.filter(t => t.driverId === selectedDriver.id || t.assignedDriverId === selectedDriver.id || t.driverEmail === selectedDriver.email);
  }, [activeTrips, selectedDriver]);

  const validStops = stops.filter(s => s.address.trim() !== '' || (s.clientName && s.clientName.trim() !== ''));
  const metrics = useMemo(() => calculateRouteMetrics(validStops, vehicleType, trafficLevel), [validStops, vehicleType, trafficLevel]);

  const triggerToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const addAuditEntry = useCallback((action) => {
    setAuditLog(prev => [...prev.slice(-49), { time: new Date().toISOString(), action, user: selectedDriver?.name || 'Operator' }]);
  }, [selectedDriver]);

  const getOriginLabel = () => {
    if (originType === 'gps') return 'Current GPS Location';
    if (originType === 'depot') { const d = ENTERPRISE_DEPOTS.find(item => item.id === selectedDepotId); return d ? d.name : 'Dispatch Base'; }
    if (originType === 'custom') return customOriginAddress || 'Custom Origin';
    return 'Direct from Stop A';
  };

  const handleAddStop = useCallback(() => {
    const newId = `st-${Date.now()}`;
    const autoType = stops.length >= 2 ? 'DO' : 'PU';
    setStops(prev => [...prev, {
      id: newId, clientName: '', address: '', type: autoType, mobility: 'Amb',
      timeWindow: 'Flexible', timeWindowStart: '', timeWindowEnd: '',
      notes: '', expanded: false, phone: '', appointmentTime: '',
      specialInstructions: '', priority: 'normal',
    }]);
    addAuditEntry('Added new stop');
  }, [stops.length, addAuditEntry]);

  const handleUpdateStop = useCallback((id, field, value) => {
    setStops(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
  }, []);

  const handleToggleExpandStop = useCallback((id) => {
    setStops(prev => prev.map(s => s.id === id ? { ...s, expanded: !s.expanded } : s));
  }, []);

  const handleRemoveStop = useCallback((id) => {
    if (stops.length <= 1) {
      setStops([{ id: `st-${Date.now()}`, clientName: '', address: '', type: 'PU', mobility: 'Amb', timeWindow: 'Flexible', timeWindowStart: '', timeWindowEnd: '', notes: '', expanded: false, phone: '', appointmentTime: '', specialInstructions: '', priority: 'normal' }]);
      return;
    }
    setStops(prev => prev.filter(s => s.id !== id));
    addAuditEntry('Removed stop');
  }, [stops.length, addAuditEntry]);

  const handleReverseRoute = useCallback(() => {
    if (stops.length < 2) return;
    setStops([...stops].reverse());
    addAuditEntry('Reversed route sequence');
    triggerToast('Route sequence inverted');
  }, [stops, addAuditEntry, triggerToast]);

  const handleClearStops = useCallback(() => {
    setStops([]);
    addAuditEntry('Cleared all stops');
    triggerToast('Route cleared', 'info');
  }, [addAuditEntry, triggerToast]);

  const handleOptimizeRoute = useCallback(() => {
    if (validStops.length < 3) { triggerToast('Add at least 3 stops to optimize', 'error'); return; }
    const optimized = optimizeRoute(validStops, optimizationGoal, vehicleType);
    setStops(optimized.map((s, i) => ({ ...s, id: `opt-${Date.now()}-${i}`, expanded: false })));
    addAuditEntry(`Optimized route (${optimizationGoal})`);
    triggerToast(`Route optimized for ${OPTIMIZATION_GOALS.find(g => g.id === optimizationGoal)?.label || optimizationGoal}`);
  }, [validStops, optimizationGoal, vehicleType, addAuditEntry, triggerToast]);

  const onDragStart = useCallback((e, index) => { setDraggedIndex(index); e.dataTransfer.effectAllowed = 'move'; }, []);
  const onDragOver = useCallback((e, index) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    const reordered = [...stops]; const [moved] = reordered.splice(draggedIndex, 1); reordered.splice(index, 0, moved);
    setDraggedIndex(index); setStops(reordered);
  }, [draggedIndex, stops]);

  const handleOpenSaveModal = useCallback(() => {
    if (validStops.length === 0) { triggerToast('Add at least 1 stop before saving', 'error'); return; }
    setSaveFormName(currentPlanName || `Medical Run #${savedPlans.length + 1}`);
    setSaveModalOpen(true);
  }, [validStops, currentPlanName, savedPlans.length, triggerToast]);

  const handleConfirmSavePlan = useCallback((e) => {
    e.preventDefault();
    if (!saveFormName.trim()) return;
    const newPlan = {
      id: `plan-${Date.now()}`, name: saveFormName.trim(), code: `MED-${Math.floor(1000 + Math.random() * 9000)}`,
      status: 'Scheduled', priority: planPriority, stopsCount: validStops.length,
      estTime: `${metrics.totalTime} min`, distance: `${metrics.distance} mi`,
      cost: `$${metrics.cost.total.toFixed(0)}`, assignedDriver: null, assignedDriverId: null,
      notes: saveFormNotes || 'Paratransit run', stops: validStops.map(s => ({ ...s })),
      vehicleType, trafficLevel, optimizationGoal, createdAt: new Date().toISOString(),
    };
    setSavedPlans(prev => [newPlan, ...prev]);
    setCurrentPlanName(saveFormName.trim());
    setSaveModalOpen(false);
    addAuditEntry(`Saved plan "${saveFormName}"`);
    triggerToast(`"${saveFormName}" saved`);
  }, [saveFormName, planPriority, validStops, metrics, saveFormNotes, vehicleType, trafficLevel, optimizationGoal, addAuditEntry, triggerToast]);

  const handleLoadPlanToBuilder = useCallback((plan) => {
    setCurrentPlanName(plan.name);
    setStops(plan.stops.map((s, idx) => ({ id: `st-loaded-${Date.now()}-${idx}`, ...s, expanded: false })));
    setVehicleType(plan.vehicleType || 'sedan');
    setTrafficLevel(plan.trafficLevel || 'light');
    setOptimizationGoal(plan.optimizationGoal || 'balanced');
    setActiveTab('builder');
    addAuditEntry(`Loaded plan "${plan.name}"`);
    triggerToast(`Opened "${plan.name}"`);
  }, [addAuditEntry, triggerToast]);

  const handleAssignDriver = useCallback((driver) => {
    if (targetPlanToAssign) {
      setSavedPlans(prev => prev.map(p => p.id === targetPlanToAssign.id ? { ...p, assignedDriver: driver.name, assignedDriverId: driver.id, status: 'Assigned' } : p));
      addAuditEntry(`Assigned ${driver.name} to ${targetPlanToAssign.name}`);
      triggerToast(`${driver.name} assigned to ${targetPlanToAssign.name}`);
    } else {
      setSelectedDriverId(driver.id);
      triggerToast(`${driver.name} selected for route planning`);
    }
    setAssignModalOpen(false);
    setTargetPlanToAssign(null);
  }, [targetPlanToAssign, addAuditEntry, triggerToast]);

  const importTripsAsStops = useCallback(() => {
    const driverT = selectedDriver ? driverTrips : activeTrips;
    if (driverT.length === 0) { triggerToast('No active trips to import', 'error'); return; }
    const newStops = driverT.slice(0, 15).map((t, idx) => ({
      id: `imported-${t.id}-${idx}`, clientName: t.patient || '', address: idx % 2 === 0 ? (t.pickup || '') : (t.dropoff || ''),
      type: idx % 2 === 0 ? 'PU' : 'DO', mobility: 'Amb', timeWindow: t.time || 'Flexible',
      timeWindowStart: '', timeWindowEnd: '', notes: t.notes || '', expanded: false,
      phone: t.phone || t.pickupPhone || '', appointmentTime: t.time || '', specialInstructions: '', priority: 'normal',
      tripId: t.id, bookingId: t.bookingId,
    }));
    setStops(newStops);
    addAuditEntry(`Imported ${newStops.length} stops from ${selectedDriver ? selectedDriver.name : 'active trips'}`);
    triggerToast(`Imported ${newStops.length} stops from ${selectedDriver ? selectedDriver.name : 'active trips'}`);
  }, [selectedDriver, driverTrips, activeTrips, addAuditEntry, triggerToast]);

  const handleOpenNavigation = useCallback((address) => {
    if (onOpenInNav) onOpenInNav(address);
    else openNavigation(address);
  }, [onOpenInNav]);

  const filteredPlans = useMemo(() =>
    savedPlans.filter(p => p.name.toLowerCase().includes(planSearchQuery.toLowerCase()) || p.code.toLowerCase().includes(planSearchQuery.toLowerCase())),
    [savedPlans, planSearchQuery]
  );

  const exportPlan = useCallback((plan) => {
    const data = {
      ...plan,
      exportedAt: new Date().toISOString(),
      exportedBy: 'Agape Care Enterprise',
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `route-plan-${plan.code || plan.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
    addAuditEntry(`Exported plan "${plan.name}"`);
    triggerToast('Plan exported');
  }, [addAuditEntry, triggerToast]);

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-slate-50 via-slate-50 to-indigo-50/20 text-slate-900 font-sans antialiased">

      {toast && (
        <div className="fixed top-2.5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-3.5 py-2 rounded-full bg-slate-900/90 backdrop-blur-md text-white shadow-xl text-xs font-semibold animate-in fade-in slide-in-from-top-2 duration-150 border border-slate-700/50">
          {toast.type === 'error' ? <AlertCircle size={13} className="text-rose-400 shrink-0" /> : toast.type === 'info' ? <Sparkles size={13} className="text-sky-300 shrink-0" /> : <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />}
          <span>{toast.msg}</span>
        </div>
      )}

      {/* TAB NAV */}
      <div className="px-3 pt-2 pb-0.5 w-full">
        <div className="bg-slate-200/70 backdrop-blur-md p-0.5 rounded-xl flex items-center gap-1 border border-slate-300/50 shadow-inner">
          {[
            { id: 'builder', label: 'Route Planner', icon: Compass, count: validStops.length },
            { id: 'saved', label: 'Saved Plans', icon: Bookmark, count: savedPlans.length },
            { id: 'fleet', label: 'Fleet', icon: Car },
            { id: 'analytics', label: 'Analytics', icon: BarChart3 },
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex-1 py-1.5 px-2 rounded-lg flex items-center justify-center gap-1.5 text-xs font-bold transition-all duration-150 ${activeTab === tab.id ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900 hover:bg-white/40'}`}>
              <tab.icon size={14} className={activeTab === tab.id ? 'text-indigo-600' : 'text-slate-500'} />
              <span className="hidden min-[360px]:inline">{tab.label}</span>
              {tab.count !== undefined && <span className="bg-slate-300/80 text-slate-700 px-1 py-0.2 rounded text-[9px] font-black">{tab.count}</span>}
            </button>
          ))}
        </div>
      </div>

      <main className="flex-1 pb-8 px-3 w-full space-y-2 mt-1 overflow-y-auto overscroll-contain">

        {/* ========== BUILDER TAB ========== */}
        {activeTab === 'builder' && (
          <div className="space-y-2">

            {/* PLAN HEADER */}
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
                  <MetricsPanel metrics={metrics} />
                </div>
                <div className="flex items-center gap-1 shrink-0 flex-col">
                  <button onClick={handleReverseRoute} className="p-1.5 rounded-lg bg-slate-100/80 hover:bg-indigo-50 hover:text-indigo-600 text-slate-600 transition-colors border border-slate-200/60" title="Reverse"><ArrowUpDown size={13} /></button>
                  <button onClick={handleClearStops} className="p-1.5 rounded-lg bg-slate-100/80 hover:bg-rose-50 hover:text-rose-600 text-slate-600 transition-colors border border-slate-200/60" title="Clear"><RotateCcw size={13} /></button>
                  <button onClick={() => setShowOptimization(!showOptimization)} className={`p-1.5 rounded-lg transition-colors border ${showOptimization ? 'bg-indigo-50 text-indigo-600 border-indigo-200' : 'bg-slate-100/80 hover:bg-indigo-50 hover:text-indigo-600 text-slate-600 border-slate-200/60'}`} title="Optimize"><Sparkles size={13} /></button>
                </div>
              </div>

              {/* ORIGIN SELECTOR */}
              <div className="pt-2 border-t border-slate-100 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" /><span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Departure Origin</span></div>
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

              {/* DRIVER & VEHICLE */}
              <div className="pt-2 border-t border-slate-100 grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Driver</label>
                  <select value={selectedDriverId} onChange={(e) => setSelectedDriverId(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-slate-800 outline-none focus:border-indigo-600">
                    <option value="">All active trips</option>
                    {drivers.map(d => <option key={d.id || d.email} value={d.id}>{d.name || d.email}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Vehicle</label>
                  <select value={vehicleType} onChange={(e) => setVehicleType(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-slate-800 outline-none focus:border-indigo-600">
                    {VEHICLE_TYPES.map(v => <option key={v.id} value={v.id}>{v.label} ({v.capacity} pax)</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* OPTIMIZATION PANEL */}
            {showOptimization && (
              <div className="bg-white/95 backdrop-blur-sm border border-indigo-200 rounded-xl p-2.5 shadow-xs space-y-2 animate-in fade-in duration-150">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-indigo-700 uppercase tracking-wider flex items-center gap-1"><Sparkles size={10} /> Route Optimization</span>
                  <button onClick={() => setShowOptimization(false)} className="text-slate-400 hover:text-slate-600"><X size={12} /></button>
                </div>
                <OptimizationGoalSelector value={optimizationGoal} onChange={setOptimizationGoal} />
                <TrafficSelector value={trafficLevel} onChange={setTrafficLevel} />
                <VehicleSelector selected={vehicleType} onSelect={setVehicleType} stops={validStops} />
                <button onClick={handleOptimizeRoute} disabled={validStops.length < 3}
                  className="w-full py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-md shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.99]">
                  <Sparkles size={13} /> Optimize Route ({validStops.length} stops)
                </button>
              </div>
            )}

            {/* EMPTY STATE */}
            {stops.length === 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-6 text-center space-y-3">
                <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center mx-auto"><Compass size={22} className="text-indigo-400" /></div>
                <p className="text-xs font-bold text-slate-700">No stops yet</p>
                <p className="text-[11px] text-slate-400 max-w-[240px] mx-auto">Import from active trips or add stops manually to build your enterprise route plan.</p>
                <div className="flex gap-2 justify-center">
                  <button onClick={importTripsAsStops} className="px-3 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-colors flex items-center gap-1.5"><Upload size={12} /> Import Active Trips</button>
                  <button onClick={handleAddStop} className="px-3 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 transition-colors flex items-center gap-1.5"><Plus size={12} /> Add Stop</button>
                </div>
              </div>
            )}

            {/* STOP LIST */}
            <div className="relative space-y-1.5">
              {stops.map((stop, index) => {
                const letter = String.fromCharCode(65 + index);
                const isDragging = draggedIndex === index;
                const isPU = stop.type === 'PU';
                const isLast = index === stops.length - 1;
                const mobilityInfo = MOBILITY_OPTIONS.find(m => m.id === stop.mobility) || MOBILITY_OPTIONS[0];
                return (
                  <div key={stop.id} data-stop-index={index} draggable onDragStart={(e) => onDragStart(e, index)} onDragOver={(e) => onDragOver(e, index)} className={`relative bg-white border rounded-xl p-2.5 transition-all duration-150 shadow-xs ${isDragging ? 'border-indigo-500 bg-indigo-50/50 shadow-md ring-2 ring-indigo-500/20 scale-[0.99]' : 'border-slate-200/90 hover:border-slate-300'}`}>
                    {!isLast && <div className="absolute left-[23px] bottom-[-9px] w-0.5 h-2 bg-slate-200 pointer-events-none z-0" />}

                    {/* STOP HEADER */}
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <div className="touch-none cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-600 p-0.5 -ml-1 rounded transition-colors shrink-0"><GripVertical size={15} /></div>
                      <div className="w-5 h-5 rounded-md bg-slate-900 text-white flex items-center justify-center text-[10px] font-black shrink-0 shadow-xs">{letter}</div>
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-black tracking-wider border shrink-0 ${isPU ? 'bg-amber-50 text-amber-800 border-amber-200/80' : 'bg-emerald-50 text-emerald-800 border-emerald-200/80'}`}>{isPU ? 'PU' : 'DO'}</span>
                      <div className="flex-1 min-w-0">
                        <input type="text" value={stop.clientName || ''} onChange={(e) => handleUpdateStop(stop.id, 'clientName', e.target.value)} placeholder="Client or Clinic Name..." className="w-full bg-transparent border-b border-dashed border-slate-200 focus:border-indigo-600 pb-0.5 text-xs font-black text-slate-900 placeholder-slate-400 outline-none transition-colors truncate" />
                      </div>
                      <select value={stop.mobility || 'Amb'} onChange={(e) => handleUpdateStop(stop.id, 'mobility', e.target.value)} className="bg-slate-100/90 border border-slate-200 text-slate-700 text-[10px] font-bold rounded-md px-1 py-0.5 outline-none shrink-0">
                        {MOBILITY_OPTIONS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                      </select>
                      <button type="button" onClick={() => handleToggleExpandStop(stop.id)} className={`p-1 rounded-md text-xs transition-colors shrink-0 ${stop.expanded || stop.notes ? 'bg-indigo-100 text-indigo-700' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}><SlidersHorizontal size={12} /></button>
                      <button type="button" onClick={() => handleRemoveStop(stop.id)} className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors shrink-0"><Trash2 size={12} /></button>
                    </div>

                    {/* ADDRESS */}
                    <div className="relative w-full">
                      <MapPin size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      <input type="text" value={stop.address} onChange={(e) => handleUpdateStop(stop.id, 'address', e.target.value)} placeholder={`Address for Stop ${letter}...`} className="w-full bg-slate-50/70 hover:bg-slate-100/70 focus:bg-white border border-slate-200 focus:border-indigo-600 rounded-lg pl-8 pr-2.5 py-1.5 text-xs text-slate-900 placeholder-slate-400 outline-none focus:ring-1 focus:ring-indigo-600/20 transition-all font-medium" />
                    </div>

                    {/* EXPANDED DETAILS */}
                    {stop.expanded && (
                      <div className="mt-2 pt-2 border-t border-slate-100 grid grid-cols-2 gap-1.5 animate-in fade-in duration-150">
                        <div className="col-span-2"><label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5">Phone</label><input type="tel" value={stop.phone || ''} onChange={(e) => handleUpdateStop(stop.id, 'phone', e.target.value)} placeholder="(317) 555-0100" className="w-full bg-slate-50 border border-slate-200 rounded-md px-2 py-1 text-xs text-slate-800 outline-none focus:border-indigo-600" /></div>
                        <div><label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5">Time Window</label>
                          <select value={stop.timeWindow || 'Flexible'} onChange={(e) => handleUpdateStop(stop.id, 'timeWindow', e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-md px-2 py-1 text-xs text-slate-800 outline-none focus:border-indigo-600">
                            {TIME_WINDOW_PRESETS.map(tw => <option key={tw.id} value={tw.label}>{tw.label}</option>)}
                          </select>
                        </div>
                        <div><label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5">Appointment</label><input type="time" value={stop.appointmentTime || ''} onChange={(e) => handleUpdateStop(stop.id, 'appointmentTime', e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-md px-2 py-1 text-xs text-slate-800 outline-none focus:border-indigo-600" /></div>
                        <div className="col-span-2"><label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5">Special Instructions</label><input type="text" value={stop.specialInstructions || ''} onChange={(e) => handleUpdateStop(stop.id, 'specialInstructions', e.target.value)} placeholder="Gate code, building, floor..." className="w-full bg-slate-50 border border-slate-200 rounded-md px-2 py-1 text-xs text-slate-800 outline-none focus:border-indigo-600" /></div>
                        <div className="col-span-2"><label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5">Notes</label><input type="text" value={stop.notes} onChange={(e) => handleUpdateStop(stop.id, 'notes', e.target.value)} placeholder="Care notes..." className="w-full bg-slate-50 border border-slate-200 rounded-md px-2 py-1 text-xs text-slate-800 outline-none focus:border-indigo-600" /></div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* ADD STOP BUTTON */}
            {stops.length > 0 && (
              <button onClick={handleAddStop} className="w-full py-2 bg-white hover:bg-slate-50 border border-dashed border-slate-300 hover:border-indigo-500 hover:text-indigo-600 rounded-xl text-xs font-bold text-slate-600 flex items-center justify-center gap-1.5 transition-all group">
                <div className="w-4 h-4 rounded-full bg-slate-100 group-hover:bg-indigo-50 text-slate-600 group-hover:text-indigo-600 flex items-center justify-center transition-colors"><Plus size={12} /></div>
                <span>Add Next Stop ({String.fromCharCode(65 + stops.length)})</span>
              </button>
            )}

            {/* ACTION BUTTONS */}
            {stops.length > 0 && (
              <div className="pt-1 space-y-1.5">
                <button onClick={() => handleOpenNavigation(validStops[0]?.address)} disabled={validStops.length === 0} className={`w-full py-2.5 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-sm ${validStops.length > 0 ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white shadow-indigo-500/20 active:scale-[0.99]' : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'}`}>
                  <Navigation size={15} /><span>Start Navigation</span>
                </button>
                <div className="grid grid-cols-3 gap-1.5">
                  <button onClick={handleOpenSaveModal} disabled={validStops.length === 0} className="py-2 bg-white border border-slate-200 hover:border-indigo-600 rounded-xl text-xs font-bold text-slate-800 flex items-center justify-center gap-1.5 transition-all shadow-2xs hover:shadow-xs disabled:opacity-40">
                    <Bookmark size={14} className="text-indigo-600" /><span>Save</span>
                  </button>
                  <button onClick={() => { setTargetPlanToAssign(null); setAssignModalOpen(true); }} disabled={validStops.length === 0} className="py-2 bg-indigo-50 hover:bg-indigo-100/80 border border-indigo-200/80 rounded-xl text-xs font-bold text-indigo-700 flex items-center justify-center gap-1.5 transition-all shadow-2xs disabled:opacity-40">
                    <UserPlus size={14} /><span>Assign</span>
                  </button>
                  <button onClick={handleOptimizeRoute} disabled={validStops.length < 3} className="py-2 bg-purple-50 hover:bg-purple-100/80 border border-purple-200/80 rounded-xl text-xs font-bold text-purple-700 flex items-center justify-center gap-1.5 transition-all shadow-2xs disabled:opacity-40">
                    <Sparkles size={14} /><span>Optimize</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========== SAVED PLANS TAB ========== */}
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
                    <p className="text-[10px] text-slate-500 mt-0.5">{plan.stopsCount} stops · {plan.estTime} · {plan.distance} · {plan.cost || '—'}</p>
                  </div>
                  <div className="text-right"><div className="text-xs font-black text-indigo-600">{plan.estTime}</div><div className="text-[10px] font-medium text-slate-400">{plan.distance}</div></div>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                  <span className="text-[10px] text-slate-600">Driver: <strong className="text-slate-800 font-bold">{plan.assignedDriver || 'Unassigned'}</strong></span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => exportPlan(plan)} className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600 transition-colors" title="Export"><Download size={12} /></button>
                    <button onClick={() => { setTargetPlanToAssign(plan); setAssignModalOpen(true); }} className="px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-bold text-slate-700 transition-colors">Assign</button>
                    <button onClick={() => handleLoadPlanToBuilder(plan)} className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors">Open</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ========== FLEET TAB ========== */}
        {activeTab === 'fleet' && (
          <div className="space-y-3">
            <FleetOverview drivers={drivers} assignedPlans={savedPlans} />
            <div className="space-y-2">
              <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">All Drivers</h3>
              {drivers.length === 0 ? (
                <div className="bg-white rounded-xl p-6 border border-slate-200 text-center space-y-1.5"><Car size={20} className="mx-auto text-slate-300" /><div className="text-xs font-bold text-slate-700">No drivers found</div></div>
              ) : drivers.map(driver => (
                <div key={driver.id || driver.email} className="bg-white border border-slate-200 rounded-xl p-3 shadow-xs space-y-2 hover:border-slate-300 transition-all">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-600 to-indigo-500 text-white font-black text-xs flex items-center justify-center shadow-xs">{(driver.name || driver.email || 'D').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}</div>
                      <div><div className="text-xs font-black text-slate-900">{driver.name || driver.email}</div><div className="text-[10px] text-slate-500">{driver.vehicle || 'No vehicle'}</div></div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => handleAssignDriver(driver)} className="px-2.5 py-1 bg-indigo-50 border border-indigo-200/80 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold transition-colors shadow-2xs">Select</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ========== ANALYTICS TAB ========== */}
        {activeTab === 'analytics' && (
          <div className="space-y-3">
            <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2">
              <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5"><BarChart3 size={13} className="text-indigo-600" /> Route Analytics</h3>
              <MetricsPanel metrics={metrics} />
            </div>

            {metrics.cost && (
              <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2">
                <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-wider">Cost Breakdown</h4>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs"><span className="font-semibold text-slate-600 flex items-center gap-1"><Fuel size={11} /> Fuel ({metrics.vehicle?.costPerMile || 0.58}/mi)</span><span className="font-bold text-slate-900">${metrics.cost.fuel.toFixed(2)}</span></div>
                  <div className="flex items-center justify-between text-xs"><span className="font-semibold text-slate-600 flex items-center gap-1"><Users size={11} /> Labor ($22/hr)</span><span className="font-bold text-slate-900">${metrics.cost.labor.toFixed(2)}</span></div>
                  <div className="flex items-center justify-between text-xs"><span className="font-semibold text-slate-600 flex items-center gap-1"><Shield size={11} /> Overhead (15%)</span><span className="font-bold text-slate-900">${metrics.cost.overhead.toFixed(2)}</span></div>
                  <div className="flex items-center justify-between text-xs pt-1.5 border-t border-slate-100"><span className="font-black text-slate-900">Total Cost</span><span className="font-black text-indigo-600">${metrics.cost.total.toFixed(2)}</span></div>
                </div>
              </div>
            )}

            <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2">
              <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-wider">Capacity Analysis</h4>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs"><span className="font-semibold text-slate-600">Vehicle Type</span><span className="font-bold text-slate-900">{metrics.vehicle?.label || 'Sedan'}</span></div>
                <div className="flex items-center justify-between text-xs"><span className="font-semibold text-slate-600">Total Capacity</span><span className="font-bold text-slate-900">{metrics.capacityTotal} passengers</span></div>
                <div className="flex items-center justify-between text-xs"><span className="font-semibold text-slate-600">Assigned Passengers</span><span className="font-bold text-slate-900">{metrics.capacityUsed}</span></div>
                <div className="w-full bg-slate-100 rounded-full h-2 mt-1">
                  <div className={`h-2 rounded-full transition-all ${metrics.utilizationRate > 80 ? 'bg-emerald-500' : metrics.utilizationRate > 50 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${Math.min(100, metrics.utilizationRate)}%` }} />
                </div>
                <p className="text-[10px] font-semibold text-slate-500">{metrics.utilizationRate}% capacity utilization</p>
              </div>
            </div>

            <RouteAuditLog log={auditLog} />
          </div>
        )}
      </main>

      {/* ========== MODALS ========== */}
      {saveModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white border border-slate-200 w-full max-w-sm rounded-3xl p-5 shadow-2xl space-y-3.5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5"><h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">Save Route Plan</h3><button onClick={() => setSaveModalOpen(false)} className="text-slate-400 hover:text-slate-700 p-1"><X size={16} /></button></div>
            <form onSubmit={handleConfirmSavePlan} className="space-y-3">
              <div><label className="text-[11px] font-bold text-slate-700 block mb-1">Plan Name *</label><input type="text" value={saveFormName} onChange={(e) => setSaveFormName(e.target.value)} placeholder="e.g. Westside Dialysis Run" required className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 outline-none focus:border-indigo-600 focus:bg-white transition-colors" /></div>
              <div><label className="text-[11px] font-bold text-slate-700 block mb-1">Notes</label><textarea rows={2} value={saveFormNotes} onChange={(e) => setSaveFormNotes(e.target.value)} placeholder="e.g. Return trip scheduled for 1:30 PM..." className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 outline-none focus:border-indigo-600 focus:bg-white transition-colors" /></div>
              <div className="rounded-xl bg-indigo-50 border border-indigo-100 p-2.5 space-y-1">
                <div className="text-[10px] font-bold text-indigo-700 uppercase">Plan Summary</div>
                <div className="text-[11px] font-semibold text-indigo-600">{validStops.length} stops · {metrics.distance} mi · {metrics.totalTime} min · ${metrics.cost.total.toFixed(0)}</div>
              </div>
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
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-600 to-indigo-500 text-white font-bold text-[10px] flex items-center justify-center">{(driver.name || 'D').split(' ').map(n => n[0]).join('').substring(0, 2)}</div>
                    <div><div className="font-bold text-slate-900">{driver.name || driver.email}</div><div className="text-[10px] text-slate-500">{driver.vehicle || ''}</div></div>
                  </div>
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
