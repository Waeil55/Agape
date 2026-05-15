import React, { useState, useEffect, useCallback, useRef } from 'react';
import { tripMatchesTodayOrTomorrow } from '../utils/tripDate';
import { EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { auth } from '../config/firebase';
import { 
  Truck, MapPin, Phone, MessageCircle, CheckCircle2, XCircle, 
  AlertCircle, Navigation, Gauge, Clock, User, ChevronRight, Play, Check,
  ChevronUp, ChevronDown, Edit2, ListChecks, Sparkles, Target, RotateCcw, Lock
} from 'lucide-react';

const cleanPhone = (p) => (p || '').replace(/[^0-9]/g, '');

const FACILITY_KEYS = ['hospital','center','clinic','academy','school','treatment','health','dental','pharmacy','office','suite','care','medical','therapy','rehab','wellness','surgery','diagnostic','lab','institute'];

const clientPhone = (trip) => {
  if (!trip) return '';
  const pickupFac = FACILITY_KEYS.some(k => (trip.pickup || '').toLowerCase().includes(k));
  const dropFac = FACILITY_KEYS.some(k => (trip.dropoff || '').toLowerCase().includes(k));
  if (pickupFac && !dropFac) return trip.dropoffPhone || trip.pickupPhone || '';
  if (!pickupFac && dropFac) return trip.pickupPhone || trip.dropoffPhone || '';
  return trip.pickupPhone || trip.dropoffPhone || '';
};

const to12hr = (time) => {
  if (!time || time === 'Will Call' || time === 'WC') return time || 'Will Call';
  const m = String(time).match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (m && m[3]) return time;
  const parts = String(time).match(/(\d{1,2}):(\d{2})/);
  if (!parts) return time;
  let h = parseInt(parts[1], 10);
  const min = parts[2];
  const ampm = h >= 12 ? 'PM' : 'AM';
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${min} ${ampm}`;
};

const DriverPage = ({ currentUser, role, drivers, trips, activeMission, onUpdateMission, onUpdateTrip, onDriverStatusUpdate, onCompleteTrip, onOpenSettings, appSettings, phoneNumbers }) => {
  const me = drivers.find(d => (d.email || '').toLowerCase() === (currentUser || '').toLowerCase());

  if (!me) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-8 text-center">
        <div className="w-20 h-20 bg-blue-100 rounded-[2rem] flex items-center justify-center mb-6 animate-pulse">
          <Truck size={40} className="text-blue-600" />
        </div>
        <h2 className="text-xl font-black text-slate-900">Synchronizing Profile...</h2>
        <p className="text-sm text-slate-500 mt-2 max-w-xs mx-auto">
          We&apos;re connecting to the enterprise cloud to retrieve your driver credentials.
        </p>
        <div className="mt-8 flex gap-2">
          <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce [animation-delay:-0.3s]" />
          <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce [animation-delay:-0.15s]" />
          <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" />
        </div>
      </div>
    );
  }

  // Filter trips assigned to me for today or tomorrow (matches dispatch manifest window)
  const myTrips = trips
    .filter(t => {
      const isAssignedToMe = (t.driverId === me?.id || ((t.driverEmail || '').toLowerCase() === (me?.email || '').toLowerCase()));
      const inWindow = tripMatchesTodayOrTomorrow(t.date);
      const isActiveStatus = !['Completed', 'Cancelled', 'No Show'].includes(t.status);
      return (isAssignedToMe && inWindow) || (isAssignedToMe && isActiveStatus);
    })
    .sort((a, b) => {
      const timeToMinutes = (t) => {
        if (!t) return 1440;
        const cleanTime = String(t).toUpperCase().trim();
        if (cleanTime === 'WILL CALL' || cleanTime === 'WC') return 1440;
        const m = cleanTime.match(/(\d{1,2})(?::(\d{1,2}))?\s*(AM|PM)?/);
        if (!m) return 1440;
        let h = parseInt(m[1], 10);
        let min = parseInt(m[2] || '0', 10);
        const p = m[3];
        if (p === 'PM' && h < 12) h += 12;
        if (p === 'AM' && h === 12) h = 0;
        return h * 60 + min;
      };
      return timeToMinutes(a.time) - timeToMinutes(b.time);
    });
  
  // Find the FIRST active trip (not Completed, Cancelled, or No Show)
  const activeTrip = myTrips.find(t => !['Completed', 'Cancelled', 'No Show'].includes(t.status)) || null;
  const completedTrips = myTrips.filter(t => t.status === 'Completed');
  const otherTripsCount = myTrips.filter(t => ['Cancelled', 'No Show'].includes(t.status)).length;

  const [waitTimer, setWaitTimer] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [showDropoffModal, setShowDropoffModal] = useState(false);
  
  const [pickupOdometer, setPickupOdometer] = useState(me?.odometer || '');
  const [dropoffOdometer, setDropoffOdometer] = useState('');
  const [paperSignatureConfirmed, setPaperSignatureConfirmed] = useState(false);
  const [unableToSign, setUnableToSign] = useState(false);
  const [unableReason, setUnableReason] = useState('');

  // MULTI-LOAD & UNIFIED STATE
  const [selectedTripIds, setSelectedTripIds] = useState([]);
  const [showEditModal, setShowEditModal] = useState(null); // trip object
  const [isAiOptimizing, setIsAiOptimizing] = useState(false);
  const [activeModalTripId, setActiveModalTripId] = useState(null);
  const [customManifestOrder, setCustomManifestOrder] = useState([]); // Array of trip IDs
  const [confirmAction, setConfirmAction] = useState(null); // { tripId, type: 'noshow'|'cancel' }
  const [confirmPassword, setConfirmPassword] = useState('');
  const [confirmError, setConfirmError] = useState('');

  // Sync custom order with myTrips IDs
  useEffect(() => {
    setCustomManifestOrder(prev => {
      const currentIds = myTrips.map(t => t.id);
      // If we have new trips not in the custom order, or trips were removed
      const hasChanges = currentIds.some(id => !prev.includes(id)) || prev.some(id => !currentIds.includes(id));
      
      if (hasChanges) {
        // Keep existing order for trips we already know about
        const existing = prev.filter(id => currentIds.includes(id));
        const newIds = currentIds.filter(id => !prev.includes(id));
        
        // For new IDs, we should ideally insert them by time sort rather than just appending
        // But for simplicity, we'll append and then the user can move them, 
        // OR we just re-initialize the whole thing if it was mostly empty
        if (prev.length === 0) return currentIds;
        
        // Create a new order that includes new IDs
        const combined = [...existing, ...newIds];
        
        // Re-sort the whole combined list by time to ensure "mix" doesn't happen by default
        return combined.sort((idA, idB) => {
          const tripA = myTrips.find(t => t.id === idA);
          const tripB = myTrips.find(t => t.id === idB);
          
          const timeToMinutes = (t) => {
            if (!t) return 1440;
            const cleanTime = String(t).toUpperCase().trim();
            const m = cleanTime.match(/(\d{1,2})(?::(\d{1,2}))?\s*(AM|PM)?/);
            if (!m) return 1440;
            let h = parseInt(m[1], 10);
            let min = parseInt(m[2] || '0', 10);
            const p = m[3];
            if (p === 'PM' && h < 12) h += 12;
            if (p === 'AM' && h === 12) h = 0;
            return h * 60 + min;
          };
          
          return timeToMinutes(tripA?.time) - timeToMinutes(tripB?.time);
        });
      }
      return prev;
    });
  }, [myTrips.length]);

  const orderedTrips = [...myTrips].sort((a, b) => {
    const indexA = customManifestOrder.indexOf(a.id);
    const indexB = customManifestOrder.indexOf(b.id);
    if (indexA === -1 || indexB === -1) return 0;
    return indexA - indexB;
  });

  // Wait Time Tracker Logic
  useEffect(() => {
    let interval;
    if (activeTrip?.status === 'Arrived at Pickup') {
      setIsTimerRunning(true);
      const startTime = activeTrip.arrivalTime ? new Date(activeTrip.arrivalTime).getTime() : Date.now();
      interval = setInterval(() => {
        setWaitTimer(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
    } else {
      setIsTimerRunning(false);
      setWaitTimer(0);
    }
    return () => clearInterval(interval);
  }, [activeTrip?.status, activeTrip?.arrivalTime]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const openMaps = (address) => {
    if (!address) return;
    const navApp = appSettings?.navigationApp || 'google';
    const encoded = encodeURIComponent(address);
    let url;
    switch (navApp) {
      case 'waze':
        url = `https://www.waze.com/ul?q=${encoded}&navigate=yes`;
        break;
      case 'apple':
        url = `https://maps.apple.com/?daddr=${encoded}&dirflg=d`;
        break;
      case 'google':
      default:
        url = `https://www.google.com/maps/dir/?api=1&destination=${encoded}`;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleStartTrip = () => {
    onUpdateTrip(activeTrip.id, 'En Route to Pickup');
  };

  const handleMarkArrivedPickup = () => {
    onUpdateTrip(activeTrip.id, 'Arrived at Pickup', { arrivalTime: new Date().toISOString() });
  };

  const handlePatientReady = () => {
    setShowSignatureModal(true);
  };

  const handleConfirmDepart = () => {
    if (!pickupOdometer) return alert('Please enter pickup odometer.');
    if (!paperSignatureConfirmed && !unableToSign) return alert('Confirm paper signature or mark patient unable to sign.');
    if (unableToSign && !unableReason) return alert('Select a reason when patient is unable to sign.');
    
    onUpdateTrip(activeModalTripId, 'En Route to Dropoff', {
      pickupOdometer: parseInt(pickupOdometer),
      paperSignatureConfirmed,
      unableToSign,
      unableReason,
      departedPickupTime: new Date().toISOString()
    });
    setShowSignatureModal(false);
    setActiveModalTripId(null);
    setPaperSignatureConfirmed(false);
    setUnableToSign(false);
    setUnableReason('');
  };

  const handleMarkArrivedDropoff = () => {
    onUpdateTrip(activeTrip.id, 'Arrived at Dropoff', { arrivalDropoffTime: new Date().toISOString() });
  };

  const handleCompleteTrip = () => {
    setShowDropoffModal(true);
    setDropoffOdometer('');
  };

  const handleFinishTrip = () => {
    const dropoffOdo = parseInt(dropoffOdometer);
    const trip = trips.find(t => t.id === activeModalTripId);
    if (isNaN(dropoffOdo) || dropoffOdo < (trip?.pickupOdometer || me?.odometer || 0)) {
      return alert('Invalid dropoff odometer.');
    }
    
    onCompleteTrip(activeModalTripId, me?.id, dropoffOdo);
    setShowDropoffModal(false);
    setActiveModalTripId(null);
  };

  const handleConfirmAction = async () => {
    const user = auth.currentUser;
    if (!user || !user.email) { setConfirmError('Authentication error.'); return; }
    try {
      const cred = EmailAuthProvider.credential(user.email, confirmPassword);
      await reauthenticateWithCredential(user, cred);
      if (confirmAction.type === 'noshow') {
        onUpdateTrip(confirmAction.tripId, 'No Show');
        setCustomManifestOrder(prev => prev.filter(id => id !== confirmAction.tripId));
      } else if (confirmAction.type === 'cancel') {
        onUpdateTrip(confirmAction.tripId, 'Cancelled');
        setCustomManifestOrder(prev => prev.filter(id => id !== confirmAction.tripId));
      }
      setConfirmAction(null);
      setConfirmPassword('');
      setConfirmError('');
    } catch {
      setConfirmError('Invalid password. Action denied.');
    }
  };

  const handleNoShow = (tripId) => {
    setConfirmAction({ tripId, type: 'noshow' });
    setConfirmPassword('');
    setConfirmError('');
  };

  const handleCancel = (tripId) => {
    setConfirmAction({ tripId, type: 'cancel' });
    setConfirmPassword('');
    setConfirmError('');
  };

  const handleUndoStep = (tripId, currentStatus) => {
    const statusMap = {
      'En Route to Pickup': 'Assigned',
      'Arrived at Pickup': 'En Route to Pickup',
      'En Route to Dropoff': 'Arrived at Pickup',
      'Arrived at Dropoff': 'En Route to Dropoff'
    };
    const prevStatus = statusMap[currentStatus];
    if (prevStatus && window.confirm(`Revert status to "${prevStatus}"?`)) {
      onUpdateTrip(tripId, prevStatus);
    }
  };

  const handleToggleSelection = (id) => {
    setSelectedTripIds((prev) => prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]);
  };

  const handleStartBatch = () => {
    if (selectedTripIds.length === 0) return;
    selectedTripIds.forEach(id => onUpdateTrip(id, 'En Route to Pickup'));
    setSelectedTripIds([]);
  };

  const moveTask = (index, direction) => {
    const newOrder = [...customManifestOrder];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= newOrder.length) return;
    [newOrder[index], newOrder[targetIndex]] = [newOrder[targetIndex], newOrder[index]];
    setCustomManifestOrder(newOrder);
  };

  const optimizeRoute = () => {
    setIsAiOptimizing(true);
    setTimeout(() => {
      const sortedIds = [...orderedTrips]
        .sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time))
        .map(t => t.id);
      setCustomManifestOrder(sortedIds);
      setIsAiOptimizing(false);
    }, 1200);
  };

  const timeToMinutes = (t) => {
    if (!t || t === 'Will Call') return 1440;
    const m = t.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!m) return 1440;
    let h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    if (m[3].toUpperCase() === 'PM' && h !== 12) h += 12;
    if (m[3].toUpperCase() === 'AM' && h === 12) h = 0;
    return h * 60 + min;
  };

  const isClockedIn = me?.clockedIn || false;

  if (role !== 'driver') {
    return (
      <div className="p-12 text-center text-slate-500">
        <Truck size={48} className="mx-auto text-slate-300 mb-4" />
        <p className="font-bold text-lg">Driver Console</p>
        <p className="text-sm mt-1">Only driver accounts can access this page.</p>
      </div>
    );
  }

  const renderMissionView = () => {
    if (!activeMission) return null;
    const { legs, currentLegIndex } = activeMission;
    const currentLeg = legs[currentLegIndex];
    if (!currentLeg) return <div className="p-8 text-center bg-white rounded-3xl border">Mission Complete! <button onClick={() => onUpdateMission(null)} className="text-blue-600 block mx-auto mt-2">Clear Mission</button></div>;

    const nextLeg = () => {
      if (currentLegIndex < legs.length - 1) {
        onUpdateMission({ ...activeMission, currentLegIndex: currentLegIndex + 1 });
      } else {
        if (window.confirm("All legs completed. Finalize mission?")) {
          // Complete all trips in mission
          const tripIds = [...new Set(legs.map(l => l.tripId))];
          tripIds.forEach(id => onUpdateTrip(id, 'Completed'));
          onUpdateMission(null);
        }
      }
    };

    const prevLeg = () => {
      if (currentLegIndex > 0) {
        onUpdateMission({ ...activeMission, currentLegIndex: currentLegIndex - 1 });
      }
    };

    return (
      <div className="space-y-6">
        {/* LEG INDICATORS */}
        <div className="flex items-center justify-center gap-2 overflow-x-auto pb-2">
          {legs.map((leg, idx) => (
            <div key={leg.id} className={`flex-shrink-0 w-12 h-12 rounded-2xl flex flex-col items-center justify-center transition-all ${idx === currentLegIndex ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30 scale-110' : idx < currentLegIndex ? 'bg-emerald-100 text-emerald-600' : 'bg-white text-slate-400 border border-slate-100 shadow-sm'}`}>
              <span className="text-[10px] font-black uppercase">{leg.type.charAt(0)}{idx + 1}</span>
            </div>
          ))}
        </div>

        {/* ACTIVE LEG CARD */}
        <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 overflow-hidden animate-in zoom-in-95 duration-300">
          <div className="p-8 space-y-8">
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${currentLeg.type === 'PICKUP' ? 'bg-amber-50 text-amber-600' : 'bg-rose-50 text-rose-600'}`}>
                  {currentLeg.type}
                </span>
                <h2 className="text-3xl font-black text-slate-900 leading-tight">
                  {currentLeg.patient}
                  {currentLeg.bookingId ? <span className="block text-blue-600 text-base font-medium mt-1">Booking: {currentLeg.bookingId}</span> : null}
                </h2>
                {currentLeg.notes && (
                  <div className="bg-amber-50/50 px-4 py-2 rounded-xl inline-block border border-amber-100/50">
                    <p className="text-xs font-bold text-amber-700">{currentLeg.notes}</p>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <a href={`tel:${cleanPhone(currentLeg.phone)}`} className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center hover:bg-blue-100 transition active:scale-90"><Phone size={20} /></a>
                <a href={`sms:${cleanPhone(currentLeg.phone)}`} className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center hover:bg-indigo-100 transition active:scale-90"><MessageCircle size={20} /></a>
              </div>
            </div>

            <div className="bg-slate-50/80 rounded-[2rem] p-6 border border-slate-100 relative group overflow-hidden">
              <div className="absolute top-4 right-4 text-[10px] font-black text-slate-300 uppercase tracking-widest group-hover:text-blue-400 transition-colors">Target Address</div>
              <p className="text-xl font-black text-slate-800 leading-snug mb-6 max-w-[90%]">{currentLeg.address}</p>
              <button onClick={() => openMaps(currentLeg.address)} className="w-full py-4 bg-white border border-slate-200 text-blue-600 rounded-2xl font-black text-sm flex items-center justify-center gap-3 shadow-sm hover:border-blue-200 hover:bg-blue-50/30 transition-all active:scale-[0.98]">
                <Navigation size={18} /> NAVIGATE GPS
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Odometer</label>
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 flex items-center gap-3">
                  <Gauge size={16} className="text-slate-400" />
                  <input type="number" placeholder="Miles" className="bg-transparent border-none outline-none w-full font-bold text-slate-700" />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Arrival Time</label>
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 flex items-center gap-3">
                  <Clock size={16} className="text-slate-400" />
                  <input type="time" className="bg-transparent border-none outline-none w-full font-bold text-slate-700" />
                </div>
              </div>
            </div>

            <div className="space-y-3 pt-4">
              <button onClick={nextLeg} className="w-full py-6 bg-blue-600 text-white rounded-[2rem] font-black text-lg flex items-center justify-center gap-3 shadow-2xl shadow-blue-500/40 active:scale-[0.98] transition-all">
                Confirm & Next Leg <ChevronRight size={24} />
              </button>
              {currentLegIndex > 0 && (
                <button onClick={prevLeg} className="w-full py-3 bg-slate-50 text-slate-400 rounded-2xl font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-slate-100 transition">
                  <RotateCcw size={14} /> Step Back (Undo Leg)
                </button>
              )}
            </div>
          </div>
        </div>

        {/* MISSION ACTIONS */}
        <div className="flex gap-3 px-4">
          <button onClick={() => {
            const newOrder = [...legs];
            if (currentLegIndex < legs.length - 1) {
              [newOrder[currentLegIndex], newOrder[currentLegIndex+1]] = [newOrder[currentLegIndex+1], newOrder[currentLegIndex]];
              onUpdateMission({ ...activeMission, legs: newOrder });
            }
          }} className="flex-1 py-3 bg-white border border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center justify-center gap-2 shadow-sm active:scale-95 transition">
             Swap with Next
          </button>
          <button onClick={() => onUpdateMission(null)} className="flex-1 py-3 bg-rose-50 border border-rose-100 rounded-2xl text-[10px] font-black uppercase tracking-widest text-rose-600 flex items-center justify-center gap-2 shadow-sm active:scale-95 transition">
             Abort Mission
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 max-w-xl mx-auto pb-24">
      {/* Signature & Pickup Odometer Modal - Paper Signature Confirmation Only */}
      {showSignatureModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" />
          <div className="bg-white w-full max-w-md rounded-[2rem] p-6 sm:p-8 shadow-2xl relative z-10 border border-slate-200 overflow-y-auto max-h-[90vh]">
            <h3 className="text-xl font-black text-slate-900 mb-6 flex items-center gap-2">
              <CheckCircle2 className="text-blue-600" /> Pickup Confirmation
            </h3>
            
            <div className="space-y-6">
              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
                <p className="text-sm font-bold text-blue-900">✓ Confirm Patient Received Service</p>
                <p className="text-xs text-blue-700 mt-2">The driver confirms they collected the patient's paper signature at pickup.</p>
              </div>
              
              <label className="flex items-start gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-100 transition">
                <input type="checkbox" checked={paperSignatureConfirmed} onChange={(e) => setPaperSignatureConfirmed(e.target.checked)} className="w-5 h-5 rounded border-slate-300 text-blue-600 mt-1 flex-shrink-0" />
                <div>
                  <span className="text-sm font-bold text-slate-800 block">Paper Signature Collected</span>
                  <p className="text-xs text-slate-600 mt-1">I confirm the patient signed the paper form for this service.</p>
                </div>
              </label>

              <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-100 transition">
                <input type="checkbox" checked={unableToSign} onChange={(e) => setUnableToSign(e.target.checked)} className="w-5 h-5 rounded border-slate-300 text-blue-600 flex-shrink-0" />
                <span className="text-sm font-bold text-slate-700">Patient Unable to Sign</span>
              </label>

              {unableToSign && (
                <select 
                  value={unableReason} 
                  onChange={(e) => setUnableReason(e.target.value)}
                  className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm font-semibold"
                >
                  <option value="">Select Reason...</option>
                  <option value="Physical Limitation">Physical Limitation</option>
                  <option value="Cognitive Impairment">Cognitive Impairment</option>
                  <option value="Refused">Refused</option>
                  <option value="Other">Other</option>
                </select>
              )}
              
              <div>
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest block mb-2">Verify Pickup Odometer</label>
                <div className="relative">
                  <Gauge className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input 
                    type="number" 
                    placeholder="Enter Mileage" 
                    value={pickupOdometer} 
                    onChange={(e) => setPickupOdometer(e.target.value)}
                    className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-xl text-blue-600"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button onClick={() => setShowSignatureModal(false)} className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold active:scale-95 transition-all">Cancel</button>
                <button onClick={handleConfirmDepart} className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-bold active:scale-95 transition-all shadow-lg shadow-blue-500/30">Confirm & Depart</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Dropoff Odometer Modal */}
      {showDropoffModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" />
          <div className="bg-white w-full max-w-sm rounded-[2rem] p-8 shadow-2xl relative z-10 border border-slate-200">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-3xl flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 size={32} />
            </div>
            <h3 className="text-xl font-black text-center text-slate-900 mb-2">Finalize Dropoff</h3>
            <p className="text-sm text-center text-slate-500 mb-6">Enter the final odometer reading to complete this trip.</p>
            
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Dropoff Odometer</label>
                <input 
                  type="number" 
                  autoFocus
                  value={dropoffOdometer} 
                  onChange={(e) => setDropoffOdometer(e.target.value)}
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-2xl text-center text-emerald-600"
                  placeholder="000000"
                />
              </div>
              
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex justify-between items-center text-xs font-bold">
                <span className="text-slate-400">Total Trip Miles</span>
                <span className="text-slate-900">
                  {dropoffOdometer && activeModalTripId ? Math.max(0, parseInt(dropoffOdometer) - (trips.find(t => t.id === activeModalTripId)?.pickupOdometer || 0)) : 0} mi
                </span>
              </div>

              <div className="flex gap-2 pt-2">
                <button onClick={() => setShowDropoffModal(false)} className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold active:scale-95 transition-all">Cancel</button>
                <button onClick={handleFinishTrip} className="flex-1 py-4 bg-emerald-600 text-white rounded-2xl font-bold active:scale-95 transition-all shadow-lg shadow-emerald-500/30">Finish Trip</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Clock In/Out Header */}
      <div className={`p-4 rounded-[1.5rem] text-white shadow-xl ${isClockedIn ? 'bg-gradient-to-br from-blue-600 to-indigo-700' : 'bg-gradient-to-br from-slate-700 to-slate-900'}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center font-black shrink-0">
              {me?.name?.charAt(0)}
            </div>
            <div className="min-w-0">
              <h1 className="font-bold text-sm truncate">{me?.name}</h1>
              <p className="text-[10px] opacity-80 truncate"><Truck size={10} className="inline mr-1" />{me?.vehicle || 'No Vehicle'}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {phoneNumbers?.routing && (
              <a href={`tel:${cleanPhone(phoneNumbers.routing)}`} className="px-2.5 py-1.5 rounded-lg bg-blue-500 flex flex-col items-center justify-center hover:bg-blue-400 transition active:scale-90 min-w-[48px]" title="Call Routing">
                <Phone size={12} />
                <span className="text-[7px] font-black uppercase leading-tight mt-0.5">Routing</span>
              </a>
            )}
            {phoneNumbers?.dispatcher && (
              <a href={`tel:${cleanPhone(phoneNumbers.dispatcher)}`} className="px-2.5 py-1.5 rounded-lg bg-emerald-500 flex flex-col items-center justify-center hover:bg-emerald-400 transition active:scale-90 min-w-[48px]" title="Call Dispatcher">
                <Phone size={12} />
                <span className="text-[7px] font-black uppercase leading-tight mt-0.5">Dispatch</span>
              </a>
            )}
            <button 
              onClick={() => onDriverStatusUpdate(me?.id, !isClockedIn)}
              className={`px-3 py-1.5 rounded-lg font-black text-[10px] uppercase tracking-widest transition-all active:scale-95 ${isClockedIn ? 'bg-rose-500 text-white' : 'bg-emerald-500 text-white'}`}
            >
              {isClockedIn ? 'Offline' : 'Clock In'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mt-3">
          <div className="bg-white/10 rounded-xl p-2 text-center">
            <p className="text-base font-black">{myTrips.length}</p>
            <p className="text-[8px] uppercase font-bold opacity-60">Total</p>
          </div>
          <div className="bg-white/10 rounded-xl p-2 text-center">
            <p className="text-base font-black">{completedTrips.length}</p>
            <p className="text-[8px] uppercase font-bold opacity-60">Done</p>
          </div>
          <div className="bg-white/10 rounded-xl p-2 text-center">
            <p className="text-base font-black">{myTrips.length - completedTrips.length - otherTripsCount}</p>
            <p className="text-[8px] uppercase font-bold opacity-60">To Go</p>
          </div>
        </div>
      </div>

      {!isClockedIn ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center shadow-sm">
          <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center mx-auto mb-2">
            <Clock size={24} className="text-slate-400" />
          </div>
          <p className="text-sm font-black text-slate-900">Off the Clock</p>
          <p className="text-[11px] text-slate-500 mt-1">Clock in to view and start your trips.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {activeMission ? renderMissionView() : (
            <>
              {/* UNIFIED MANIFEST LIST */}
              <div className="px-2 space-y-4">
                <div className="flex justify-between items-center px-4">
                  <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <ListChecks size={14} className="text-blue-500" /> Today &amp; Tomorrow Manifest
                  </h3>
                  <button onClick={optimizeRoute} disabled={isAiOptimizing} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-indigo-100 transition active:scale-95 disabled:opacity-50">
                    <Sparkles size={12} className={isAiOptimizing ? 'animate-spin' : ''} />
                    {isAiOptimizing ? 'Optimizing...' : 'AI Optimize'}
                  </button>
                </div>

                <div className="space-y-4">
                  {orderedTrips.filter(t => !['Completed', 'Cancelled', 'No Show'].includes(t.status)).map((t, idx) => {
                    const isSelected = selectedTripIds.includes(t.id);
                    const isActive = !['Assigned', 'Unassigned'].includes(t.status);
                    
                    return (
                      <div key={t.id} className={`bg-white rounded-3xl border-2 transition-all p-5 ${isActive ? 'border-blue-500 shadow-xl shadow-blue-500/5' : 'border-slate-100'}`}>
                        <div className="flex items-start gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-start mb-3 gap-3">
                              <label className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-2 text-slate-500 text-xs font-black cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => handleToggleSelection(t.id)}
                                  className="w-4 h-4 rounded border-slate-300 text-blue-600"
                                />
                                Select
                              </label>
                              <div className="min-w-0">
                                <h4 className="font-black text-slate-900 text-lg truncate leading-tight">{t.patient}</h4>
                                {t.bookingId ? <p className="text-blue-600 text-xs font-medium -mt-0.5">Booking: {t.bookingId}</p> : null}
                                <div className="flex items-center gap-3 mt-2">
                                  <span className="big-time text-blue-600 whitespace-nowrap">{to12hr(t.time)}</span>
                                  <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${isActive ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'bg-slate-100 text-slate-500'}`}>
                                    {t.status}
                                  </span>
                                </div>
                              </div>
                              <div className="flex flex-col gap-1">
                                <button onClick={() => moveTask(idx, -1)} disabled={idx === 0} className="p-1 text-slate-300 hover:text-slate-900 disabled:opacity-20"><ChevronUp size={18} /></button>
                                <button onClick={() => moveTask(idx, 1)} disabled={idx === myTrips.length - 1} className="p-1 text-slate-300 hover:text-slate-900 disabled:opacity-20"><ChevronDown size={18} /></button>
                              </div>
                            </div>

                            {/* SMART ADDRESS TIMELINE */}
                            <div className="mb-6 relative">
                              <div className="absolute left-[15px] top-6 bottom-6 w-0.5 bg-gradient-to-b from-blue-200 to-emerald-200" />
                              
                              <div className="relative flex gap-4 mb-4 group">
                                <div className="mt-1 w-8 h-8 rounded-full bg-blue-50 border-2 border-blue-200 flex items-center justify-center flex-shrink-0 z-10 transition-colors group-hover:bg-blue-100">
                                  <MapPin size={14} className="text-blue-600" />
                                </div>
                                <div className="flex-1 p-3 rounded-2xl bg-slate-50/50 border border-slate-100/50 group-hover:bg-slate-50 transition-colors">
                                  <p className="text-[10px] font-black text-blue-600 uppercase tracking-[0.15em] mb-1.5 flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-blue-600" /> Pickup Point
                                  </p>
                                  <p className="text-base font-bold text-slate-900 leading-snug">{t.pickup}</p>
                                </div>
                              </div>

                              <div className="relative flex gap-4 group">
                                <div className="mt-1 w-8 h-8 rounded-full bg-emerald-50 border-2 border-emerald-200 flex items-center justify-center flex-shrink-0 z-10 transition-colors group-hover:bg-emerald-100">
                                  <Target size={14} className="text-emerald-600" />
                                </div>
                                <div className="flex-1 p-3 rounded-2xl bg-slate-50/50 border border-slate-100/50 group-hover:bg-slate-50 transition-colors">
                                  <p className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.15em] mb-1.5 flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" /> Destination
                                  </p>
                                  <p className="text-base font-bold text-slate-900 leading-snug">{t.dropoff}</p>
                                </div>
                              </div>
                            </div>

                            {/* TRIP WORKFLOW ACTIONS */}
                            <div className="space-y-3">
                              {t.status === 'Assigned' && !isSelected && (
                                <button onClick={() => onUpdateTrip(t.id, 'En Route to Pickup')} className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 active:scale-[0.98] transition-all">
                                  <Play size={18} fill="currentColor" /> Start Pickup Trip
                                </button>
                              )}

                              {t.status === 'En Route to Pickup' && (
                                <div className="flex gap-2">
                                  <button onClick={() => openMaps(t.pickup)} className="flex-1 py-4 bg-slate-900 text-white rounded-2xl font-black text-xs flex items-center justify-center gap-2 active:scale-[0.98] transition-all">
                                    <Navigation size={16} /> Nav to Pickup
                                  </button>
                                  <button onClick={() => onUpdateTrip(t.id, 'Arrived at Pickup', { arrivalTime: new Date().toISOString() })} className="flex-[2] py-4 bg-blue-600 text-white rounded-2xl font-black text-xs flex items-center justify-center gap-2 active:scale-[0.98] transition-all shadow-lg shadow-blue-500/20">
                                    <CheckCircle2 size={18} /> Arrived at Pickup
                                  </button>
                                </div>
                              )}

                              {t.status === 'Arrived at Pickup' && (
                                <button onClick={() => { setActiveModalTripId(t.id); setShowSignatureModal(true); }} className="w-full py-4 bg-blue-700 text-white rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-blue-600/30 active:scale-[0.98] transition-all">
                                  <User size={18} /> Confirm Patient Pickup
                                </button>
                              )}

                              {t.status === 'En Route to Dropoff' && (
                                <div className="flex gap-2">
                                  <button onClick={() => openMaps(t.dropoff)} className="flex-1 py-4 bg-slate-900 text-white rounded-2xl font-black text-xs flex items-center justify-center gap-2 active:scale-[0.98] transition-all">
                                    <Navigation size={16} /> Nav to Dropoff
                                  </button>
                                  <button onClick={() => onUpdateTrip(t.id, 'Arrived at Dropoff', { arrivalDropoffTime: new Date().toISOString() })} className="flex-[2] py-4 bg-rose-600 text-white rounded-2xl font-black text-xs flex items-center justify-center gap-2 active:scale-[0.98] transition-all shadow-lg shadow-rose-500/20">
                                    <CheckCircle2 size={18} /> Arrived at Dropoff
                                  </button>
                                </div>
                              )}

                              {t.status === 'Arrived at Dropoff' && (
                                <button onClick={() => { setActiveModalTripId(t.id); setShowDropoffModal(true); }} className="w-full py-4 bg-rose-700 text-white rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-rose-600/30 active:scale-[0.98] transition-all">
                                  <CheckCircle2 size={18} /> Complete Dropoff
                                </button>
                              )}

                              {/* UNDO BUTTON */}
                              {isActive && (
                                <button 
                                  onClick={() => handleUndoStep(t.id, t.status)} 
                                  className="w-full py-2 bg-slate-50 text-slate-400 rounded-xl font-bold text-[10px] uppercase tracking-widest flex items-center justify-center gap-1.5 hover:bg-slate-100 transition mt-2 border border-slate-100"
                                >
                                  <RotateCcw size={12} /> Step Back (Undo)
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                        
                        <div className="mt-6 pt-5 border-t border-slate-100 flex justify-between items-center">
                          <div className="flex gap-3">
                            <a href={`tel:${cleanPhone(clientPhone(t))}`} className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100 transition active:scale-90"><Phone size={16} /></a>
                            <a href={`sms:${cleanPhone(clientPhone(t))}`} className="p-2.5 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition active:scale-90"><MessageCircle size={16} /></a>
                            <button onClick={() => setShowEditModal(t)} className="p-2.5 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition active:scale-90"><Edit2 size={16} /></button>
                          </div>
                          <div className="flex gap-4">
                            <button onClick={() => handleNoShow(t.id)} className="text-[10px] font-black text-amber-600 uppercase tracking-widest px-3 py-1.5 hover:bg-amber-50 rounded-xl transition">No Show</button>
                            <button onClick={() => handleCancel(t.id)} className="text-[10px] font-black text-rose-500 uppercase tracking-widest px-3 py-1.5 hover:bg-rose-50 rounded-xl transition">Cancelled</button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* BATCH ACTION BAR */}
      {selectedTripIds.length > 0 && (
        <div className="fixed bottom-20 left-4 right-4 z-50 animate-in slide-in-from-bottom-8">
          <div className="bg-slate-900 text-white p-4 rounded-[2rem] shadow-2xl flex items-center justify-between border border-white/10">
            <div className="flex items-center gap-3 ml-2">
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center font-black">{selectedTripIds.length}</div>
              <div>
                <p className="text-xs font-black uppercase tracking-widest">Trips Selected</p>
                <p className="text-[10px] text-slate-400 font-bold">Ready for batch start</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setSelectedTripIds([])} className="px-4 py-2 bg-slate-800 rounded-xl text-[11px] font-black uppercase">Cancel</button>
              <button onClick={handleStartBatch} className="px-6 py-2 bg-blue-600 rounded-xl text-[11px] font-black uppercase shadow-lg shadow-blue-500/20 active:scale-95 transition-all">Start Batch</button>
            </div>
          </div>
        </div>
      )}

      {/* TRIP EDIT MODAL */}
      {showEditModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setShowEditModal(null)} />
          <div className="bg-white w-full max-w-md rounded-[2.5rem] p-6 sm:p-8 shadow-2xl relative z-10 border border-slate-200">
            <h3 className="text-xl font-black text-slate-900 mb-6 flex items-center gap-2">
              <Edit2 className="text-blue-600" /> Update Trip Details
            </h3>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Patient Name</label>
                <input type="text" value={showEditModal.patient} onChange={(e) => setShowEditModal({...showEditModal, patient: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Trip Time</label>
                  <input type="text" value={showEditModal.time} onChange={(e) => setShowEditModal({...showEditModal, time: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm" placeholder="08:00 AM" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Type</label>
                  <input type="text" value={showEditModal.type} onChange={(e) => setShowEditModal({...showEditModal, type: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm" />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Pickup Address</label>
                <textarea value={showEditModal.pickup} onChange={(e) => setShowEditModal({...showEditModal, pickup: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs" rows="2" />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Dropoff Address</label>
                <textarea value={showEditModal.dropoff} onChange={(e) => setShowEditModal({...showEditModal, dropoff: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs" rows="2" />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Trip Notes</label>
                <textarea value={showEditModal.notes} onChange={(e) => setShowEditModal({...showEditModal, notes: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs italic" rows="2" placeholder="Add notes here..." />
              </div>
              <div className="flex gap-3 pt-4">
                <button onClick={() => setShowEditModal(null)} className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold active:scale-95 transition-all">Cancel</button>
                <button onClick={() => { onUpdateTrip(showEditModal.id, showEditModal.status, showEditModal); setShowEditModal(null); }} className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-bold active:scale-95 transition-all shadow-lg shadow-blue-500/30">Save Changes</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick History List (Current Day) */}
      {completedTrips.length > 0 && (
        <div className="px-2">
          <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-4 ml-4">Today&apos;s Completed Trips</h3>
          <div className="space-y-3">
            {completedTrips.map(t => (
              <div key={t.id} className="bg-white/50 border border-slate-200 p-4 rounded-2xl flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center"><Check size={16} /></div>
                  <div>
                    <p className="font-bold text-slate-800 text-sm">{t.patient}</p>
                    {t.bookingId ? <span className="text-blue-600 text-[10px] font-medium">Booking: {t.bookingId}</span> : null}
                    <p className="text-[10px] text-slate-500 font-mono">{to12hr(t.time)} &bull; {t.dropoffOdometer - t.pickupOdometer || 0} mi</p>
                  </div>
                </div>
                <div className="text-[10px] font-black text-slate-400 uppercase bg-slate-100 px-2 py-1 rounded-md">ID {t.id}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Password Confirmation Modal for No Show / Cancelled */}
      {confirmAction && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-md" onClick={() => { setConfirmAction(null); setConfirmPassword(''); setConfirmError(''); }} />
          <div className="bg-white/90 backdrop-blur-xl w-full max-w-sm rounded-[2rem] p-8 shadow-2xl relative z-10 border border-white/50">
            <div className="w-16 h-16 bg-gradient-to-tr from-rose-600 to-rose-400 text-white rounded-[1.5rem] flex items-center justify-center mx-auto mb-4 shadow-lg shadow-rose-500/30">
              <Lock size={32} />
            </div>
            <h3 className="text-xl font-black text-center text-slate-900 mb-2">Confirm {confirmAction.type === 'noshow' ? 'No Show' : 'Cancellation'}</h3>
            <p className="text-xs text-center text-slate-500 font-medium mb-2">Enter your password to authorize this action.</p>
            {confirmError && <p className="text-xs text-center text-rose-600 font-semibold mb-4">{confirmError}</p>}
            <form onSubmit={(e) => { e.preventDefault(); handleConfirmAction(); }}>
              <input type="password" required placeholder="Enter your password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="w-full p-4 bg-slate-100/50 border border-slate-200/50 rounded-[1rem] font-semibold focus:border-rose-500 focus:bg-white mb-4 outline-none" />
              <div className="flex gap-2">
                <button type="button" onClick={() => { setConfirmAction(null); setConfirmPassword(''); setConfirmError(''); }} className="flex-1 py-3.5 bg-slate-100 text-slate-600 rounded-[1rem] font-bold active:scale-95 transition-all">Cancel</button>
                <button type="submit" className={`flex-1 py-3.5 text-white rounded-[1rem] font-bold active:scale-95 transition-all shadow-md ${confirmAction.type === 'noshow' ? 'bg-amber-600 shadow-amber-500/20' : 'bg-rose-600 shadow-rose-500/20'}`}>Confirm</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default DriverPage;
