import React, { useState, useEffect, useCallback } from 'react';
import { User, Truck, Plus, Trash2, Edit2, AlertCircle, X, Save, ClipboardList, Upload, CheckSquare, Clock, Phone, MessageSquare, BrainCircuit, Loader2, ChevronDown } from 'lucide-react';
import { makeCall, sendSMS } from '../utils/nativeActions';
import AIInsightsBanner from './AIInsightsBanner';
import { aiAnalyzeDriver } from '../config/ai';
import { geocodeAddress } from '../config/maps';
import { POLICY_MODES } from '../utils/timeTracking';
import { getVehicleMaintenanceStatus, normalizeMaintenancePolicy, summarizeFleetMaintenance } from '../utils/fleetMaintenance';
import { localCalendarYmd } from '../utils/tripDate';
import { functions, httpsCallable } from '../config/firebase';

const DriversVehiclesPage = ({ role, drivers = [], setDrivers, upsertDriverProfile, assignVehicleToDriver, dispatchers = [], addAuditLog, currentUser, trips = [], onAssignTrip, onUploadForDriver, requestAuthAction, vehicles = [], setVehicles, mode = 'all', createIntent = null, onCreateIntentHandled, appSettings = {}, onUpdateAppSettings }) => {
  const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

  const findAssignedDriver = useCallback((v) => {
    if (!v) return null;
    const targetName = String(v.name || '').trim().toLowerCase();
    return drivers.find(d => 
      (d.id && (d.id === v.driverId || d.id === v.assignedDriver)) ||
      (d.vehicleId && d.vehicleId === v.id) ||
      (d.vehicle && String(d.vehicle).trim().toLowerCase() === targetName)
    );
  }, [drivers]);

  const [activeTab, setActiveTab] = useState(mode !== 'all' ? mode : 'drivers');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
const [form, setForm] = useState({ 
  name: '', email: '', phone: '', vehicle: '', status: 'Available',
  currentZone: '', vin: '', insuranceExpiry: '', capacity: '1',
  licenseNumber: '', cdlStatus: 'Active', assignedDispatcher: '', assignedTo: '',
  hourlyRate: '', homeAddress: '', address2: '', city: '', state: 'IN', zip: '',
  homeLat: '', homeLng: '', emergencyContactName: '', emergencyContactPhone: '',
  hireDate: '', employmentType: 'employee', timeTrackingPolicy: POLICY_MODES.PAY_FROM_HOME
});
  const [assignDriver, setAssignDriver] = useState(null);
  const [selectedTrips, setSelectedTrips] = useState([]);
  const [editScheduleDriver, setEditScheduleDriver] = useState(null);
  const [scheduleForm, setScheduleForm] = useState({ start: '09:00 AM', end: '10:00 AM', status: 'free' });
  const [editingScheduleIdx, setEditingScheduleIdx] = useState(null);
  const [vehicleForm, setVehicleForm] = useState(false);
  const [editVehicleId, setEditVehicleId] = useState(null);
  const maintenancePolicy = normalizeMaintenancePolicy(appSettings.maintenancePolicy);
  const [policyDraft, setPolicyDraft] = useState(maintenancePolicy);
  const [vForm, setVForm] = useState({ name: '', make: '', model: '', year: '', color: '', plate: '', vin: '', odometer: '', lastOilChangeOdometer: '', oilChangeIntervalMiles: String(maintenancePolicy.oilChangeIntervalMiles), oilDueSoonMiles: String(maintenancePolicy.oilDueSoonMiles), lastOilChangeDate: '', lastFilterChangeDate: '', filterChangeIntervalMonths: String(maintenancePolicy.filterChangeIntervalMonths), filterDueSoonDays: String(maintenancePolicy.filterDueSoonDays) });
  const [aiDriverInsights, setAiDriverInsights] = useState({});
  const [aiDriverLoading, setAiDriverLoading] = useState({});
  const [aiDriverModal, setAiDriverModal] = useState(null);
  const [showFleetSummary, setShowFleetSummary] = useState(false);
  const [fleetSummary, setFleetSummary] = useState(null);
  const [fleetSummaryLoading, setFleetSummaryLoading] = useState(false);
  const [assignmentError, setAssignmentError] = useState('');
  const [savingAssignment, setSavingAssignment] = useState('');

  const persistVehicleAssignment = useCallback(async (driverId, vehicleName) => {
    if (!driverId || savingAssignment) return false;
    setAssignmentError('');
    setSavingAssignment(driverId);
    try {
      if (assignVehicleToDriver) {
        await assignVehicleToDriver(driverId, vehicleName);
      } else if (upsertDriverProfile) {
        const occupant = drivers.find(item => item.id !== driverId && item.vehicle === vehicleName);
        if (occupant) await upsertDriverProfile(occupant.id, { vehicle: '', vehicleId: '' });
        const vehicle = vehicles.find(item => item.name === vehicleName);
        const saved = await upsertDriverProfile(driverId, {
          vehicle: vehicleName,
          vehicleId: vehicle?.id || '',
        });
        if (!saved) throw new Error('Firestore did not confirm the vehicle assignment.');
      } else {
        throw new Error('Vehicle persistence is unavailable.');
      }
      return true;
    } catch (error) {
      setAssignmentError(error.message || 'Vehicle assignment could not be saved.');
      return false;
    } finally {
      setSavingAssignment('');
    }
  }, [assignVehicleToDriver, drivers, savingAssignment, upsertDriverProfile, vehicles]);
  
  useEffect(() => setPolicyDraft(maintenancePolicy), [appSettings.maintenancePolicy]);

  const resetVForm = () => setVForm({ name: '', make: '', model: '', year: '', color: '', plate: '', vin: '', odometer: '', lastOilChangeOdometer: '', oilChangeIntervalMiles: String(maintenancePolicy.oilChangeIntervalMiles), oilDueSoonMiles: String(maintenancePolicy.oilDueSoonMiles), lastOilChangeDate: '', lastFilterChangeDate: '', filterChangeIntervalMonths: String(maintenancePolicy.filterChangeIntervalMonths), filterDueSoonDays: String(maintenancePolicy.filterDueSoonDays) });
  
  const openVAdd = () => { setEditVehicleId(null); resetVForm(); setVehicleForm(true); };
  
  const openVEdit = (v) => {
    setEditVehicleId(v.id);
    setVForm({ name: v.name, make: v.make || '', model: v.model || '', year: v.year || '', color: v.color || '', plate: v.plate || '', vin: v.vin || '', odometer: v.odometer || '', lastOilChangeOdometer: v.lastOilChangeOdometer ?? '', oilChangeIntervalMiles: v.oilChangeIntervalMiles || String(maintenancePolicy.oilChangeIntervalMiles), oilDueSoonMiles: v.oilDueSoonMiles || String(maintenancePolicy.oilDueSoonMiles), lastOilChangeDate: v.lastOilChangeDate || '', lastFilterChangeDate: v.lastFilterChangeDate || '', filterChangeIntervalMonths: v.filterChangeIntervalMonths || String(maintenancePolicy.filterChangeIntervalMonths), filterDueSoonDays: v.filterDueSoonDays || String(maintenancePolicy.filterDueSoonDays) });
    setVehicleForm(true);
  };

  useEffect(() => {
    if (!createIntent?.nonce) return;
    setActiveTab('vehicles');
    openVAdd();
    onCreateIntentHandled?.();
  }, [createIntent?.nonce]);
  
  const saveVehicle = async () => {
    if (!vForm.name.trim()) return;
    setAssignmentError('');
    try {
      const normalizedName = vForm.name.trim().toLowerCase();
      const duplicate = vehicles.find(vehicle => vehicle.id !== editVehicleId
        && String(vehicle.name || '').trim().toLowerCase() === normalizedName);
      if (duplicate) throw new Error(`Vehicle name “${vForm.name.trim()}” is already in use.`);
      const previouslyAssignedDriver = editVehicleId
        ? drivers.find(driver => driver.vehicleId === editVehicleId
          || String(driver.vehicle || '').trim().toLowerCase() === String(vehicles.find(vehicle => vehicle.id === editVehicleId)?.name || '').trim().toLowerCase())
        : null;
      const saved = editVehicleId
        ? await setVehicles(prev => prev.map(v => v.id === editVehicleId ? { ...v, ...vForm, updatedAt: new Date().toISOString() } : v))
        : await setVehicles(prev => [...prev, { ...vForm, id: `VHC-${Date.now()}`, status: 'Available', createdAt: new Date().toISOString(), inServiceOdometer: Number(vForm.odometer || 0) }]);
      if (saved === false) throw new Error('Firestore did not confirm the vehicle save.');
      if (editVehicleId && previouslyAssignedDriver && assignVehicleToDriver) {
        await assignVehicleToDriver(previouslyAssignedDriver.id, vForm.name.trim());
      }
      addAuditLog(
        editVehicleId ? 'Vehicle Updated' : 'Vehicle Added',
        `${currentUser} ${editVehicleId ? 'updated' : 'added'} vehicle ${vForm.name}.`,
        editVehicleId ? 'blue' : 'emerald',
      );
      setVehicleForm(false);
      resetVForm();
    } catch (error) {
      setAssignmentError(error.message || 'Vehicle could not be saved.');
    }
  };
  
  const deleteVehicle = async (v) => {
    if (!window.confirm(`Delete vehicle ${v.name}?`)) return;
    setAssignmentError('');
    try {
      const assignedDrivers = drivers.filter((driver) =>
        driver.vehicle === v.name || driver.vehicleId === v.id);
      for (const driver of assignedDrivers) {
        if (assignVehicleToDriver) {
          await assignVehicleToDriver(driver.id, '');
        } else if (upsertDriverProfile) {
          const savedDriver = await upsertDriverProfile(driver.id, { vehicle: '', vehicleId: '' });
          if (!savedDriver) throw new Error(`Could not clear ${driver.name}'s vehicle assignment.`);
        }
      }
      const saved = await setVehicles(prev => prev.filter(x => x.id !== v.id));
      if (saved === false) throw new Error('Firestore did not confirm the vehicle deletion.');
      addAuditLog('Vehicle Deleted', `${currentUser} deleted vehicle ${v.name}.`, 'rose');
    } catch (error) {
      setAssignmentError(error.message || 'Vehicle could not be deleted.');
    }
  };

  
  // Filter drivers for dispatcher role — only show drivers assigned to this dispatcher
  const filteredDrivers = role === 'dispatcher'
    ? drivers.filter(d => {
        const disp = dispatchers.find(ds => ds.email === currentUser);
        return disp && d.assignedDispatcher === disp.id;
      })
    : drivers;

  const visibleVehicles = role === 'dispatcher'
    ? vehicles.filter((vehicle) => filteredDrivers.some((driver) => driver.vehicleId === vehicle.id || String(driver.vehicle || '').trim().toLowerCase() === String(vehicle.name || '').trim().toLowerCase()))
    : vehicles;
  const maintenanceSummary = summarizeFleetMaintenance(visibleVehicles, trips, drivers, maintenancePolicy);

  const saveFleetPolicy = async (applyToVehicles = false) => {
    const normalized = normalizeMaintenancePolicy(policyDraft);
    const execute = async () => {
      if (onUpdateAppSettings) await onUpdateAppSettings({ maintenancePolicy: normalized });
      if (applyToVehicles) {
        const saved = await setVehicles((items) => items.map((vehicle) => ({
          ...vehicle,
          oilChangeIntervalMiles: normalized.oilChangeIntervalMiles,
          oilDueSoonMiles: normalized.oilDueSoonMiles,
          filterChangeIntervalMonths: normalized.filterChangeIntervalMonths,
          filterDueSoonDays: normalized.filterDueSoonDays,
          updatedAt: new Date().toISOString(),
        })));
        if (saved === false) throw new Error('Firestore did not confirm the fleet policy update.');
      }
      addAuditLog?.('Maintenance Policy Updated', `${currentUser} updated fleet maintenance defaults${applyToVehicles ? ' and applied them to all vehicles' : ''}.`, 'indigo', { entity: 'fleetMaintenance' });
      setPolicyDraft(normalized);
    };
    if (applyToVehicles && requestAuthAction) return requestAuthAction('Apply maintenance defaults to every vehicle', execute);
    return execute();
  };

  const recordMaintenanceService = (vehicle, type) => {
    const service = getVehicleMaintenanceStatus(vehicle, trips, drivers, maintenancePolicy);
    const label = type === 'oil' ? 'oil change' : 'annual filter change';
    const execute = async () => {
      const timestamp = new Date().toISOString();
      const serviceDateKey = localCalendarYmd();
      const record = { id: `MNT-${Date.now()}`, type, servicedAt: timestamp, odometer: service.odometer, recordedAt: timestamp, recordedBy: currentUser };
      const saved = await setVehicles((items) => items.map((item) => item.id === vehicle.id ? {
        ...item,
        odometer: Math.max(Number(item.odometer || 0), service.odometer),
        ...(type === 'oil' ? { lastOilChangeOdometer: service.odometer, lastOilChangeDate: serviceDateKey, nextOilChangeOdometer: null } : { lastFilterChangeDate: serviceDateKey }),
        maintenanceHistory: [record, ...(item.maintenanceHistory || [])].slice(0, 100),
        updatedAt: timestamp,
      } : item));
      if (saved === false) throw new Error('Firestore did not confirm the maintenance record.');
      addAuditLog?.('Vehicle Service Recorded', `${currentUser} recorded ${label} for ${vehicle.name} at ${service.odometer.toLocaleString()} miles.`, 'emerald', { entity: 'vehicle', id: vehicle.id, maintenanceType: type, odometer: service.odometer });
    };
    if (requestAuthAction) return requestAuthAction(`Record ${label} for ${vehicle.name}`, execute);
    return execute();
  };

  const analyzeDriver = useCallback(async (driver) => {
    if (aiDriverLoading[driver.id]) return;
    setAiDriverLoading(prev => ({ ...prev, [driver.id]: true }));
    const driverTrips = trips.filter(t => t.driverId === driver.id || t.driverName === driver.name);
    const result = await aiAnalyzeDriver(driver, driverTrips);
    setAiDriverInsights(prev => ({ ...prev, [driver.id]: result }));
    setAiDriverLoading(prev => ({ ...prev, [driver.id]: false }));
    setAiDriverModal(driver.id);
  }, [trips, aiDriverLoading]);

  const runFleetSummary = useCallback(async () => {
    setFleetSummaryLoading(true);
    const results = await Promise.all(
      filteredDrivers.slice(0, 10).map(async (d) => {
        const driverTrips = trips.filter(t => t.driverId === d.id || t.driverName === d.name);
        return aiAnalyzeDriver(d, driverTrips);
      })
    );
    const valid = results.filter(Boolean);
    if (valid.length > 0) {
      const avgScore = Math.round(valid.reduce((s, r) => s + (r.performanceScore || 0), 0) / valid.length);
      setFleetSummary({
        summary: `Fleet performance analysis across ${valid.length} drivers. Average performance score: ${avgScore}/100.`,
        trends: [...new Set(valid.map(r => r.strengths).flat())].slice(0, 5),
        recommendations: [...new Set(valid.map(r => r.areasForImprovement).flat())].slice(0, 5),
      });
    } else {
      setFleetSummary({ summary: 'Unable to analyze fleet at this time.', trends: [], recommendations: [] });
    }
    setFleetSummaryLoading(false);
  }, [filteredDrivers, trips]);

  const resetForm = () => setForm({ name: '', email: '', phone: '', vehicle: '', status: 'Available', currentZone: '', assignedDispatcher: '', assignedTo: '', vin: '', insuranceExpiry: '', capacity: '1', licenseNumber: '', cdlStatus: 'Active', hourlyRate: '', homeAddress: '', address2: '', city: '', state: 'IN', zip: '', homeLat: '', homeLng: '', emergencyContactName: '', emergencyContactPhone: '', hireDate: '', employmentType: 'employee', timeTrackingPolicy: POLICY_MODES.PAY_FROM_HOME });

  const openAdd = () => { setEditing(null); resetForm(); setShowForm(true); };

  const openEdit = (d) => {
    setEditing(d.id);
    setForm({ 
      name: d.name, email: d.email || '', phone: d.phone || '', 
      vehicle: d.vehicle || '', status: d.status, 
      currentZone: d.currentZone || '',
      vin: d.vin || '', insuranceExpiry: d.insuranceExpiry || '',
      capacity: d.capacity || '1', licenseNumber: d.licenseNumber || '',
      cdlStatus: d.cdlStatus || 'Active', assignedDispatcher: d.assignedDispatcher || '',
      assignedTo: d.assignedTo || '', hourlyRate: d.hourlyRate || '',
      homeAddress: d.homeAddress || d.address || '', address2: d.address2 || '', city: d.city || '', state: d.state || 'IN', zip: d.zip || '',
      homeLat: d.homeLat ?? '', homeLng: d.homeLng ?? '', emergencyContactName: d.emergencyContactName || '', emergencyContactPhone: d.emergencyContactPhone || '',
      hireDate: d.hireDate || '', employmentType: d.employmentType || 'employee', timeTrackingPolicy: d.timeTrackingPolicy || POLICY_MODES.PAY_FROM_HOME
    });
    setShowForm(true);
  };

  const saveDriver = async () => {
    if (!form.name.trim()) return;
    setAssignmentError('');
    try {
      const selectedVehicle = form.vehicle || '';
      const profileFields = { ...form };
      delete profileFields.vehicle;
      profileFields.timeTrackingPolicy = profileFields.timeTrackingPolicy || POLICY_MODES.PAY_FROM_HOME;
      const fullHomeAddress = [form.homeAddress, form.address2, form.city, form.state, form.zip].filter(Boolean).join(', ');
      if (profileFields.timeTrackingPolicy === POLICY_MODES.PAY_FROM_HOME && !form.homeAddress.trim()) {
        throw new Error('A home street address is required for home-to-home timekeeping.');
      }
      if (fullHomeAddress && (!Number.isFinite(Number(form.homeLat)) || !Number.isFinite(Number(form.homeLng)))) {
        const coordinates = await geocodeAddress(fullHomeAddress);
        if (!coordinates) throw new Error('Home address could not be located. Check the street, city, state, and ZIP code.');
        profileFields.homeLat = coordinates.lat;
        profileFields.homeLng = coordinates.lng;
      } else {
        profileFields.homeLat = form.homeLat === '' ? null : Number(form.homeLat);
        profileFields.homeLng = form.homeLng === '' ? null : Number(form.homeLng);
      }
      if (editing) {
        const saved = upsertDriverProfile
          ? await upsertDriverProfile(editing, profileFields)
          : await setDrivers(prev => prev.map(d => d.id === editing ? { ...d, ...profileFields } : d));
        if (saved === false) throw new Error('Firestore did not confirm the driver update.');
        const currentVehicle = drivers.find((driver) => driver.id === editing)?.vehicle || '';
        if (selectedVehicle !== currentVehicle) {
          if (!assignVehicleToDriver) throw new Error('Vehicle assignment persistence is unavailable.');
          await assignVehicleToDriver(editing, selectedVehicle);
        }
        addAuditLog('Driver Updated', `${currentUser} updated driver ${form.name}.`, 'blue');
      } else {
        const id = `DRV-${Date.now()}`;
        const currentDispatcher = role === 'dispatcher'
          ? dispatchers.find((dispatcher) => normalizeEmail(dispatcher.email) === normalizeEmail(currentUser))
          : null;
        const saved = await setDrivers(prev => [...prev, {
          id, name: form.name, status: form.status, vehicle: '', vehicleId: '', dist: '--',
          currentZone: form.currentZone, odometer: 0, nextOilChange: 5000,
          assignedTo: currentDispatcher?.id || form.assignedTo || '', schedule: [],
          email: form.email, phone: form.phone,
          vin: form.vin || '', insuranceExpiry: form.insuranceExpiry || '',
          capacity: form.capacity || '1', licenseNumber: form.licenseNumber || '',
          cdlStatus: form.cdlStatus || 'Active', assignedDispatcher: currentDispatcher?.id || form.assignedDispatcher || '',
          hourlyRate: form.hourlyRate || '', homeAddress: profileFields.homeAddress, address2: profileFields.address2,
          city: profileFields.city, state: profileFields.state, zip: profileFields.zip, homeLat: profileFields.homeLat, homeLng: profileFields.homeLng,
          emergencyContactName: profileFields.emergencyContactName, emergencyContactPhone: profileFields.emergencyContactPhone,
          hireDate: profileFields.hireDate, employmentType: profileFields.employmentType, timeTrackingPolicy: profileFields.timeTrackingPolicy,
        }]);
        if (saved === false) throw new Error('Firestore did not confirm the new driver.');
        if (selectedVehicle) {
          if (!assignVehicleToDriver) throw new Error('Vehicle assignment persistence is unavailable.');
          await assignVehicleToDriver(id, selectedVehicle);
        }
        addAuditLog('Driver Added', `${currentUser} added driver ${form.name}.`, 'emerald');
      }
      setShowForm(false);
      resetForm();
    } catch (error) {
      setAssignmentError(error.message || 'Driver could not be saved.');
    }
  };

  const deleteDriver = (driver) => {
    const doDelete = async () => {
      setAssignmentError('');
      try {
        if (!driver.uid) {
          throw new Error('This legacy driver has no linked Auth UID. Permanently remove the account from People & Access so Auth and every profile are deleted together.');
        }
        if (driver.vehicle && assignVehicleToDriver) {
          await assignVehicleToDriver(driver.id, '');
        }
        const deleteUserFn = httpsCallable(functions, 'deleteUser');
        const result = await deleteUserFn({ uid: driver.uid });
        if (!result?.data?.success) throw new Error('The server did not confirm permanent account deletion.');
        addAuditLog('Driver Deleted', `${currentUser} deleted driver ${driver.name}.`, 'rose');
      } catch (error) {
        setAssignmentError(error.message || 'Driver could not be deleted.');
      }
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
  const tripBelongsToDriver = (trip, driver) => {
    if (!trip || !driver) return false;
    if (trip.driverId && driver.id && trip.driverId === driver.id) return true;
    return !!normalizeEmail(trip.driverEmail) && normalizeEmail(trip.driverEmail) === normalizeEmail(driver.email);
  };
  const assignedTripsForDriver = assignDriver
    ? trips.filter(trip => tripBelongsToDriver(trip, assignDriver))
    : [];

  const openScheduleEditor = (driver) => {
    setEditScheduleDriver(driver);
    setScheduleForm({ start: '09:00 AM', end: '10:00 AM', status: 'free' });
    setEditingScheduleIdx(null);
  };

  const saveScheduleBlock = async () => {
    if (!editScheduleDriver || !scheduleForm.start || !scheduleForm.end) return;
    setAssignmentError('');
    const schedule = [...(editScheduleDriver.schedule || [])];
    if (editingScheduleIdx !== null) {
      schedule[editingScheduleIdx] = { start: scheduleForm.start, end: scheduleForm.end, status: scheduleForm.status };
    } else {
      schedule.push({ start: scheduleForm.start, end: scheduleForm.end, status: scheduleForm.status });
    }
    try {
      const saved = upsertDriverProfile
        ? await upsertDriverProfile(editScheduleDriver.id, { schedule })
        : await setDrivers(prev => prev.map(d => d.id === editScheduleDriver.id ? { ...d, schedule } : d));
      if (saved === false) throw new Error('Firestore did not confirm the schedule update.');
      setEditScheduleDriver(prev => ({ ...prev, schedule }));
      setScheduleForm({ start: '09:00 AM', end: '10:00 AM', status: 'free' });
      setEditingScheduleIdx(null);
    } catch (error) {
      setAssignmentError(error.message || 'Schedule could not be saved.');
    }
  };

  const editScheduleBlock = (idx) => {
    const block = editScheduleDriver.schedule[idx];
    if (block) {
      setScheduleForm({ start: block.start, end: block.end, status: block.status });
      setEditingScheduleIdx(idx);
    }
  };

  const deleteScheduleBlock = async (idx) => {
    if (!editScheduleDriver) return;
    setAssignmentError('');
    const schedule = (editScheduleDriver.schedule || []).filter((_, i) => i !== idx);
    try {
      const saved = upsertDriverProfile
        ? await upsertDriverProfile(editScheduleDriver.id, { schedule })
        : await setDrivers(prev => prev.map(d => d.id === editScheduleDriver.id ? { ...d, schedule } : d));
      if (saved === false) throw new Error('Firestore did not confirm the schedule deletion.');
      setEditScheduleDriver(prev => ({ ...prev, schedule }));
      if (editingScheduleIdx === idx) {
        setScheduleForm({ start: '09:00 AM', end: '10:00 AM', status: 'free' });
        setEditingScheduleIdx(null);
      }
    } catch (error) {
      setAssignmentError(error.message || 'Schedule block could not be deleted.');
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

  const resolvedTab = mode !== 'all' ? mode : activeTab;

  return (
    <div aria-label="Drivers and vehicles workspace" className={`flex-1 min-h-0 overflow-y-auto overscroll-contain ${mode === 'all' ? 'space-y-5' : ''}`}>
      {assignmentError && (
        <div role="alert" className="mx-3 mt-3 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
          <AlertCircle size={14} /> {assignmentError}
        </div>
      )}
      {mode === 'all' && (
        <div className="flex gap-2 flex-wrap sticky top-0 z-10 bg-slate-100 py-1">
          {[
            { id: 'drivers', label: 'Drivers', icon: User },
            { id: 'vehicles', label: 'Vehicles', icon: Truck }
          ].map(tab => {
            const Icon = tab.icon;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 rounded-xl border font-bold flex items-center gap-2 transition-all text-xs ${
                  activeTab === tab.id ? 'bg-slate-900 hover:bg-slate-800 text-white border-slate-900 shadow-sm' : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                }`}>
                <Icon size={16} /> {tab.label}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-0 sticky top-[52px] z-10 bg-slate-100 py-2">
        {(role === 'admin' || role === 'dispatcher') && (
          <button onClick={resolvedTab === 'drivers' ? openAdd : openVAdd} className="w-full sm:w-auto px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold transition-colors flex items-center justify-center gap-2 text-xs">
            <Plus size={18} /> Add {resolvedTab === 'drivers' ? 'Driver' : 'Vehicle'}
          </button>
        )}
      </div>

      {/* AI Fleet Summary */}
      <div className="bg-white border border-slate-100/50 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-200">
        <button onClick={() => setShowFleetSummary(!showFleetSummary)} className="w-full px-5 py-3 flex items-center justify-between text-xs font-bold text-slate-700 hover:bg-slate-50 transition">
          <span className="flex items-center gap-2"><BrainCircuit size={16} className="text-indigo-600" /> AI Fleet Summary</span>
          <ChevronDown size={16} className={`transition-transform ${showFleetSummary ? 'rotate-180' : ''}`} />
        </button>
        {showFleetSummary && (
          <div className="px-5 pb-4">
            {fleetSummaryLoading ? (
              <div className="flex items-center gap-2 text-slate-500 text-xs"><Loader2 size={14} className="animate-spin" /> AI analyzing fleet performance...</div>
            ) : fleetSummary ? (
              <AIInsightsBanner insights={fleetSummary} onClose={() => setFleetSummary(null)} />
            ) : (
              <button onClick={runFleetSummary} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition flex items-center gap-2">
                <BrainCircuit size={14} /> Run Fleet Analysis
              </button>
            )}
          </div>
        )}
      </div>

      {resolvedTab === 'drivers' && (
        <div className="bg-white border border-slate-100/50 rounded-xl overflow-hidden shadow-sm">
          <div className="space-y-3 p-3 sm:hidden">
            {filteredDrivers.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500">
                {role === 'dispatcher' ? 'No drivers assigned to you yet.' : 'No drivers yet. Click "Add Driver" to create one.'}
              </div>
            ) : (
              filteredDrivers.map((d) => {
                const assignedCount = trips.filter(t => tripBelongsToDriver(t, d)).length;
                return (
                  <div key={d.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-base font-semibold text-slate-900">{d.name}</h3>
                        <p className="mt-0.5 text-xs font-medium text-slate-500">{d.currentZone || 'No zone'} - {d.vehicle || 'No vehicle'}</p>
                      </div>
                       <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold bg-emerald-100 text-emerald-700`}>Active</span>
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-2">
                      <select value={d.vehicle || ''} onChange={async (e) => {
                        const newV = e.target.value;
                        if (await persistVehicleAssignment(d.id, newV)) {
                          addAuditLog('Vehicle Assigned', `${currentUser} assigned ${newV || 'no vehicle'} to ${d.name}.`, 'indigo');
                        }
                      }} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20">
                        <option value="">No vehicle</option>
                        {vehicles.filter(v => !drivers.find(x => x.vehicle === v.name && x.id !== d.id) || v.name === d.vehicle).map(v => (
                          <option key={v.id} value={v.name}>{v.name} {v.plate ? `(${v.plate})` : ''}</option>
                        ))}
                      </select>
                      <select value={d.assignedDispatcher || d.assignedTo || ''} onChange={async (e) => {
                        const newDisp = e.target.value;
                        const saved = upsertDriverProfile
                          ? await upsertDriverProfile(d.id, { assignedDispatcher: newDisp, assignedTo: newDisp })
                          : await setDrivers(prev => prev.map(x => x.id === d.id ? { ...x, assignedDispatcher: newDisp, assignedTo: newDisp } : x));
                        if (saved === false) {
                          setAssignmentError('Dispatcher assignment could not be saved.');
                        } else {
                          addAuditLog('Driver Reassigned', `${currentUser} assigned driver ${d.name} to dispatcher ${dispatchers.find(ds => ds.id === newDisp)?.name || 'None'}.`, 'blue');
                        }
                      }} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20">
                        <option value="">Unassigned dispatcher</option>
                        {dispatchers.map(ds => (
                          <option key={ds.id} value={ds.id}>{ds.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button onClick={() => setAssignDriver(d)} className="rounded-lg bg-blue-100 px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-200">
                        Trips {assignedCount > 0 ? `(${assignedCount})` : ''}
                      </button>
                      {onUploadForDriver && (
                        <button onClick={() => onUploadForDriver(d.id)} className="rounded-lg bg-indigo-100 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-200">Upload</button>
                      )}
                      {d.phone && (
                        <>
                          <button onClick={() => makeCall(d.phone, d.name)} className="rounded-lg bg-emerald-50 p-2 text-emerald-600 hover:bg-emerald-100" aria-label="Call driver"><Phone size={14} /></button>
                          <button onClick={() => sendSMS(d.phone, d.name)} className="rounded-lg bg-blue-50 p-2 text-blue-600 hover:bg-blue-100" aria-label="Send SMS"><MessageSquare size={14} /></button>
                        </>
                      )}
                      <button onClick={() => analyzeDriver(d)} className="rounded-lg p-2 text-indigo-600 hover:bg-indigo-50" title="AI Analyze" aria-label="AI Analyze"><BrainCircuit size={14} /></button>
                      <button onClick={() => openScheduleEditor(d)} className="rounded-lg p-2 text-indigo-600 hover:bg-indigo-50" title="Edit Schedule" aria-label="Edit Schedule"><Clock size={14} /></button>
                      <button onClick={() => openEdit(d)} className="rounded-lg p-2 text-blue-600 hover:bg-blue-50" aria-label="Edit driver"><Edit2 size={14} /></button>
                      {(role === 'admin' || role === 'dispatcher') && (
                        <button onClick={() => deleteDriver(d)} className="rounded-lg p-2 text-red-600 hover:bg-red-50" aria-label="Delete driver"><Trash2 size={14} /></button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full">
              <thead className="bg-slate-50/80 border-b border-slate-100">
                <tr>
                  <th className="px-3 sm:px-6 py-1.5 text-left text-xs sm:text-xs font-semibold text-slate-600">Name</th>
                  <th className="px-3 sm:px-6 py-1.5 text-left text-xs sm:text-xs font-semibold text-slate-600 hidden sm:table-cell">Vehicle</th>
                  <th className="px-3 sm:px-6 py-1.5 text-left text-xs sm:text-xs font-semibold text-slate-600 hidden md:table-cell">Zone</th>
                  <th className="px-3 sm:px-6 py-1.5 text-left text-xs sm:text-xs font-semibold text-slate-600 hidden lg:table-cell">Dispatcher</th>
                  <th className="px-3 sm:px-6 py-1.5 text-left text-xs sm:text-xs font-semibold text-slate-600">Status</th>
                  <th className="px-3 sm:px-6 py-1.5 text-left text-xs sm:text-xs font-semibold text-slate-600">Assign</th>
                  <th className="px-3 sm:px-6 py-1.5 text-left text-xs sm:text-xs font-semibold text-slate-600">Contact</th>
                  <th className="px-3 sm:px-6 py-1.5 text-left text-xs sm:text-xs font-semibold text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredDrivers.length === 0 ? (
                  <tr><td colSpan="8" className="px-3 sm:px-6 py-8 sm:py-12 text-center text-slate-500 text-xs">{role === 'dispatcher' ? 'No drivers assigned to you yet.' : 'No drivers yet. Click "Add Driver" to create one.'}</td></tr>
                ) : (
                  filteredDrivers.map((d) => {
                    const assignedCount = trips.filter(t => tripBelongsToDriver(t, d)).length;
                    return (
                      <tr key={d.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-3 sm:px-6 py-1.5 text-xs sm:text-xs font-semibold text-slate-900">{d.name}</td>
                        <td className="px-3 sm:px-6 py-1.5 text-xs sm:text-xs text-slate-600 hidden sm:table-cell">
                           <select value={d.vehicle || ''} onChange={async (e) => {
                            const newV = e.target.value;
                            if (await persistVehicleAssignment(d.id, newV)) {
                              addAuditLog('Vehicle Assigned', `${currentUser} assigned ${newV || 'no vehicle'} to ${d.name}.`, 'indigo');
                            }
                          }} className="px-2 py-1 border border-slate-200 rounded-xl text-xs font-semibold bg-white w-full max-w-[140px] focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none">
                            <option value="">- None -</option>
                            {vehicles.filter(v => !drivers.find(x => x.vehicle === v.name && x.id !== d.id) || v.name === d.vehicle).map(v => (
                              <option key={v.id} value={v.name}>{v.name} {v.plate ? `(${v.plate})` : ''}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 sm:px-6 py-1.5 text-xs sm:text-xs text-slate-600 hidden md:table-cell">{d.currentZone || '-'}</td>
                        <td className="px-3 sm:px-6 py-1.5 text-xs sm:text-xs text-slate-600 hidden lg:table-cell">
                          <select value={d.assignedDispatcher || d.assignedTo || ''} onChange={async (e) => {
                            const newDisp = e.target.value;
                            const saved = upsertDriverProfile
                              ? await upsertDriverProfile(d.id, { assignedDispatcher: newDisp, assignedTo: newDisp })
                              : await setDrivers(prev => prev.map(x => x.id === d.id ? { ...x, assignedDispatcher: newDisp, assignedTo: newDisp } : x));
                            if (saved === false) {
                              setAssignmentError('Dispatcher assignment could not be saved.');
                            } else {
                              addAuditLog('Driver Reassigned', `${currentUser} assigned driver ${d.name} to dispatcher ${dispatchers.find(ds => ds.id === newDisp)?.name || 'None'}.`, 'blue');
                            }
                          }} className="px-2 py-1 border border-slate-200 rounded-xl text-xs font-semibold bg-white w-full max-w-[140px] focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none">
                            <option value="">- Unassigned -</option>
                            {dispatchers.map(ds => (
                              <option key={ds.id} value={ds.id}>{ds.name}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 sm:px-6 py-1.5">
                           <span className={`px-2 py-0.5 rounded-md text-xs font-semibold bg-emerald-100 text-emerald-700`}>Active</span>
                          {assignedCount > 0 && <span className="ml-1 text-xs text-blue-600 font-semibold">({assignedCount})</span>}
                        </td>
                        <td className="px-3 sm:px-6 py-1.5">
                          <div className="flex gap-1">
                            <button onClick={() => setAssignDriver(d)} className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-md text-xs font-bold hover:bg-blue-200 flex items-center gap-1" title="Assign trips">
                              <ClipboardList size={12} /> Trips
                            </button>
                            {onUploadForDriver && (
                              <button onClick={() => onUploadForDriver(d.id)} className="px-2 py-1 bg-indigo-100 text-indigo-700 rounded-lg text-xs font-semibold hover:bg-indigo-200 flex items-center gap-1" title="Upload & assign">
                                <Upload size={12} /> Upload
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-3 sm:px-6 py-1.5">
                           {d.phone ? (
                            <div className="flex gap-2">
                              <button onClick={() => makeCall(d.phone, d.name)} className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 transition" aria-label="Call driver"><Phone size={14} /></button>
                              <button onClick={() => sendSMS(d.phone, d.name)} className="p-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition" aria-label="Send SMS"><MessageSquare size={14} /></button>
                            </div>
                          ) : <span className="text-xs text-slate-400 italic">No Phone</span>}
                        </td>
                        <td className="px-3 sm:px-6 py-1.5 flex gap-1 sm:gap-2">
                          <button onClick={() => analyzeDriver(d)} className="p-1.5 sm:p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition" title="AI Analyze" aria-label="AI Analyze"><BrainCircuit size={14} /></button>
                          <button onClick={() => openScheduleEditor(d)} className="p-1.5 sm:p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition" title="Edit Schedule" aria-label="Edit Schedule"><Clock size={14} /></button>
                          <button onClick={() => openEdit(d)} className="p-1.5 sm:p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition" aria-label="Edit driver"><Edit2 size={14} /></button>
                          {(role === 'admin' || role === 'dispatcher') && (
                            <button onClick={() => deleteDriver(d)} className="p-1.5 sm:p-2 text-red-600 hover:bg-red-50 rounded-lg transition" aria-label="Delete driver"><Trash2 size={14} /></button>
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

      {resolvedTab === 'vehicles' && (
        <div className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-blue-600">Fleet maintenance policy</p>
                <h3 className="mt-1 text-base font-bold text-slate-900">Mileage and annual service controls</h3>
                <p className="mt-1 text-xs text-slate-500">Completed-trip odometers update automatically. Service resets require password confirmation and create an audit record.</p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs font-bold">
                <span className="rounded-lg bg-rose-50 px-3 py-2 text-rose-700">{maintenanceSummary.overdue + maintenanceSummary.due} due</span>
                <span className="rounded-lg bg-amber-50 px-3 py-2 text-amber-700">{maintenanceSummary.dueSoon} soon</span>
                <span className="rounded-lg bg-blue-50 px-3 py-2 text-blue-700">{maintenanceSummary.setupRequired} setup</span>
                <span className="rounded-lg bg-emerald-50 px-3 py-2 text-emerald-700">{maintenanceSummary.healthy} current</span>
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ['oilChangeIntervalMiles', 'Oil interval (miles)'],
                ['oilDueSoonMiles', 'Oil warning (miles)'],
                ['filterChangeIntervalMonths', 'Filter interval (months)'],
                ['filterDueSoonDays', 'Filter warning (days)'],
              ].map(([field, label]) => (
                <label key={field} className="text-xs font-semibold text-slate-600">{label}
                  <input type="number" min="1" value={policyDraft[field]} onChange={(event) => setPolicyDraft((current) => ({ ...current, [field]: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
                </label>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => saveFleetPolicy(false)} className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700">Save fleet defaults</button>
              <button onClick={() => saveFleetPolicy(true)} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">Apply defaults to every vehicle</button>
            </div>
          </section>
          <div className="bg-white border border-slate-100/50 rounded-xl overflow-hidden shadow-sm">
          <div className="space-y-3 p-3 sm:hidden">
            {visibleVehicles.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500">No vehicles yet. Click "Add Vehicle" to create one.</div>
            ) : (
              visibleVehicles.map((v) => {
                const assignedDriver = findAssignedDriver(v);
                const service = getVehicleMaintenanceStatus(v, trips, drivers, maintenancePolicy);
                return (
                  <div key={v.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-base font-semibold text-slate-900">{v.name}</h3>
                        <p className="mt-0.5 text-xs text-slate-500">{v.make} {v.model} {v.year ? `(${v.year})` : ''}</p>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${assignedDriver ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                        {assignedDriver ? assignedDriver.name : 'Unassigned'}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-xl bg-slate-50 p-3">
                        <p className="font-semibold uppercase tracking-wide text-slate-400">VIN</p>
                        <p className="mt-1 font-mono font-semibold text-slate-700">{v.vin ? v.vin.slice(-6) : '-'}</p>
                      </div>
                      <div className="rounded-xl bg-slate-50 p-3">
                        <p className="font-semibold uppercase tracking-wide text-slate-400">Odometer</p>
                        <p className="mt-1 font-semibold text-slate-700">{service.odometer.toLocaleString()} mi</p>
                      </div>
                    </div>
                    <div className={`mt-3 rounded-xl border px-3 py-2 text-xs font-semibold ${['overdue', 'due'].includes(service.oil.status) ? 'border-rose-200 bg-rose-50 text-rose-700' : service.oil.status === 'due_soon' ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
                      Oil: {service.oil.status.replace('_', ' ')} · {service.oil.milesRemaining.toLocaleString()} mi · due {service.oil.nextServiceOdometer.toLocaleString()} mi
                    </div>
                    <div className={`mt-2 rounded-xl border px-3 py-2 text-xs font-semibold ${['overdue', 'due'].includes(service.filter.status) ? 'border-rose-200 bg-rose-50 text-rose-700' : ['due_soon', 'setup_required'].includes(service.filter.status) ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
                      Filter: {service.filter.status === 'setup_required' ? 'service baseline required' : `${service.filter.status.replace('_', ' ')} · due ${service.filter.nextServiceDate}`}
                    </div>
                    <select value={assignedDriver?.id || ''} onChange={async (e) => {
                      const driverId = e.target.value;
                      const oldDriverId = assignedDriver?.id;
                      if (driverId === oldDriverId) return;
                      const targetDriverId = driverId || oldDriverId;
                      if (targetDriverId && await persistVehicleAssignment(targetDriverId, driverId ? v.name : '')) {
                        addAuditLog('Driver Assigned', `${currentUser} assigned ${drivers.find(d => d.id === driverId)?.name || 'no driver'} to vehicle ${v.name}.`, 'indigo');
                      }
                    }} className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20">
                      <option value="">Unassigned driver</option>
                      {drivers.map(d => (
                        <option key={d.id} value={d.id}>{d.name} {d.vehicle && d.vehicle !== v.name ? `(${d.vehicle})` : ''}</option>
                      ))}
                    </select>
                    <div className="mt-3 flex gap-2">
                      <button onClick={() => recordMaintenanceService(v, 'oil')} className="rounded-lg bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100">Reset oil cycle</button>
                      <button onClick={() => recordMaintenanceService(v, 'filter')} className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100">Reset filter cycle</button>
                      <button onClick={() => openVEdit(v)} className="rounded-lg p-2 text-blue-600 hover:bg-blue-50" title="Edit" aria-label="Edit"><Edit2 size={14} /></button>
                      {(role === 'admin' || role === 'dispatcher') && (
                        <button onClick={() => deleteVehicle(v)} className="rounded-lg p-2 text-red-600 hover:bg-red-50" title="Delete" aria-label="Delete"><Trash2 size={14} /></button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full">
              <thead className="bg-slate-50/80 border-b border-slate-100">
                <tr>
                  <th className="px-3 sm:px-6 py-1.5 text-left text-xs sm:text-xs font-semibold text-slate-600">Name</th>
                  <th className="px-3 sm:px-6 py-1.5 text-left text-xs sm:text-xs font-semibold text-slate-600 hidden sm:table-cell">Make / Model</th>
                  <th className="px-3 sm:px-6 py-1.5 text-left text-xs sm:text-xs font-semibold text-slate-600 hidden md:table-cell">Year / Color</th>
                  <th className="px-3 sm:px-6 py-1.5 text-left text-xs sm:text-xs font-semibold text-slate-600 hidden lg:table-cell">Plate / VIN</th>
                  <th className="px-3 sm:px-6 py-1.5 text-left text-xs sm:text-xs font-semibold text-slate-600 hidden lg:table-cell">Odometer</th>
                  <th className="px-3 sm:px-6 py-1.5 text-left text-xs sm:text-xs font-semibold text-slate-600">Driver</th>
                  <th className="px-3 sm:px-6 py-1.5 text-left text-xs sm:text-xs font-semibold text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleVehicles.length === 0 ? (
                  <tr><td colSpan="7" className="px-3 sm:px-6 py-8 sm:py-12 text-center text-slate-500 text-xs">No vehicles yet. Click "Add Vehicle" to create one.</td></tr>
                ) : (
                  visibleVehicles.map((v) => {
                    const assignedDriver = findAssignedDriver(v);
                    const service = getVehicleMaintenanceStatus(v, trips, drivers, maintenancePolicy);
                    return (
                      <tr key={v.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-3 sm:px-6 py-1.5 text-xs sm:text-xs font-semibold text-slate-900">{v.name}</td>
                        <td className="px-3 sm:px-6 py-1.5 text-xs sm:text-xs text-slate-600 hidden sm:table-cell">{v.make || '-'} {v.model || ''}</td>
                        <td className="px-3 sm:px-6 py-1.5 text-xs sm:text-xs text-slate-600 hidden md:table-cell">{v.year || '-'} / {v.color || '-'}</td>
                        <td className="px-3 sm:px-6 py-1.5 text-xs sm:text-xs text-slate-600 hidden lg:table-cell font-mono">{v.plate || '-'} / {v.vin ? v.vin.slice(-6) : '-'}</td>
                        <td className="px-3 sm:px-6 py-1.5 text-xs sm:text-xs hidden lg:table-cell"><p className="font-semibold text-slate-700">{service.odometer.toLocaleString()} mi</p><p className={['overdue', 'due'].includes(service.oil.status) ? 'text-rose-600' : service.oil.status === 'due_soon' ? 'text-amber-600' : 'text-emerald-600'}>Oil: {service.oil.status.replace('_', ' ')}</p><p className={['overdue', 'due'].includes(service.filter.status) ? 'text-rose-600' : ['due_soon', 'setup_required'].includes(service.filter.status) ? 'text-amber-600' : 'text-emerald-600'}>Filter: {service.filter.status.replace('_', ' ')}</p></td>
                        <td className="px-3 sm:px-6 py-1.5 text-xs sm:text-xs text-slate-600">
                          <select value={assignedDriver?.id || ''} onChange={async (e) => {
                            const driverId = e.target.value;
                            const oldDriverId = assignedDriver?.id;
                            if (driverId === oldDriverId) return;
                            const targetDriverId = driverId || oldDriverId;
                            if (targetDriverId && await persistVehicleAssignment(targetDriverId, driverId ? v.name : '')) {
                              addAuditLog('Driver Assigned', `${currentUser} assigned ${drivers.find(d => d.id === driverId)?.name || 'no driver'} to vehicle ${v.name}.`, 'indigo');
                            }
                          }} className="px-2 py-1 border border-slate-200 rounded-xl text-xs font-semibold bg-white w-full max-w-[140px] focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none">
                            <option value="">- Unassigned -</option>
                            {drivers.map(d => (
                              <option key={d.id} value={d.id}>{d.name} {d.vehicle && d.vehicle !== v.name ? `(${d.vehicle})` : ''}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 sm:px-6 py-1.5">
                          <div className="flex gap-1">
                            <button onClick={() => recordMaintenanceService(v, 'oil')} className="rounded-lg bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-700 hover:bg-blue-100" title="Password-confirmed oil service reset">Oil done</button>
                            <button onClick={() => recordMaintenanceService(v, 'filter')} className="rounded-lg bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100" title="Password-confirmed filter service reset">Filter done</button>
                            <button onClick={() => openVEdit(v)} className="p-1.5 sm:p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition" title="Edit" aria-label="Edit"><Edit2 size={14} /></button>
                            {(role === 'admin' || role === 'dispatcher') && (
                              <button onClick={() => deleteVehicle(v)} className="p-1.5 sm:p-2 text-red-600 hover:bg-red-50 rounded-lg transition" title="Delete" aria-label="Delete"><Trash2 size={14} /></button>
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
        </div>
      )}

      {/* Assign Trips Modal */}
      {assignDriver && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-3 sm:p-4">
          <div className="bg-white border border-slate-100/50 rounded-xl overflow-hidden shadow-sm max-w-2xl w-full max-h-[90vh] overflow-y-auto mx-0 sm:mx-4">
            <div className="p-4 sm:p-8">
              <div className="flex justify-between items-center mb-4 sm:mb-6">
                <div>
                  <h3 className="text-lg sm:text-xl font-semibold text-slate-900">{assignDriver.name} Trips</h3>
                  <p className="text-xs sm:text-xs text-slate-500">{assignedTripsForDriver.length} assigned • {unassignedTrips.length} available to assign</p>
                </div>
                <button onClick={() => { setAssignDriver(null); setSelectedTrips([]); }} className="p-1.5 sm:p-2 hover:bg-slate-100 rounded-lg" aria-label="Close"><X size={18} /></button>
              </div>

              {assignedTripsForDriver.length === 0 && unassignedTrips.length === 0 ? (
                <div className="p-8 text-center text-slate-500">
                  <CheckSquare size={40} className="mx-auto text-slate-300 mb-4" />
                  <p className="font-semibold">No trips found</p>
                  <p className="text-xs mt-1">There are no trips assigned to this driver and no open trips to assign right now.</p>
                </div>
              ) : (
                <>
                  {assignedTripsForDriver.length > 0 && (
                    <div className="mb-5">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Assigned to this driver</p>
                        <span className="text-xs font-semibold text-slate-500">{assignedTripsForDriver.length}</span>
                      </div>
                      <div className="max-h-52 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
                        {assignedTripsForDriver.map(trip => (
                          <div key={trip.id} className="p-3 sm:p-4 bg-slate-50/70">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-xs sm:text-xs font-semibold text-slate-900 break-words">{trip.patient || 'Unnamed client'}</p>
                                <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">
                                  {trip.bookingId ? `Booking ${trip.bookingId}` : trip.clientId ? `Client ${trip.clientId}` : trip.id}
                                </p>
                              </div>
                              <span className="px-2 py-0.5 rounded-md bg-blue-100 text-blue-700 text-[10px] sm:text-xs font-semibold shrink-0">{trip.status || 'Assigned'}</span>
                            </div>
                            <p className="text-xs mt-2 break-words"><span className="text-emerald-600">{trip.pickup}</span> <span className="text-slate-300">→</span> <span className="text-rose-600">{trip.dropoff}</span></p>
                            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
                              <span>{trip.date || 'No date'}</span>
                              <span>{trip.time || 'No time'}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Available unassigned trips</p>
                    <span className="text-xs font-semibold text-slate-500">{unassignedTrips.length}</span>
                  </div>
                  {unassignedTrips.length === 0 ? (
                    <div className="border border-dashed border-slate-200 rounded-xl p-6 text-center text-slate-500 text-xs">
                      All open trips are already assigned.
                    </div>
                  ) : (
                    <div className="max-h-64 sm:max-h-80 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
                    {unassignedTrips.map(trip => (
                      <label key={trip.id} className={`flex items-center gap-3 p-3 sm:p-4 cursor-pointer hover:bg-slate-50 transition ${selectedTrips.includes(trip.id) ? 'bg-blue-50' : ''}`}>
                        <input type="checkbox" checked={selectedTrips.includes(trip.id)} onChange={() => toggleTripSelection(trip.id)} className="w-4 h-4 accent-blue-600 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs sm:text-xs font-semibold text-slate-900 break-words">{trip.patient}</p>
                          <p className="text-xs sm:text-xs truncate"><span className="text-emerald-600">{trip.pickup}</span> <span className="text-slate-300">→</span> <span className="text-rose-600">{trip.dropoff}</span></p>
                        </div>
                        <span className="text-xs sm:text-xs text-slate-500 shrink-0">{trip.time}</span>
                      </label>
                    ))}
                  </div>

                  )}

                  <div className="flex items-center justify-between mt-4 sm:mt-6">
                    <p className="text-xs sm:text-xs text-slate-600 font-semibold">{selectedTrips.length} trip{selectedTrips.length !== 1 ? 's' : ''} selected</p>
                    <div className="flex gap-2 sm:gap-3">
                      <button onClick={() => { setAssignDriver(null); setSelectedTrips([]); }} className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl font-semibold text-xs">Cancel</button>
                      <button onClick={assignSelectedTrips} disabled={selectedTrips.length === 0} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-xs">
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

      {/* Same-view schedule editor */}
      {editScheduleDriver && (
        <section className="mx-2 my-4 scroll-mt-24 rounded-2xl border border-blue-200 bg-blue-50/30 p-2 sm:mx-4 sm:p-3">
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm w-full overflow-x-hidden">
            <div className="p-4 sm:p-8">
              <div className="flex justify-between items-center mb-4 sm:mb-6">
                <div>
                  <h3 className="text-lg sm:text-xl font-semibold text-slate-900">Schedule: {editScheduleDriver.name}</h3>
                  <p className="text-xs sm:text-xs text-slate-500">Manage time blocks (6 AM – 8 PM)</p>
                </div>
                <button onClick={() => { setEditScheduleDriver(null); setEditingScheduleIdx(null); }} className="p-1.5 sm:p-2 hover:bg-slate-100 rounded-lg" aria-label="Close"><X size={18} /></button>
              </div>

              {/* Timeline Preview */}
              <div className="bg-slate-50 rounded-xl p-4 mb-4 border border-slate-200">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Schedule Timeline</p>
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
                        <span className="text-xs text-slate-400 absolute -bottom-3.5 -translate-x-1/2 font-mono">{h > 12 ? h - 12 : h}{h >= 12 ? 'p' : 'a'}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Existing Schedule Blocks */}
              <div className="space-y-2 mb-4">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Time Blocks</p>
                {(editScheduleDriver.schedule || []).length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-4">No schedule blocks yet. Add one below.</p>
                )}
                {(editScheduleDriver.schedule || []).map((block, idx) => (
                  <div key={idx} className={`flex items-center justify-between p-3 rounded-lg border ${editingScheduleIdx === idx ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 bg-white'}`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${block.status === 'free' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-900">{block.start} – {block.end}</p>
                        <p className="text-xs text-slate-500 capitalize">{block.status}</p>
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => editScheduleBlock(idx)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg" aria-label="Edit schedule block"><Edit2 size={14} /></button>
                      <button onClick={() => deleteScheduleBlock(idx)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg" aria-label="Delete schedule block"><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Add/Edit Schedule Block Form */}
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                <p className="text-xs font-semibold text-slate-700 mb-3">{editingScheduleIdx !== null ? 'Edit Block' : 'Add New Block'}</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Start</label>
                    <select value={scheduleForm.start} onChange={(e) => setScheduleForm({ ...scheduleForm, start: e.target.value })} className="w-full px-2 py-1.5 border border-slate-200 rounded-xl text-xs font-semibold focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none">
                      {['06:00 AM','07:00 AM','08:00 AM','09:00 AM','10:00 AM','11:00 AM','12:00 PM','01:00 PM','02:00 PM','03:00 PM','04:00 PM','05:00 PM','06:00 PM','07:00 PM','08:00 PM'].map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">End</label>
                    <select value={scheduleForm.end} onChange={(e) => setScheduleForm({ ...scheduleForm, end: e.target.value })} className="w-full px-2 py-1.5 border border-slate-200 rounded-xl text-xs font-semibold focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none">
                      {['06:00 AM','07:00 AM','08:00 AM','09:00 AM','10:00 AM','11:00 AM','12:00 PM','01:00 PM','02:00 PM','03:00 PM','04:00 PM','05:00 PM','06:00 PM','07:00 PM','08:00 PM'].map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Status</label>
                    <select value={scheduleForm.status} onChange={(e) => setScheduleForm({ ...scheduleForm, status: e.target.value })} className="w-full px-2 py-1.5 border border-slate-200 rounded-xl text-xs font-semibold focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none">
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
        </section>
      )}

      {/* AI Driver Analysis Modal */}
      {aiDriverModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-slate-100/50 rounded-xl shadow-sm max-w-md w-full">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                  <BrainCircuit size={18} className="text-indigo-600" />
                  AI Driver Analysis
                </h3>
                <button onClick={() => setAiDriverModal(null)} className="p-1 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
              </div>
              {aiDriverLoading[aiDriverModal] ? (
                <div className="flex items-center gap-2 text-slate-500"><Loader2 size={16} className="animate-spin" /> Analyzing driver...</div>
              ) : aiDriverInsights[aiDriverModal] ? (
                <AIInsightsBanner insights={aiDriverInsights[aiDriverModal]} />
              ) : (
                <p className="text-slate-400 text-xs">No analysis available.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <section className="mx-2 my-4 scroll-mt-24 rounded-2xl border border-blue-200 bg-blue-50/30 p-2 sm:mx-4 sm:p-3">
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm w-full">
            <div className="p-8">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-semibold text-slate-900">{editing ? 'Edit Driver' : 'Add Driver'}</h3>
                <button onClick={() => { setShowForm(false); resetForm(); }} className="p-2 hover:bg-slate-100 rounded-lg" aria-label="Close"><X size={20} /></button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Name</label>
                  <input autoFocus type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" placeholder="Driver name" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Email</label>
                  <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" placeholder="email@example.com" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Phone Number</label>
                  <input type="text" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" placeholder="(555) 123-4567" />
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                  <div>
                    <p className="text-sm font-bold text-slate-900">Home-to-home timekeeping</p>
                    <p className="text-xs text-slate-500">Home is the default paid shift anchor. Coordinates are resolved when this profile is saved.</p>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Home street address</label>
                    <input type="text" value={form.homeAddress} onChange={(e) => setForm({ ...form, homeAddress: e.target.value, homeLat: '', homeLng: '' })} className="w-full px-4 py-2 border border-slate-200 rounded-xl" placeholder="Street address" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <input aria-label="Apartment or suite" value={form.address2} onChange={(e) => setForm({ ...form, address2: e.target.value, homeLat: '', homeLng: '' })} className="px-3 py-2 border border-slate-200 rounded-xl" placeholder="Apt / suite" />
                    <input aria-label="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value, homeLat: '', homeLng: '' })} className="px-3 py-2 border border-slate-200 rounded-xl" placeholder="City" />
                    <input aria-label="State" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value, homeLat: '', homeLng: '' })} className="px-3 py-2 border border-slate-200 rounded-xl" placeholder="State" />
                    <input aria-label="ZIP code" value={form.zip} onChange={(e) => setForm({ ...form, zip: e.target.value, homeLat: '', homeLng: '' })} className="px-3 py-2 border border-slate-200 rounded-xl" placeholder="ZIP" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Time calculation policy</label>
                    <select value={form.timeTrackingPolicy} onChange={(e) => setForm({ ...form, timeTrackingPolicy: e.target.value })} className="w-full px-4 py-2 border border-slate-200 rounded-xl bg-white">
                      <option value={POLICY_MODES.PAY_FROM_HOME}>Home to home (default)</option>
                      <option value={POLICY_MODES.PAY_FROM_FIRST_PICKUP}>First pickup to last dropoff</option>
                      <option value={POLICY_MODES.SMART_MODE}>Smart anchor</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Employment type</label>
                    <select value={form.employmentType} onChange={(e) => setForm({ ...form, employmentType: e.target.value })} className="w-full px-4 py-2 border border-slate-200 rounded-xl bg-white"><option value="employee">Employee</option><option value="contractor">Contractor</option></select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Hire date</label>
                    <input type="date" value={form.hireDate} onChange={(e) => setForm({ ...form, hireDate: e.target.value })} className="w-full px-4 py-2 border border-slate-200 rounded-xl" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Emergency contact</label>
                    <input value={form.emergencyContactName} onChange={(e) => setForm({ ...form, emergencyContactName: e.target.value })} className="w-full px-4 py-2 border border-slate-200 rounded-xl" placeholder="Full name" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Emergency phone</label>
                    <input value={form.emergencyContactPhone} onChange={(e) => setForm({ ...form, emergencyContactPhone: e.target.value })} className="w-full px-4 py-2 border border-slate-200 rounded-xl" placeholder="(555) 123-4567" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Hourly Rate ($)</label>
                  <input type="number" step="0.01" min="0" value={form.hourlyRate} onChange={(e) => setForm({ ...form, hourlyRate: e.target.value })} className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" placeholder="e.g. 20.00" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Vehicle</label>
                    <select value={form.vehicle} onChange={(e) => setForm({ ...form, vehicle: e.target.value })} className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20">
                      <option value="">— Select Vehicle —</option>
                      {vehicles.map(v => (
                        <option key={v.id} value={v.name}>{v.name} {v.plate ? `(${v.plate})` : ''}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">VIN Number</label>
                    <input type="text" value={form.vin} onChange={(e) => setForm({ ...form, vin: e.target.value })} className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" placeholder="17-digit VIN" />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Insurance Expiry</label>
                    <input type="date" value={form.insuranceExpiry} onChange={(e) => setForm({ ...form, insuranceExpiry: e.target.value })} className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Wheelchair Capacity</label>
                    <select value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20">
                      <option value="0">0 (Sedan)</option>
                      <option value="1">1 (Standard Van)</option>
                      <option value="2">2 (Large Van)</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Assigned Dispatcher</label>
                  <select value={form.assignedDispatcher} onChange={(e) => setForm({ ...form, assignedDispatcher: e.target.value })} className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20">
                    <option value="">Unassigned</option>
                    {dispatchers.map(ds => (
                      <option key={ds.id} value={ds.id}>{ds.name} ({ds.email})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Zone</label>
                  <input type="text" value={form.currentZone} onChange={(e) => setForm({ ...form, currentZone: e.target.value })} className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" placeholder="Downtown Indy" />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => { setShowForm(false); resetForm(); }} className="flex-1 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl font-semibold">Cancel</button>
                <button onClick={saveDriver} className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2"><Save size={16} /> {editing ? 'Update' : 'Add'}</button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Vehicle Form Modal */}
      {vehicleForm && (
        <section className="mx-2 my-4 scroll-mt-24 rounded-2xl border border-blue-200 bg-blue-50/30 p-2 sm:mx-4 sm:p-3">
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm w-full">
            <div className="p-8">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-semibold text-slate-900">{editVehicleId ? 'Edit Vehicle' : 'Add Vehicle'}</h3>
                <button onClick={() => { setVehicleForm(false); resetVForm(); }} className="p-2 hover:bg-slate-100 rounded-lg" aria-label="Close"><X size={20} /></button>
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Vehicle Name</label>
                    <input autoFocus type="text" required value={vForm.name} onChange={(e) => setVForm({ ...vForm, name: e.target.value })} className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" placeholder="Van #42" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Make</label>
                    <input type="text" value={vForm.make} onChange={(e) => setVForm({ ...vForm, make: e.target.value })} className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" placeholder="Ford" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Model</label>
                    <input type="text" value={vForm.model} onChange={(e) => setVForm({ ...vForm, model: e.target.value })} className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" placeholder="Transit" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Year</label>
                    <input type="text" value={vForm.year} onChange={(e) => setVForm({ ...vForm, year: e.target.value })} className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" placeholder="2024" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Color</label>
                    <input type="text" value={vForm.color} onChange={(e) => setVForm({ ...vForm, color: e.target.value })} className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" placeholder="White" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">License Plate</label>
                    <input type="text" value={vForm.plate} onChange={(e) => setVForm({ ...vForm, plate: e.target.value })} className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" placeholder="ABC-1234" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">VIN</label>
                    <input type="text" value={vForm.vin} onChange={(e) => setVForm({ ...vForm, vin: e.target.value })} className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" placeholder="17-digit VIN" maxLength="17" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Odometer</label>
                    <input type="number" value={vForm.odometer} onChange={(e) => setVForm({ ...vForm, odometer: e.target.value })} className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" placeholder="0" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Last Oil Change Odometer</label>
                    <input type="number" value={vForm.lastOilChangeOdometer} onChange={(e) => setVForm({ ...vForm, lastOilChangeOdometer: e.target.value })} className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" placeholder="260000" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Oil Change Interval (mi)</label>
                    <input type="number" min="500" step="100" value={vForm.oilChangeIntervalMiles} onChange={(e) => setVForm({ ...vForm, oilChangeIntervalMiles: e.target.value })} className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" placeholder="4000" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Oil Due-Soon Warning (mi)</label>
                    <input type="number" min="50" step="50" value={vForm.oilDueSoonMiles} onChange={(e) => setVForm({ ...vForm, oilDueSoonMiles: e.target.value })} className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" placeholder="500" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Last Oil Change Date</label>
                    <input type="date" value={vForm.lastOilChangeDate} onChange={(e) => setVForm({ ...vForm, lastOilChangeDate: e.target.value })} className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Last Filter Change Date</label>
                    <input type="date" value={vForm.lastFilterChangeDate} onChange={(e) => setVForm({ ...vForm, lastFilterChangeDate: e.target.value })} className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Filter Interval (months)</label>
                    <input type="number" min="1" value={vForm.filterChangeIntervalMonths} onChange={(e) => setVForm({ ...vForm, filterChangeIntervalMonths: e.target.value })} className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" placeholder="12" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Filter Due-Soon Warning (days)</label>
                    <input type="number" min="1" value={vForm.filterDueSoonDays} onChange={(e) => setVForm({ ...vForm, filterDueSoonDays: e.target.value })} className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" placeholder="30" />
                  </div>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => { setVehicleForm(false); resetVForm(); }} className="flex-1 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl font-semibold">Cancel</button>
                <button onClick={saveVehicle} className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2"><Save size={16} /> {editVehicleId ? 'Update' : 'Add'}</button>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
};

export default DriversVehiclesPage;
