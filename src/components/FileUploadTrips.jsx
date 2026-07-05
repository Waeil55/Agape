import React, { useState, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { Upload, AlertCircle, Loader, CheckCircle2, FileText, Zap, BrainCircuit, AlertTriangle, Info, ArrowRight, Download, Truck, X, Calendar, FileSpreadsheet } from 'lucide-react';
import { GEMINI_API_CONFIG } from '../config/firebase';
import { annotateInOutPairs, hasInOutMarker, IN_OUT_WAIT_MINUTES } from '../utils/inOutTrips';
import { isCorruptedTripRecord } from '../utils/tripIntegrity';
import { normalizeDateValue } from '../utils/normalizeDate';

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

const COLUMN_ALIASES = {
  bookingId: ['booking id', 'bookingid', 'reservation id', 'trip id', 'booking number', 'confirmation id', 'tripid', 'trip_id', 'trip number', 'order id', 'order number', 'booking', 'confirmation #', 'confirmation', 'reservation'],
  patient: ['client', 'client name', 'passenger', 'passenger name', 'rider', 'customer', 'patient name', 'name', 'rider name', 'guest', 'user', 'person', 'member', 'member name', 'full name', 'contact name'],
  pickup: ['pickup', 'pickup address', 'pickup_address', 'pick up', 'origin', 'from', 'from address', 'from_address', 'pu', 'pickup location', 'start address', 'start', 'pick-up address', 'pick up address', 'pu address', 'address short', 'address'],
  dropoff: ['dropoff', 'dropoff address', 'dropoff_address', 'drop off', 'destination', 'to', 'to address', 'to_address', 'do', 'dest', 'dropoff location', 'end address', 'end', 'drop-off address', 'drop off address', 'do address'],
  pickupPhone: ['pickup phone', 'pickup phone number', 'pickup_phone', 'phone', 'client phone', 'passenger phone', 'primary phone', 'phone number', 'tel', 'telephone', 'contact', 'member phone', 'mobile', 'cell phone', 'cell', 'primary contact'],
  dropoffPhone: ['dropoff phone', 'dropoff phone number', 'dropoff_phone', 'facility phone', 'destination phone', 'location phone', 'secondary phone', 'dest phone', 'facility contact', 'location contact'],
  time: ['time', 'pickup time', 'pickup_time', 'schedule time', 'scheduled time', 'appt time', 'appt', 'appointment time', 'timestamp', 'slot', 'scheduled', 'pick up time', 'pu time', 'pickup', 'scheduled pickup'],
  dropoffTime: ['requested late dropoff', 'requested time dropoff', 'dropoff time', 'late dropoff', 'return time', 'do time', 'drop-off time', 'drop off time', 'appt end time', 'end time', 'dropoff', 'scheduled dropoff', 'return'],
  date: ['date', 'trip date', 'service date', 'requested date', 'scheduled date', 'appt date', 'appointment date', 'day', 'calendar date', 'schedule date'],
  type: ['type', 'trip type', 'am/pm', 'run', 'shift', 'route type', 'service type', 'schedule type', 'trip_type', 'mode', 'vehicle type', 'req', 'service', 'transport type', 'transportation type'],
  notes: ['notes', 'special instructions', 'instructions', 'comment', 'comments', 'note', 'memo', 'remarks', 'additional info', 'info', 'pickup comments', 'dropoff comments', 'message', 'purpose', 'driver notes', 'trip notes', 'special', 'special needs', 'alert'],
  driver: ['driver', 'driver name', 'assigned to', 'chauffeur', 'provider', 'assigned driver', 'driver id', 'driverid'],
  driverEmail: ['driver email', 'driver_email', 'driver email address', 'email'],
  vehicle: ['vehicle', 'vehicle id', 'car', 'van', 'fleet', 'assigned vehicle', 'truck', 'vehicle number', 'unit #', 'unit number'],
  pickupOdometer: ['pickup odo', 'pickup odometer', 'pu odometer', 'start odometer', 'start mileage', 'pickup mileage', 'odometer start', 'pu odo', 'start odo', 'begin odo', 'begin odometer', 'start odo reading', 'mileage/odometer'],
  dropoffOdometer: ['dropoff odo', 'dropoff odometer', 'do odometer', 'end odometer', 'end mileage', 'dropoff mileage', 'odometer end', 'do odo', 'end odo', 'final odo', 'end odo reading'],
  odometer: ['odometer', 'odo', 'mileage'],
  distance: ['distance', 'dist', 'trip distance', 'miles', 'total miles', 'est miles', 'estimated miles', 'est distance', 'total distance', 'mileage'],
  pickupArrival: ['pickup arrival', 'pu arrival', 'arrive pickup', 'arrived at pickup', 'time arrived at pickup', 'pu arrival time', 'pickup arrival time', 'arrival time', 'arrive time', 'arrived time', 'actual pickup time', 'pickup arrived', 'arrival'],
  dropoffArrival: ['dropoff arrival', 'do arrival', 'arrive dropoff', 'arrived at dropoff', 'time arrived at dropoff', 'do arrival time', 'dropoff arrival time', 'actual dropoff time', 'dropoff arrived'],
  completedAt: ['completed at', 'completedat', 'completed timestamp', 'completion time', 'date completed', 'completion date', 'timestamp', 'date/time completed', 'finish time', 'end time', 'trip end'],
  startTime: ['start time', 'started at', 'startedat', 'start timestamp', 'trip start', 'begin time', 'departure time', 'begin trip', 'dispatch time'],
  departedPickupTime: ['departed pickup', 'departed pickup time', 'departed pu', 'left pickup', 'pickup departure', 'departure from pickup', 'departed at'],
  cancelledAt: ['cancelled at', 'cancelledat', 'cancelled timestamp', 'cancellation time', 'date cancelled', 'cancellation date', 'cancelled date'],
  cancellationReason: ['cancellation reason', 'cancel reason', 'reason', 'cancelled reason', 'cancel_reason'],
  completedVehicle: ['completed vehicle', 'vehicle', 'trip vehicle', 'assigned vehicle', 'completion vehicle', 'vehicle used'],
  paperSignatureConfirmed: ['signature', 'signature captured', 'signature captured?', 'signature confirmed', 'signed', 'paper signature', 'rider signature', 'sign'],
  patientPhone: ['patient phone', 'client phone', 'rider phone', 'passenger phone', 'home phone', 'primary contact phone'],
  pickupSiteName: ['pickup site', 'pickup site name', 'site name origin', 'origin site', 'pickup location name', 'site', 'facility name (pickup)', 'building (pickup)'],
  dropoffSiteName: ['dropoff site', 'dropoff site name', 'site name destination', 'destination site', 'dropoff location name', 'facility name (dropoff)', 'building (dropoff)'],
};

const cleanPhone = (p) => (p || '').replace(/[^0-9]/g, '');

const FACILITY_KEYWORDS = [
  'center', 'centre', 'clinic', 'hospital', 'care', 'treatment',
  'medical', 'health', 'therapy', 'academy', 'school', 'facility',
  'llc', 'inc', 'llp', 'corp', 'ltd', 'pharmacy', 'pharm',
  'dialysis', 'rehab', 'rehabilitation', 'mental health',
  'behavioral', 'paediatric', 'pediatric', 'dental', 'lab',
  'imaging', 'radiology', 'urgent care', 'er ', 'emergency',
  'surgery', 'surgical', 'ortho', 'cardio', 'neuro',
];

function isFacilitySiteName(name) {
  const lower = (name || '').toLowerCase().trim();
  if (!lower) return false;
  return FACILITY_KEYWORDS.some(kw => lower.includes(kw));
}

function isHomeSiteName(name) {
  const lower = (name || '').toLowerCase().trim();
  if (!lower) return false;
  return ['home', 'house', 'residence', 'apartment', 'apt', 'mother', 'father',
    'grandmother', 'grandfather', 'parent', 'mom', 'dad', 'guardian',
    'foster', 'shelter', 'group home', 'group-home'].some(kw => lower.includes(kw));
}

function isLikelyResidentialAddress(address, siteName) {
  const lower = (address || '').toLowerCase().trim();
  const site = (siteName || '').toLowerCase().trim();
  if (!lower && !site) return false;
  if (isFacilitySiteName(siteName)) return false;
  if (isHomeSiteName(siteName)) return true;
  const streetPatterns = /\b\d+\s+\w+\s+(st|street|dr|drive|rd|road|ave|avenue|blvd|boulevard|ln|lane|way|ct|court|pl|place|cir|circle)\b/i;
  if (streetPatterns.test(lower) || streetPatterns.test(site)) return true;
  if (site === 'wrk' || site === 'work') return false;
  return false;
}

const cleanOdometer = (value) => {
  if (value === undefined || value === null || value === '') return '';
  const s = String(value).trim();
  if (!s || /^\d{1,2}:\d{2}/.test(s)) return '';
  // Aggressively strip anything that isn't a digit or decimal point
  const cleaned = s.replace(/[^0-9.]/g, '');
  const num = parseFloat(cleaned);
  return (!isNaN(num) && num >= 0) ? String(num) : '';
};

function findColumn(headers, aliases) {
  const lower = headers.map(h => h.toLowerCase().trim().replace(/[^a-z0-9]/g, ''));
  for (const alias of aliases) {
    const a = alias.toLowerCase().replace(/[^a-z0-9]/g, '');
    const idx = lower.indexOf(a);
    if (idx !== -1) return idx;
  }
  for (const alias of aliases) {
    const a = alias.toLowerCase().replace(/[^a-z0-9]/g, '');
    const idx = lower.findIndex(h => h.includes(a) || a.includes(h));
    if (idx !== -1) return idx;
  }
  const a = aliases[0].toLowerCase().replace(/[^a-z0-9]/g, '');
  return lower.findIndex(h => h.includes(a) || a.includes(h));
}

function detectDelimiter(firstLine) {
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  if (tabCount > commaCount) return '\t';
  return ',';
}

function splitLine(line, delimiter) {
  const values = [];
  let v = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { v += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { v += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === delimiter) { values.push(v.trim()); v = ''; }
      else { v += ch; }
    }
  }
  values.push(v.trim());
  return values;
}

function parseCSV(text) {
  // Try papaparse first — handles complex quoting, BOM, CRLF robustly
  try {
    const result = Papa.parse(text.replace(/^\uFEFF/, ''), {
      header: true,
      skipEmptyLines: true,
      trimHeaders: true,
      dynamicTyping: false,
    });
    if (result.data && result.data.length > 0 && result.meta?.fields?.length > 0) {
      return result.data.map(row => {
        const clean = {};
        Object.keys(row).forEach(k => { clean[k.trim()] = String(row[k] ?? '').trim(); });
        return clean;
      });
    }
  } catch (_) { /* fall through to custom parser */ }

  // Custom fallback parser
  text = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { current += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === '\n') { lines.push(current); current = ''; }
      else { current += ch; }
    }
  }
  if (current.trim()) lines.push(current);

  if (lines.length < 2) return [];

  const delimiter = detectDelimiter(lines[0]);
  const headers = splitLine(lines[0], delimiter);

  const data = [];
  for (let r = 1; r < lines.length; r++) {
    if (!lines[r].trim()) continue;
    const values = splitLine(lines[r], delimiter);
    const row = {};
    headers.forEach((h, idx) => {
      const raw = values[idx];
      row[h.trim()] = raw !== undefined ? raw.trim() : '';
    });
    if (values.length > headers.length) {
      const lastH = headers[headers.length - 1].trim();
      const extra = values.slice(headers.length).map(v => v.trim()).join(delimiter === '\t' ? '\t' : ',');
      if (row[lastH] && extra) row[lastH] += (delimiter === '\t' ? '\t' : ',') + extra;
    }
    data.push(row);
  }
  return data;
}

function parseExcel(buffer) {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
  return processRawRows(rawRows);
}

function processRawRows(rawRows) {
  if (!rawRows || rawRows.length === 0) return [];
  
  // Detect Agape 2-row report format (check data rows, NOT the header row)
  let isAgapeReport = false;
  for (let ri = 1; ri < rawRows.length; ri++) {
    const r = rawRows[ri];
    if (!r || r.length < 8) continue;
    const hasActivity = String(r[4]).toUpperCase() === 'PICKUP' || String(r[4]).toUpperCase() === 'DROPOFF';
    const hasSig = r.some(v => String(v).toUpperCase() === 'YES' || String(v).toUpperCase() === 'NO');
    if (hasActivity && hasSig) { isAgapeReport = true; break; }
  }
  
  if (isAgapeReport) {
    const dataRows = rawRows.filter(r => r && (String(r[4]).toUpperCase() === 'PICKUP' || String(r[4]).toUpperCase() === 'DROPOFF' || String(r.join(' ')).toUpperCase().includes('PICKUP')));
    const grouped = [];
    // Detect format: new (Arrival + Odometer separate) vs old (combined "time odo" in one column)
    // New format: p[6]=arrival, p[7]=odometer, p[8]=travel time, p[9]=address, p[10]=signature
    // Old format: p[6]="time odo", p[7]=travel time, p[8]=address, p[9]=distance, p[10]=signature
    const firstRow = dataRows[0];
    const isNewFormat = firstRow && firstRow.length >= 10 && 
      /^\d{1,2}:\d{2}$/.test(String(firstRow[6] || '').trim()) && 
      /^\d+$/.test(String(firstRow[7] || '').trim().replace(/,/g, ''));
    
    for (let i = 0; i < dataRows.length; i += 2) {
      const p = dataRows[i];
      const d = dataRows[i + 1] || p;
      
      let pArr, pOdo, dArr, dOdo, travelTime;
      
      if (isNewFormat) {
        // New: separate columns
        pArr = String(p[6] || '').trim();
        pOdo = String(p[7] || '').trim().replace(/,/g, '');
        dArr = String(d[6] || '').trim();
        dOdo = String(d[7] || '').trim().replace(/,/g, '');
        travelTime = String(p[8] || d[8] || '');
      } else {
        // Old: combined "time odo" in p[6]
        const pSplit = String(p[6] || '').split(' ');
        const dSplit = String(d[6] || '').split(' ');
        pArr = pSplit[0] || '';
        pOdo = pSplit[1] || pSplit[0] || '';
        dArr = dSplit[0] || '';
        dOdo = dSplit[1] || dSplit[0] || '';
        travelTime = String(p[7] || d[7] || '');
      }
      
      const driverStr = String(p[5] || '');
      const dName = driverStr.split(' ')[0] || '';
      const veh = driverStr.split(' ').slice(1).join(' ') || '';
      
      // Booking ID from column 0
      const bookingId = String(p[0] || '').trim();
      
      // Address column index varies by format
      const addrIdx = isNewFormat ? 9 : 8;
      const shortAddrIdx = 1;
      
      let pickupAddr = String(p[addrIdx] || p[shortAddrIdx] || '').trim();
      let dropoffAddr = String(d[addrIdx] || d[shortAddrIdx] || '').trim();
      
      if (!pickupAddr && String(p[shortAddrIdx] || '').trim()) pickupAddr = String(p[shortAddrIdx] || '').trim();
      if (!dropoffAddr && String(d[shortAddrIdx] || '').trim()) dropoffAddr = String(d[shortAddrIdx] || '').trim();
      
      // Signature column index varies
      const sigIdx = isNewFormat ? 10 : 10;
      
      grouped.push({
        'Trip ID': bookingId,
        'Client Name': String(p[3] || d[3] || ''),
        'Pickup Time': String(p[2] || ''),
        'Dropoff Time': String(d[2] || ''),
        'Pickup Address': pickupAddr,
        'Dropoff Address': dropoffAddr,
        'Status': 'Completed',
        '_agape_driverName': dName,
        '_agape_vehicle': veh,
        '_agape_pickupArrival': pArr,
        '_agape_pickupOdo': pOdo,
        '_agape_dropoffArrival': dArr,
        '_agape_dropoffOdo': dOdo,
        '_agape_signature': String(p[sigIdx]).toUpperCase() === 'YES',
        '_agape_travelTime': travelTime,
        '_agape_phone': String(p[addrIdx] || '').replace(/.*\((\d{3,})\)/, '$1') || '',
      });
    }
    return grouped;
  }
  
  // Standard format with headers
  const headers = rawRows[0].map(h => String(h || '').trim());
  const objects = [];
  for (let i = 1; i < rawRows.length; i++) {
    const row = rawRows[i];
    if (!row || row.length === 0 || row.every(c => !c)) continue;
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = String(row[idx] ?? '').trim(); });
    objects.push(obj);
  }
  return objects;
}

function mapColumns(row) {
  const headers = Object.keys(row);
  const find = (aliases) => {
    const idx = findColumn(headers, aliases);
    return idx !== -1 ? row[headers[idx]] || '' : '';
  };
  return {
    bookingId: find(COLUMN_ALIASES.bookingId),
    patient: find(COLUMN_ALIASES.patient),
    pickup: find(COLUMN_ALIASES.pickup),
    dropoff: find(COLUMN_ALIASES.dropoff),
    pickupPhone: find(COLUMN_ALIASES.pickupPhone),
    dropoffPhone: find(COLUMN_ALIASES.dropoffPhone),
    time: find(COLUMN_ALIASES.time),
    dropoffTime: find(COLUMN_ALIASES.dropoffTime),
    date: find(COLUMN_ALIASES.date),
    type: find(COLUMN_ALIASES.type),
    notes: find(COLUMN_ALIASES.notes),
    driver: find(COLUMN_ALIASES.driver),
    driverEmail: find(COLUMN_ALIASES.driverEmail),
    vehicle: find(COLUMN_ALIASES.vehicle),
    pickupOdometer: find(COLUMN_ALIASES.pickupOdometer),
    dropoffOdometer: find(COLUMN_ALIASES.dropoffOdometer),
    odometer: find(COLUMN_ALIASES.odometer),
    distance: find(COLUMN_ALIASES.distance),
    pickupArrival: find(COLUMN_ALIASES.pickupArrival),
    dropoffArrival: find(COLUMN_ALIASES.dropoffArrival),
    completedAt: find(COLUMN_ALIASES.completedAt),
    startTime: find(COLUMN_ALIASES.startTime),
    departedPickupTime: find(COLUMN_ALIASES.departedPickupTime),
    cancelledAt: find(COLUMN_ALIASES.cancelledAt),
    cancellationReason: find(COLUMN_ALIASES.cancellationReason),
    completedVehicle: find(COLUMN_ALIASES.completedVehicle),
    paperSignatureConfirmed: find(COLUMN_ALIASES.paperSignatureConfirmed),
    patientPhone: find(COLUMN_ALIASES.patientPhone),
    pickupSiteName: find(COLUMN_ALIASES.pickupSiteName),
    dropoffSiteName: find(COLUMN_ALIASES.dropoffSiteName),
  };
}

function mergePairedActivityRows(rows) {
  if (!rows || rows.length === 0) return rows;

  const headers = Object.keys(rows[0]);
  const activityCol = headers.find(h => h.toLowerCase().replace(/[^a-z]/g, '') === 'activity');
  // Match 'Booking Id', 'Booking ID', 'BookingId', 'bookingid', 'Event Id', 'Event ID'
  const bookingCol = headers.find(h => {
    const norm = h.toLowerCase().replace(/[^a-z0-9]/g, '');
    return norm === 'bookingid' || norm === 'eventid';
  });
  if (!activityCol || !bookingCol) return rows;

  const sample = rows.slice(0, 10);
  const hasPaired = sample.some(r => {
    const act = String(r[activityCol] || '').trim().toUpperCase();
    return act === 'PICKUP' || act === 'DROPOFF';
  });
  if (!hasPaired) return rows;

  const shortAddrCol = headers.find(h => h.toLowerCase().replace(/[^a-z ]/g, '').trim() === 'address short');
  const fullAddrCol = headers.find(h => {
    const norm = h.toLowerCase().replace(/[^a-z ]/g, '').trim();
    return norm === 'address';
  });

  const groups = {};
  rows.forEach(row => {
    const bookingId = String(row[bookingCol] || '').trim();
    if (!bookingId) return;
    if (!groups[bookingId]) groups[bookingId] = [];
    groups[bookingId].push(row);
  });

  const merged = [];
  Object.values(groups).forEach(group => {
    if (group.length === 1) {
      merged.push(group[0]);
      return;
    }

    const pickupRow = group.find(r => String(r[activityCol] || '').trim().toUpperCase() === 'PICKUP');
    const dropoffRow = group.find(r => String(r[activityCol] || '').trim().toUpperCase() === 'DROPOFF');
    const base = pickupRow || dropoffRow || group[0];
    const mergedRow = { ...base };

    const getShort = (row) => row && shortAddrCol && row[shortAddrCol] ? String(row[shortAddrCol]).trim() : '';
    const getFull = (row) => row && fullAddrCol && row[fullAddrCol] ? String(row[fullAddrCol]).trim() : '';

    const puShort = getShort(pickupRow);
    const puFull = getFull(pickupRow);
    const doShort = getShort(dropoffRow);
    const doFull = getFull(dropoffRow);

    const pickupAddr = puFull || puShort;
    const dropoffAddr = doFull || doShort;

    mergedRow['Pickup Address'] = pickupAddr;
    mergedRow['Dropoff Address'] = dropoffAddr;
    mergedRow['Address Short'] = puShort || doShort;
    if (fullAddrCol) mergedRow[fullAddrCol] = puFull || doFull;

    const scheduleCol = headers.find(h => h.toLowerCase().replace(/[^a-z]/g, '') === 'scheduletime');
    if (scheduleCol && pickupRow && pickupRow[scheduleCol]) mergedRow[scheduleCol] = pickupRow[scheduleCol];

    const arrivalCol = headers.find(h => h.toLowerCase().replace(/[^a-z]/g, '') === 'arrivaltime');
    if (arrivalCol) {
      if (pickupRow && pickupRow[arrivalCol]) mergedRow['Pickup Arrival'] = pickupRow[arrivalCol];
      if (dropoffRow && dropoffRow[arrivalCol]) mergedRow['Dropoff Arrival'] = dropoffRow[arrivalCol];
    }

    const departureCol = headers.find(h => h.toLowerCase().replace(/[^a-z]/g, '') === 'departuretime');
    if (departureCol) {
      if (pickupRow && pickupRow[departureCol]) mergedRow['Departure Time'] = pickupRow[departureCol];
      if (dropoffRow && dropoffRow[departureCol]) mergedRow['Dropoff Departure'] = dropoffRow[departureCol];
    }

    const distCol = headers.find(h => h.toLowerCase().replace(/[^a-z]/g, '') === 'distance');
    if (distCol && dropoffRow && dropoffRow[distCol]) mergedRow[distCol] = dropoffRow[distCol];

    const phoneCol = headers.find(h => h.toLowerCase().replace(/[^a-z]/g, '') === 'phone');
    if (phoneCol) {
      const puPhone = pickupRow && pickupRow[phoneCol] ? String(pickupRow[phoneCol]).trim() : '';
      const doPhone = dropoffRow && dropoffRow[phoneCol] ? String(dropoffRow[phoneCol]).trim() : '';
      mergedRow[phoneCol] = puPhone || doPhone;
    }

    const costCol = headers.find(h => h.toLowerCase().replace(/[^a-z ]/g, '').trim() === 'providercost');
    if (costCol && dropoffRow && dropoffRow[costCol]) mergedRow[costCol] = dropoffRow[costCol];

    const odoCol = headers.find(h => h.toLowerCase().includes('odometer') || h.toLowerCase().includes('mileage'));
    if (odoCol) {
      if (pickupRow && pickupRow[odoCol]) mergedRow['Pickup Odometer'] = pickupRow[odoCol];
      if (dropoffRow && dropoffRow[odoCol]) mergedRow['Dropoff Odometer'] = dropoffRow[odoCol];
    }

    merged.push(mergedRow);
  });

  return merged;
}

const AI_BATCH_SIZE = 5;
const AI_MAX_RETRIES = 2;
const AI_BASE_DELAY_MS = 1000;
const AI_429_BASE_DELAY_MS = 2000;
const AI_FETCH_TIMEOUT_MS = 25000;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

let _aiAbortController = null;
let _aiSkipRequested = false;

export function requestAiSkip() {
  _aiSkipRequested = true;
  if (_aiAbortController) {
    _aiAbortController.abort();
    _aiAbortController = null;
  }
}

function resetAiSkip() {
  _aiSkipRequested = false;
  _aiAbortController = null;
}

async function aiValidate(rows, onProgress) {
  const results = [];
  resetAiSkip();
  const geminiConfig = GEMINI_API_CONFIG();
  if (!geminiConfig.apiKey) {
    return rows.map(() => ({ issues: [], confidence: 100 }));
  }

  for (let i = 0; i < rows.length; i += AI_BATCH_SIZE) {
    if (_aiSkipRequested) {
      console.warn('[aiValidate] Skipped by user');
      for (let j = i; j < rows.length; j++) {
        if (!results[j]) results[j] = { issues: [], confidence: 100 };
      }
      break;
    }

    const batch = rows.slice(i, i + AI_BATCH_SIZE);
    const batchNum = Math.floor(i / AI_BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(rows.length / AI_BATCH_SIZE);
    let succeeded = false;

    for (let attempt = 0; attempt <= AI_MAX_RETRIES; attempt++) {
      if (_aiSkipRequested) break;
      const retryLabel = attempt > 0 ? ` (retry ${attempt}/${AI_MAX_RETRIES})` : '';
      onProgress(`AI validating batch ${batchNum}/${totalBatches}${retryLabel}...`, Math.round((i / rows.length) * 70) + 15, false);

      const prompt = `You are a data validation AI. For each trip below, check if the pickup and dropoff look like valid addresses, the time looks valid, and the client name is present. Return a JSON array of objects, one per input row, with fields: "issues" (array of strings describing problems, empty if none), "correctedPickup" (fix obvious typos or leave as-is), "correctedDropoff", "correctedTime", "confidence" (0-100). If all looks good, "issues" should be [].

Input rows:
${JSON.stringify(batch.map((r, idx) => ({ idx: i + idx, patient: r.patient, pickup: r.pickup, dropoff: r.dropoff, time: r.time })), null, 2)}

Return ONLY valid JSON array. No markdown. No explanation.`;

      try {
        _aiAbortController = new AbortController();
        const timeoutId = setTimeout(() => _aiAbortController?.abort(), AI_FETCH_TIMEOUT_MS);
        const resp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiConfig.apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
            }),
            signal: _aiAbortController.signal,
          }
        );
        clearTimeout(timeoutId);

        if (resp.status === 429) {
          const delay = AI_429_BASE_DELAY_MS * Math.pow(2, attempt);
          console.warn(`[aiValidate] Rate limited (429) on batch ${batchNum}, waiting ${delay}ms...`);
          onProgress(`Rate limited — waiting ${Math.round(delay / 1000)}s before retry...`, Math.round((i / rows.length) * 70) + 15, true);
          await sleep(delay);
          continue;
        }

        if (!resp.ok) {
          const errText = await resp.text().catch(() => '');
          throw new Error(`HTTP ${resp.status}: ${errText.slice(0, 100)}`);
        }

        const data = await resp.json();
        let aiOutput = data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
        aiOutput = aiOutput.replace(/```json\s*/gi, '').replace(/```\s*$/gi, '').trim();
        const parsed = JSON.parse(aiOutput);
        if (Array.isArray(parsed)) {
          parsed.forEach((p, j) => {
            const origIdx = i + j;
            if (origIdx < rows.length) {
              results[origIdx] = { issues: p.issues || [], confidence: p.confidence || 100 };
            }
          });
        }
        succeeded = true;
        break;
      } catch (err) {
        if (err.name === 'AbortError' && _aiSkipRequested) break;
        if (attempt < AI_MAX_RETRIES) {
          const delay = AI_BASE_DELAY_MS * Math.pow(2, attempt);
          console.warn(`[aiValidate] Batch ${batchNum} attempt ${attempt + 1} failed: ${err.message}. Retrying in ${delay}ms...`);
          await sleep(delay);
        }
      }
    }

    if (!succeeded && !_aiSkipRequested) {
      console.error(`[aiValidate] Batch ${batchNum} failed after ${AI_MAX_RETRIES + 1} attempts — marking as unvalidated`);
      for (let j = 0; j < batch.length && i + j < rows.length; j++) {
        if (!results[i + j]) results[i + j] = { issues: ['AI validation unavailable'], confidence: 50 };
      }
    }
  }
  _aiAbortController = null;
  return results;
}

const Badge = ({ children, variant = 'info' }) => {
  const variants = {
    success: "bg-emerald-50 text-emerald-700 border-emerald-100",
    warning: "bg-amber-50 text-amber-700 border-amber-100",
    danger: "bg-rose-50 text-rose-700 border-rose-100",
    info: "bg-blue-50 text-blue-700 border-blue-100",
    ai: "bg-indigo-50 text-indigo-700 border-indigo-100",
  };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-black border uppercase tracking-widest whitespace-nowrap ${variants[variant]}`}>{children}</span>;
};

const FileUploadTrips = ({ onTripsCreated, drivers = [], preSelectDriver = '', uploadContext = 'operations' }) => {
  const [file, setFile] = useState(null);
  const [step, setStep] = useState('upload');
  const [parsedRows, setParsedRows] = useState([]);
  const [mappedTrips, setMappedTrips] = useState([]);
  const [aiResults, setAiResults] = useState([]);
  const [error, setError] = useState('');
  const [progressMsg, setProgressMsg] = useState('');
  const [progressPct, setProgressPct] = useState(0);
  const [aiEnabled, setAiEnabled] = useState(uploadContext !== 'reports');
  const [aiCanSkip, setAiCanSkip] = useState(false);
  const [detectedColumns, setDetectedColumns] = useState({});
  const [allColumnNames, setAllColumnNames] = useState([]);
  const [selectedCount, setSelectedCount] = useState(0);
  const [assignToDriver, setAssignToDriver] = useState(preSelectDriver || '');
  const [showAssignPrompt, setShowAssignPrompt] = useState(true);
  // Date override: 'file' = use dates from file, 'manual' = use a single date for all trips
  const [dateMode, setDateMode] = useState('file'); // 'file' | 'manual'
  const [manualDate, setManualDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  });
  const [fileDates, setFileDates] = useState([]); // unique sorted dates detected from file
  const forceCompleted = uploadContext === 'reports';
  const dropRef = useRef(null);
  const fileInputRef = useRef(null);
  const mountedRef = useRef(true);
  const processingRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (_aiAbortController) { _aiAbortController.abort(); _aiAbortController = null; }
    };
  }, []);

  const handleFileSelect = (selectedFile) => {
    setError('');
    if (!selectedFile) return;
    const ext = selectedFile.name.split('.').pop().toLowerCase();
    if (!['csv', 'xlsx', 'xls'].includes(ext)) {
      setError('Unsupported format. Please upload a .csv, .xlsx, or .xls file.');
      return;
    }
    setFile(selectedFile);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    handleFileSelect(e.dataTransfer.files[0]);
  };

  const handleInputChange = (e) => {
    if (e.target.files?.length) handleFileSelect(e.target.files[0]);
  };

  const processFile = async () => {
    if (!file) { setError('Please select a file first.'); return; }
    if (processingRef.current) return;
    processingRef.current = true;

    setStep('parsing');
    setProgressPct(5);
    setProgressMsg('Reading file...');
    setParsedRows([]);
    setMappedTrips([]);
    setAiResults([]);

    try {
      let rows;
      const ext = file.name.split('.').pop().toLowerCase();

      if (ext === 'csv') {
        setProgressMsg('Parsing CSV data...');
        const text = await file.text();
        rows = parseCSV(text);
      } else {
        setProgressMsg('Parsing spreadsheet...');
        const buffer = await file.arrayBuffer();
        rows = parseExcel(buffer);
      }
      
      // ALWAYS try to merge paired rows, regardless of file format
      rows = mergePairedActivityRows(rows);

      if (rows.length === 0) {
        setError('No data rows found in the file. Make sure it has a header row followed by trip data.');
        setStep('upload');
        return;
      }

      setProgressPct(10);
      setAllColumnNames(Object.keys(rows[0]));

      const colMap = {};
      Object.keys(COLUMN_ALIASES).forEach(field => {
        const idx = findColumn(Object.keys(rows[0]), COLUMN_ALIASES[field]);
        colMap[field] = idx !== -1 ? Object.keys(rows[0])[idx] : null;
      });
      
      // Detect Site Names
      const pickupSiteColIdx = findColumn(Object.keys(rows[0]), ['site name origin', 'pickup site', 'origin site', 'pickup location name']);
      const dropoffSiteColIdx = findColumn(Object.keys(rows[0]), ['site name destination', 'dropoff site', 'destination site', 'dropoff location name']);
      colMap.pickupSite = pickupSiteColIdx !== -1 ? Object.keys(rows[0])[pickupSiteColIdx] : null;
      colMap.dropoffSite = dropoffSiteColIdx !== -1 ? Object.keys(rows[0])[dropoffSiteColIdx] : null;

      setDetectedColumns(colMap);

      setProgressPct(12);

      const getTodayStr = () => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      };
      const today = getTodayStr();

      // First pass: determine client phone per patient using site-name facility detection
      // The client phone is the one at the HOME/residential location, NOT the facility
      const patientClientPhone = {}; // patientKey -> resolved client phone (digits only)

      const getSiteName = (row, m, side) => {
        if (side === 'pickup') {
          return m.pickupSiteName || row[colMap.pickupSite] || m.pickup || '';
        }
        return m.dropoffSiteName || row[colMap.dropoffSite] || m.dropoff || '';
      };

      const isLocationFacility = (row, m, side) => {
        const siteName = getSiteName(row, m, side);
        const address = side === 'pickup' ? m.pickup : m.dropoff;
        if (isFacilitySiteName(siteName)) return true;
        if (isFacilitySiteName(address)) return true;
        return false;
      };

      const isLocationHome = (row, m, side) => {
        const siteName = getSiteName(row, m, side);
        const address = side === 'pickup' ? m.pickup : m.dropoff;
        if (isHomeSiteName(siteName)) return true;
        if (isLikelyResidentialAddress(address, siteName)) return true;
        return false;
      };

      rows.forEach(row => {
        const m = mapColumns(row);
        const p = (m.patient || '').trim().toLowerCase();
        if (!p || patientClientPhone[p]) return;

        const puDigits = cleanPhone(m.pickupPhone);
        const doDigits = cleanPhone(m.dropoffPhone);
        if (!puDigits && !doDigits) return;

        const puIsFac = isLocationFacility(row, m, 'pickup');
        const doIsFac = isLocationFacility(row, m, 'dropoff');
        const puIsHomeLoc = isLocationHome(row, m, 'pickup');
        const doIsHomeLoc = isLocationHome(row, m, 'dropoff');

        if (puIsHomeLoc && !doIsHomeLoc && puDigits) {
          patientClientPhone[p] = puDigits;
        } else if (doIsHomeLoc && !puIsHomeLoc && doDigits) {
          patientClientPhone[p] = doDigits;
        } else if (puIsFac && !doIsFac && doDigits) {
          patientClientPhone[p] = doDigits;
        } else if (doIsFac && !puIsFac && puDigits) {
          patientClientPhone[p] = puDigits;
        }
      });

      // Second pass: for patients still unresolved, use phone frequency across all trips
      // (the phone that appears most often at non-facility sites for this patient)
      const unresolvedPatients = new Set();
      rows.forEach(row => {
        const m = mapColumns(row);
        const p = (m.patient || '').trim().toLowerCase();
        if (p && !patientClientPhone[p]) unresolvedPatients.add(p);
      });

      if (unresolvedPatients.size > 0) {
        const phoneFreq = {};
        rows.forEach(row => {
          const m = mapColumns(row);
          const p = (m.patient || '').trim().toLowerCase();
          if (!p || !unresolvedPatients.has(p)) return;
          const puDigits = cleanPhone(m.pickupPhone);
          const doDigits = cleanPhone(m.dropoffPhone);
          if (!phoneFreq[p]) phoneFreq[p] = {};
          if (puDigits && !isLocationFacility(row, m, 'pickup')) {
            phoneFreq[p][puDigits] = (phoneFreq[p][puDigits] || 0) + 1;
          }
          if (doDigits && !isLocationFacility(row, m, 'dropoff')) {
            phoneFreq[p][doDigits] = (phoneFreq[p][doDigits] || 0) + 1;
          }
        });
        Object.entries(phoneFreq).forEach(([p, freq]) => {
          if (patientClientPhone[p]) return;
          const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
          if (sorted.length > 0) patientClientPhone[p] = sorted[0][0];
        });
      }

      // Final fallback: for any still unresolved patients, pick the phone that is NOT
      // shared across multiple patients (shared = facility)
      const phoneToPatients = {};
      rows.forEach(row => {
        const m = mapColumns(row);
        const p = (m.patient || '').trim().toLowerCase();
        if (!p) return;
        const puDigits = cleanPhone(m.pickupPhone);
        const doDigits = cleanPhone(m.dropoffPhone);
        if (puDigits) {
          if (!phoneToPatients[puDigits]) phoneToPatients[puDigits] = new Set();
          phoneToPatients[puDigits].add(p);
        }
        if (doDigits) {
          if (!phoneToPatients[doDigits]) phoneToPatients[doDigits] = new Set();
          phoneToPatients[doDigits].add(p);
        }
      });
      rows.forEach(row => {
        const m = mapColumns(row);
        const p = (m.patient || '').trim().toLowerCase();
        if (!p || patientClientPhone[p]) return;
        const puDigits = cleanPhone(m.pickupPhone);
        const doDigits = cleanPhone(m.dropoffPhone);
        const puShared = puDigits && phoneToPatients[puDigits] && phoneToPatients[puDigits].size > 1;
        const doShared = doDigits && phoneToPatients[doDigits] && phoneToPatients[doDigits].size > 1;
        if (puDigits && !puShared) patientClientPhone[p] = puDigits;
        else if (doDigits && !doShared) patientClientPhone[p] = doDigits;
        else if (puDigits) patientClientPhone[p] = puDigits;
        else if (doDigits) patientClientPhone[p] = doDigits;
      });

      // Parse a distance string like "5.2mi" or "5.2 mi" or "5.2" into a number
      const parseDistance = (val) => {
        if (!val) return '';
        const cleaned = String(val).replace(/[^0-9.]/g, '');
        const num = parseFloat(cleaned);
        return isNaN(num) ? String(val) : String(num);
      };

      const mapped = rows.map((row, idx) => {
        const m = mapColumns(row);
        const pKey = (m.patient || '').trim().toLowerCase();
        
        let patientPhone = patientClientPhone[pKey] || m.pickupPhone || m.dropoffPhone || '';

        // Smart phone detection: if pickup is a facility, client phone is likely dropoffPhone (home), and vice versa
        if (!patientClientPhone[pKey] && m.pickupPhone && m.dropoffPhone) {
          const pickupIsFacility = isFacilitySiteName(m.pickupSiteName || '') || isFacilitySiteName(m.pickup || '');
          const dropoffIsFacility = isFacilitySiteName(m.dropoffSiteName || '') || isFacilitySiteName(m.dropoff || '');
          if (pickupIsFacility && !dropoffIsFacility) {
            patientPhone = m.dropoffPhone;
          } else if (dropoffIsFacility && !pickupIsFacility) {
            patientPhone = m.pickupPhone;
          }
        }
        if (patientPhone && !patientClientPhone[pKey]) {
          const digits = cleanPhone(patientPhone);
          const isShared = phoneToPatients[digits] && phoneToPatients[digits].size > 1;
          if (isShared) patientPhone = '';
        }

        const notes = [m.notes, row['Pickup Comments'], row['Dropoff Comments'], row['Comments'], row['Message']]
          .filter(Boolean)
          .join(' | ');

        // Extract from ANY possible source: column-mapped, _agape_* fields, common raw keys
        const extract = (...sources) => {
          for (const src of sources) {
            if (src !== undefined && src !== null && src !== '') return String(src).trim();
          }
          return '';
        };

        // Parse signature from YES/NO text or boolean
        const parseSig = (val) => {
          if (typeof val === 'boolean') return val;
          if (!val) return false;
          return String(val).toUpperCase() === 'YES' || String(val).toUpperCase() === 'Y' || String(val).toUpperCase() === 'TRUE' || String(val) === '1';
        };

        // Extract distance from multiple possible sources
        const distance = parseDistance(
          extract(
            m.distance,
            row['_agape_distance'],
            row['Distance'],
            row['Miles'],
            row['Mileage'],
            row['distance'],
            row['miles'],
            row['Trip Distance'],
            row['Estimated Miles'],
            row['Est Miles'],
          )
        );

        // Extract odometer values, parsing as integers
        const pickupOdo = extract(
          row['Pickup Odometer'],
          row['_agape_pickupOdo'],
          m.pickupOdometer,
          m.odometer,
          row['pickupOdometer'],
          row['Start Odometer'],
          row['PU Odo'],
        );
        const dropoffOdo = extract(
          row['Dropoff Odometer'],
          row['_agape_dropoffOdo'],
          m.dropoffOdometer,
          row['dropoffOdometer'],
          row['End Odometer'],
          row['DO Odo'],
        );

        // Extract arrival times
        const arrivalTime = extract(
          row['Pickup Arrival'],
          row['_agape_pickupArrival'],
          m.pickupArrival,
          row['arrivalTime'],
          row['Arrival Time'],
          row['PU Arrival'],
        );
        const arrivalDropoffTime = extract(
          row['Dropoff Arrival'],
          row['_agape_dropoffArrival'],
          m.dropoffArrival,
          row['arrivalDropoffTime'],
          row['Dropoff Time'],
          row['DO Arrival'],
        );

        // Extract driver info
        const driverName = extract(row['_agape_driverName'], m.driver, row['Driver'], row['Driver Name'], row['driver']);
        const completedVehicle = extract(row['_agape_vehicle'], m.completedVehicle, m.vehicle, row['Vehicle'], row['vehicle']);
        const driverEmail = extract(m.driverEmail, row['Driver Email'], row['driverEmail'], row['driver_email']);

        // Extract timestamps
        const completedAt = extract(m.completedAt, row['Completed At'], row['completedAt'], row['Completion Time']);
        const startTime = extract(row['Departure Time'], m.startTime, row['Start Time'], row['startTime'], row['Started At']);
        const departedPickupTime = extract(row['Departure Time'], m.departedPickupTime, row['Departed Pickup'], row['departedPickupTime']);
        const hasInOut = [
          m.time,
          m.dropoffTime,
          m.type,
          m.notes,
          row['IN/OUT'],
          row['In/Out'],
          row['In Out'],
          row['Trip Type'],
          row['Service Type'],
          ...Object.values(row || {}),
        ].some(hasInOutMarker);

        // Date: use mapped value, or try raw keys
        let date = normalizeDateValue(m.date);
        if (!date) date = normalizeDateValue(row['Date'] || row['date'] || row['Trip Date'] || row['Service Date'] || '');
        if (!date) date = today;

        const pickupAddr = extract(row['Pickup Address'], m.pickup, row['pickup'], row['Pickup']);
        const dropoffAddr = extract(row['Dropoff Address'], m.dropoff, row['dropoff'], row['Dropoff']);

        return {
          // --- IDENTIFIERS ---
          id: row['Trip ID'] || row['TripID'] || row['tripid'] || row['ID'] || row['id'] || m.bookingId || row['Booking Id'] || row['Booking ID'] || row['BookingId'] || row['Event Id'] || row['Event ID'] || `TRIP-${Date.now()}-${idx}`,
          bookingId: extract(m.bookingId, row['Booking Id'], row['Booking ID'], row['bookingId'], row['Booking'], row['Confirmation #']),
          patient: extract(m.patient, row['Client Name'], row['Client'], row['Patient'], row['patient'], 'Unknown'),
          patientPhone: patientPhone || extract(m.patientPhone, row['Patient Phone'], row['patientPhone']),

          // --- DATES & TIMES ---
          date,
          time: extract(m.time, row['Pickup Time'], row['Schedule Time'], row['scheduled'], row['time'], row['Time']),
          dropoffTime: extract(m.dropoffTime, row['Dropoff Time'], row['Dropoff Time (Return)'], row['return']),

          // --- ADDRESSES ---
          pickup: pickupAddr,
          dropoff: dropoffAddr,
          pickupSiteName: extract(colMap.pickupSite ? row[colMap.pickupSite] : '', m.pickupSiteName, row['Pickup Site'], row['pickupSiteName'], row['Origin Site'], row['Pickup Location Name']),
          dropoffSiteName: extract(colMap.dropoffSite ? row[colMap.dropoffSite] : '', m.dropoffSiteName, row['Dropoff Site'], row['dropoffSiteName'], row['Destination Site']),
          pickupPhone: extract(m.pickupPhone, row['Pickup Phone'], row['pickupPhone']),
          dropoffPhone: extract(m.dropoffPhone, row['Dropoff Phone'], row['dropoffPhone']),

          // --- TYPE & NOTES ---
          type: extract(m.type, row['Space Types'], row['Type'], row['Service Type'], row['Req'], row['req']),
          purpose: extract(row['Purpose'], row['purpose']),
          providerName: extract(row['Provider Name'], row['providerName']),
          directDistance: extract(row['Direct Distance'], row['directDistance']),
          notes,
          inOutTrip: hasInOut,
          tripKind: hasInOut ? 'IN_OUT' : '',
          inOutStayWithClient: hasInOut,
          inOutWaitMinutes: hasInOut ? IN_OUT_WAIT_MINUTES : null,

          // --- STATUS ---
          status: extract(row['Status'], row['status'], forceCompleted ? 'Completed' : 'Unassigned'),
          driverId: null,
          driverName,
          driverEmail,
          completedVehicle,

          // --- ODOMETER & SIGNATURE ---
          pickupOdometer: cleanOdometer(pickupOdo),
          dropoffOdometer: cleanOdometer(dropoffOdo),
          paperSignatureConfirmed: !!(cleanOdometer(pickupOdo) || cleanOdometer(dropoffOdo)) || [true, 'true', 'yes', 'y', '1', 1, 'received', 'rider signature received'].some(val => String(extract(m.paperSignatureConfirmed, row['Signature Captured'], row['Signature Captured?'], row['signature'])).toLowerCase().includes(String(val))),

          // --- TIMES (arrival/departure/completion) ---
          arrivalTime,
          arrivalDropoffTime,
          departedPickupTime,
          completedAt,
          startTime,

          // --- MILEAGE ---
          distance,



          // --- CANCELLATION ---
          cancelledAt: extract(m.cancelledAt, row['Cancelled At'], row['cancelledAt']),
          cancellationReason: extract(m.cancellationReason, row['Cancellation Reason'], row['cancellationReason'], row['Reason'], row['reason']),
          cancelledBy: extract(row['Cancelled By'], row['cancelledBy']),

          // --- ACTIVITY / TRAVEL TIME (Agape report extras) ---
          travelTime: extract(row['_agape_travelTime'], row['Travel Time'], row['travelTime']),

          // --- RAW DATA (always preserved) ---
          _originalRow: row,
          _hasIssues: false,
          _issues: [],
          _confidence: 100,
        };
      });

      const pairedMapped = annotateInOutPairs(mapped);
      setMappedTrips(pairedMapped);
      setParsedRows(rows);
      setSelectedCount(pairedMapped.length);
      // Detect unique dates from file
      const datesInFile = [...new Set(pairedMapped.map(t => t.date).filter(Boolean))].sort();
      setFileDates(datesInFile);
      // Default to 'file' mode if dates found, else 'manual'
      setDateMode(datesInFile.length > 0 ? 'file' : 'manual');

      const geminiConfig = GEMINI_API_CONFIG();

      if (aiEnabled && geminiConfig.apiKey) {
        const aiResults = await aiValidate(pairedMapped, (msg, pct, canSkip) => {
          if (!mountedRef.current) return;
          setProgressMsg(msg);
          setProgressPct(pct);
          setAiCanSkip(!!canSkip);
        });

        if (!mountedRef.current) return;
        const updated = pairedMapped.map((trip, idx) => {
          const ai = aiResults[idx];
          if (ai && ai.issues?.length > 0) {
            return { ...trip, _hasIssues: true, _issues: ai.issues, _confidence: ai.confidence || 100 };
          }
          return { ...trip, _confidence: ai?.confidence || 100 };
        });

        if (!mountedRef.current) return;
        setMappedTrips(updated);
        setAiResults(aiResults);
        setProgressMsg('AI validation complete');
        setProgressPct(90);
      } else {
        setProgressMsg('Validation complete');
        setProgressPct(90);
      }

      setStep('review');
    } catch (err) {
      if (!mountedRef.current) return;
      setError(`Processing error: ${err.message}`);
      setStep('upload');
    } finally {
      processingRef.current = false;
    }
  };

  const confirmImport = () => {
    const tripSource = uploadContext === 'reports' ? 'report_upload' : 'dispatch_upload';
    
    const effectiveDateMode = fileDates.length > 0 ? dateMode : 'manual';
    if (uploadContext === 'reports' && effectiveDateMode === 'manual' && !manualDate) {
      setError('Please select a service date for this file before importing.');
      return;
    }

    const cleanTrips = mappedTrips.map(({ _originalRow, _hasIssues, _issues, _confidence, ...trip }) => {
      const finalDriverId = trip.driverId || assignToDriver || _originalRow['Driver ID'] || null;
      let newStatus = trip.status;
      
      if (forceCompleted) {
        newStatus = 'Completed';
      } else if (finalDriverId) {
        const driver = drivers.find(d => d.id === finalDriverId);
        if (newStatus === 'Unassigned' && driver) {
          newStatus = 'Assigned';
        }
      }

      // Apply date override: use manualDate if dateMode is 'manual', else use trip's file date
      const resolvedDate = effectiveDateMode === 'manual' ? manualDate : (trip.date || (() => {
        for (const field of ['scheduledDate', 'scheduleDate', 'tripDate']) {
          if (trip[field]) {
            const d = new Date(trip[field]);
            if (!isNaN(d.getTime())) {
              return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            }
          }
        }
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      })());

      const dateKey = resolvedDate;

      const baseTrip = {
        ...trip,
        source: tripSource,
        dateKey,
        status: newStatus,
        date: dateKey,
        patient: trip.patient || trip.clientName || trip.memberName || 'Unknown Client',
        pickup: trip.pickup || trip.pickupAddress || trip.originAddress || '',
        dropoff: trip.dropoff || trip.dropoffAddress || trip.destinationAddress || '',
        time: trip.time || trip.scheduledTime || '',
        updatedAtLocal: new Date().toISOString(),
      };

      if (finalDriverId) {
        return { ...baseTrip, driverId: finalDriverId };
      }
      return baseTrip;
    }).filter((trip) => (trip.patient && trip.patient !== 'Unknown Client') || trip.pickup || trip.dropoff);
    if (cleanTrips.length === 0) {
      setError('No valid trips found. Each trip needs a real client name, service date, and pickup or dropoff address.');
      return;
    }
    onTripsCreated(cleanTrips);
  };

  const totalSelected = mappedTrips.length;
  const withIssues = mappedTrips.filter(t => t._hasIssues).length;
  const avgConfidence = mappedTrips.length > 0
    ? Math.round(mappedTrips.reduce((s, t) => s + (t._confidence || 100), 0) / mappedTrips.length)
    : 100;
  const uniqueDates = [...new Set(mappedTrips.map(t => t.date).filter(Boolean))].sort();

  return (
    <div className="space-y-6">
      {step === 'upload' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-8">
          <div className="max-w-2xl mx-auto">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 mb-2">Upload Trips</h2>
            <p className="text-sm sm:text-base text-slate-600 mb-2">Import from CSV (.csv) or Excel (.xlsx / .xls).</p>
            <p className="text-xs sm:text-xs text-slate-500 mb-6 flex items-center gap-1"><BrainCircuit size={12} className="text-indigo-500 shrink-0" /> AI auto-validates addresses, times, and fields for accuracy.</p>

            {error && (
              <div className="p-3 sm:p-4 bg-rose-50 border border-rose-200 rounded-lg flex gap-3 items-start mb-6">
                <AlertCircle size={18} className="text-rose-600 shrink-0 mt-0.5" />
                <p className="text-rose-700 text-xs sm:text-sm">{error}</p>
              </div>
            )}

            <div ref={dropRef} className="border-2 border-dashed border-slate-300 rounded-xl p-6 sm:p-12 text-center mb-6 hover:border-blue-400 hover:bg-blue-50/30 transition cursor-pointer" onDragOver={(e) => e.preventDefault()} onDrop={handleDrop} onClick={() => document.getElementById('fu-file-input')?.click()}>
              <div className="w-12 sm:w-16 h-12 sm:h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
                <Upload size={24} className="text-blue-600" />
              </div>
              <h3 className="text-base sm:text-lg font-semibold text-slate-900 mb-1">Drag & drop your file here</h3>
              <p className="text-slate-500 text-xs sm:text-sm mb-3 sm:mb-4">or click to browse</p>
              <p className="text-xs sm:text-sm text-slate-400 font-medium">Supports .csv, .xlsx, .xls &bull; Auto-detects columns</p>
              <input id="fu-file-input" ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleInputChange} className="hidden" />
            </div>

            {file && (
              <div className="flex items-center gap-3 p-3 sm:p-4 bg-blue-50 border border-blue-200 rounded-xl mb-6">
                <FileText size={20} className="text-blue-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-900 text-sm truncate">{file.name}</p>
                  <p className="text-xs sm:text-xs text-slate-500">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
                <button onClick={() => setFile(null)} className="text-slate-400 hover:text-rose-600 p-1 shrink-0">&times;</button>
              </div>
            )}

            <div className="flex items-center gap-3 mb-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={aiEnabled} onChange={(e) => setAiEnabled(e.target.checked)} className="w-4 h-4 accent-indigo-600" />
                <span className="text-xs sm:text-sm font-medium text-slate-700 flex items-center gap-1"><BrainCircuit size={14} className="text-indigo-500 shrink-0" /> AI validation</span>
              </label>
            </div>

            <button onClick={processFile} disabled={!file} className="w-full py-3 sm:py-3.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm text-sm">
              <Zap size={18} /> Process &amp; Validate
            </button>

            <details className="mt-4 sm:mt-6 text-xs sm:text-sm text-slate-500">
              <summary className="cursor-pointer font-medium text-slate-600 hover:text-slate-800">Column name guide</summary>
              <div className="mt-3 p-3 sm:p-4 bg-slate-50 rounded-lg text-xs sm:text-xs font-mono text-slate-600 space-y-1">
                <p><span className="font-bold text-slate-800">Auto-detected</span> &mdash; just use common labels like:</p>
                <p className="pl-3">Client Name, Pickup Address, Dropoff Address, Phone, Pickup Time, etc.</p>
                <p className="mt-2 text-slate-400">Any column layout is supported.</p>
              </div>
            </details>
          </div>
        </div>
      )}

      {step === 'parsing' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 sm:p-12 text-center">
          <div className="max-w-sm mx-auto">
            <div className="relative w-16 sm:w-20 h-16 sm:h-20 mx-auto mb-4 sm:mb-6">
              <div className="absolute inset-0 border-4 border-slate-100 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-blue-600 rounded-full border-t-transparent animate-spin"></div>
              <FileText className="absolute inset-0 m-auto text-blue-600 animate-pulse" size={24} />
            </div>
            <h3 className="text-lg sm:text-xl font-bold text-slate-900 mb-2">Processing File</h3>
            <p className="text-slate-500 text-xs sm:text-sm mb-4">{progressMsg}</p>
            <div className="w-full bg-slate-100 rounded-full h-2 mb-4">
              <div className="bg-blue-600 h-2 rounded-full transition-all duration-500" style={{ width: `${progressPct}%` }}></div>
            </div>
            <div className="space-y-1.5 text-xs sm:text-xs text-left text-slate-500">
              <p className="flex items-center gap-2"><CheckCircle2 size={12} className="text-emerald-500 shrink-0" /> File read successfully</p>
              <p className="flex items-center gap-2">{progressPct >= 12 ? <CheckCircle2 size={12} className="text-emerald-500 shrink-0" /> : <Loader size={12} className="animate-spin text-blue-500 shrink-0" />} Rows parsed &amp; columns mapped</p>
              <p className="flex items-center gap-2">{progressPct >= 15 ? <Loader size={12} className={`animate-spin ${aiEnabled ? 'text-indigo-500' : 'text-slate-300'} shrink-0`} /> : <Info size={12} className="text-slate-300 shrink-0" />} {aiEnabled ? 'AI validating data...' : 'Ready for review'}</p>
            </div>
            {aiCanSkip && (
              <button
                onClick={requestAiSkip}
                className="mt-4 px-4 py-2 rounded-lg bg-slate-100 text-slate-600 text-xs font-semibold hover:bg-slate-200 active:scale-95 transition-all"
              >
                Skip AI Validation
              </button>
            )}
          </div>
        </div>
      )}

      {step === 'review' && (
        <div className="space-y-4 sm:space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6">
            <div className="flex items-start gap-3 sm:gap-4 mb-4 sm:mb-6">
              <div className={`w-10 sm:w-12 h-10 sm:h-12 rounded-xl flex items-center justify-center shrink-0 ${withIssues === 0 ? 'bg-emerald-100' : 'bg-amber-100'}`}>
                {withIssues === 0 ? <CheckCircle2 size={22} className="text-emerald-600" /> : <AlertTriangle size={22} className="text-amber-600" />}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg sm:text-xl font-bold text-slate-900">Import Review</h3>
                <p className="text-xs sm:text-sm text-slate-500 truncate">
                  {mappedTrips.length} trip{ mappedTrips.length !== 1 ? 's' : '' } extracted
                  {withIssues > 0 ? ` — ${withIssues} with warnings` : ' — all clean' }
                </p>
                {fileDates.length > 0 && (
                  <p className="text-xs text-slate-400 mt-1">
                    Service date{fileDates.length !== 1 ? 's' : ''}: {fileDates.join(', ')}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4 mb-4 sm:mb-6">
              <div className="bg-blue-50 p-3 sm:p-4 rounded-xl">
                <p className="text-xs sm:text-xs text-blue-600 font-semibold mb-1">Total</p>
                <p className="text-lg sm:text-2xl font-bold text-blue-700">{mappedTrips.length}</p>
                <p className="text-xs sm:text-xs text-blue-500">from file</p>
              </div>
              <div className="bg-emerald-50 p-3 sm:p-4 rounded-xl">
                <p className="text-xs sm:text-xs text-emerald-600 font-semibold mb-1">Clean</p>
                <p className="text-lg sm:text-2xl font-bold text-emerald-700">{mappedTrips.length - withIssues}</p>
                <p className="text-xs sm:text-xs text-emerald-500">no issues</p>
              </div>
              <div className={`p-3 sm:p-4 rounded-xl ${withIssues > 0 ? 'bg-amber-50' : 'bg-slate-50'}`}>
                <p className="text-xs sm:text-xs text-slate-600 font-semibold mb-1">Warnings</p>
                <p className={`text-lg sm:text-2xl font-bold ${withIssues > 0 ? 'text-amber-600' : 'text-slate-400'}`}>{withIssues}</p>
                <p className="text-xs sm:text-xs text-slate-500">flagged</p>
              </div>
              <div className="bg-indigo-50 p-3 sm:p-4 rounded-xl">
                <p className="text-xs sm:text-xs text-indigo-600 font-semibold mb-1">AI Confidence</p>
                <p className="text-lg sm:text-2xl font-bold text-indigo-700">{avgConfidence}%</p>
                <p className="text-xs sm:text-xs text-indigo-500">avg score</p>
              </div>
            </div>

            {allColumnNames.length > 0 && (
              <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-slate-50 rounded-xl">
                <p className="text-xs sm:text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1"><Info size={12} /> Detected columns:</p>
                <div className="flex flex-wrap gap-1 sm:gap-2">
                  {Object.entries(detectedColumns).map(([field, col]) => (
                    <span key={field} className={`text-xs sm:text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 rounded font-semibold ${col ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                      {field}: {col || 'not found'}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {allColumnNames.length > 0 && (
              <div className="mb-3 sm:mb-4 flex flex-col sm:flex-row items-start sm:items-center gap-1 sm:gap-2">
                <span className="text-xs sm:text-xs font-semibold text-slate-600">All columns:</span>
                <div className="flex flex-wrap gap-1">
                  {allColumnNames.map((col, idx) => (
                    <span key={idx} className="text-xs sm:text-xs px-1 sm:px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded font-mono">{col}</span>
                  ))}
                </div>
              </div>
            )}

            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-xs sm:text-xs">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-2 sm:px-3 py-1.5 sm:py-2.5 text-left font-semibold text-slate-600">#</th>
                    <th className="px-2 sm:px-3 py-1.5 sm:py-2.5 text-left font-semibold text-slate-600">Client</th>
                    <th className="px-2 sm:px-3 py-1.5 sm:py-2.5 text-left font-semibold text-slate-600">Date</th>
                    <th className="px-2 sm:px-3 py-1.5 sm:py-2.5 text-left font-semibold text-slate-600">Pickup</th>
                    <th className="px-2 sm:px-3 py-1.5 sm:py-2.5 text-left font-semibold text-slate-600">Dropoff</th>
                    <th className="px-2 sm:px-3 py-1.5 sm:py-2.5 text-left font-semibold text-slate-600 hidden sm:table-cell">Time</th>
                    <th className="px-2 sm:px-3 py-1.5 sm:py-2.5 text-left font-semibold text-slate-600">Assign To</th>
                    <th className="px-2 sm:px-3 py-1.5 sm:py-2.5 text-left font-semibold text-slate-600">Issues</th>
                    <th className="px-2 sm:px-3 py-1.5 sm:py-2.5 text-left font-semibold text-slate-600">Conf.</th>
                  </tr>
                </thead>
                <tbody>
                  {mappedTrips.map((trip, idx) => (
                    <tr key={idx} className={`border-b border-slate-100 hover:bg-slate-50 ${trip._hasIssues ? 'bg-amber-50/50' : ''}`}>
                      <td className="px-2 sm:px-3 py-1.5 sm:py-2.5 font-mono text-slate-500">{idx + 1}</td>
                      <td className="px-2 sm:px-3 py-1.5 sm:py-2.5 text-xs sm:text-xs font-semibold text-slate-900 whitespace-nowrap">{trip.patient}</td>
                      <td className="px-2 sm:px-3 py-1.5 sm:py-2.5 text-xs sm:text-xs text-slate-600 whitespace-nowrap">{trip.date || <span className="text-rose-400 italic">missing</span>}</td>
                      <td className="px-2 sm:px-3 py-1.5 sm:py-2.5 text-xs sm:text-xs text-slate-600 max-w-[80px] sm:max-w-[160px] truncate" title={trip.pickup}>{trip.pickup || <span className="text-rose-400 italic">missing</span>}</td>
                      <td className="px-2 sm:px-3 py-1.5 sm:py-2.5 text-xs sm:text-xs text-slate-600 max-w-[80px] sm:max-w-[160px] truncate" title={trip.dropoff}>{trip.dropoff || <span className="text-rose-400 italic">missing</span>}</td>
                      <td className="px-2 sm:px-3 py-1.5 sm:py-2.5 text-xs sm:text-xs text-slate-600 hidden sm:table-cell">{trip.time}</td>
                      <td className="px-2 sm:px-3 py-1.5 sm:py-2.5">
                        <select 
                          value={trip.driverId || ''} 
                          onChange={(e) => {
                            setMappedTrips(prev => prev.map((t, i) => i === idx ? { ...t, driverId: e.target.value } : t));
                          }}
                          className="w-full bg-white border border-slate-200 rounded px-1.5 py-1 text-xs font-bold text-slate-700 outline-none focus:border-blue-500"
                        >
                          <option value="">Auto/Unassigned</option>
                          {drivers.map(d => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 sm:px-3 py-1.5 sm:py-2.5">
                        {trip._hasIssues ? (
                          <div className="flex flex-col gap-0.5">
                            {trip._issues.slice(0, 1).map((issue, i) => (
                              <span key={i} className="text-xs sm:text-xs text-amber-700 font-medium flex items-center gap-1"><AlertTriangle size={8} /> {issue}</span>
                            ))}
                            {trip._issues.length > 1 && <span className="text-xs sm:text-xs text-amber-500">+{trip._issues.length - 1} more</span>}
                          </div>
                        ) : <span className="text-emerald-500 text-xs sm:text-xs">&mdash;</span>}
                      </td>
                      <td className="px-2 sm:px-3 py-1.5 sm:py-2.5">
                        <Badge variant={trip._confidence >= 90 ? 'success' : trip._confidence >= 70 ? 'warning' : 'danger'}>{trip._confidence}%</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ── Date Assignment Panel ── */}
            <div className="mt-4 sm:mt-6 p-4 bg-violet-50 border border-violet-200 rounded-2xl">
              <div className="flex items-center gap-2 mb-3">
                <Calendar size={18} className="text-violet-600 shrink-0" />
                <span className="text-sm font-black text-slate-900">Service Date</span>
              </div>
              {fileDates.length > 0 ? (
                <div className="space-y-3">
                  <p className="text-xs text-violet-700 font-semibold">
                    This file contains date{fileDates.length > 1 ? 's' : ''}: <span className="font-black">{fileDates.join(', ')}</span>
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <button
                      onClick={() => setDateMode('file')}
                      className={`flex-1 py-2.5 px-4 rounded-xl border-2 text-xs font-bold transition flex items-center justify-center gap-2 ${
                        dateMode === 'file'
                          ? 'border-violet-500 bg-violet-600 text-white shadow-sm'
                          : 'border-violet-200 bg-white text-violet-700 hover:bg-violet-50'
                      }`}
                    >
                      <FileSpreadsheet size={14} /> Use dates from file
                    </button>
                    <button
                      onClick={() => setDateMode('manual')}
                      className={`flex-1 py-2.5 px-4 rounded-xl border-2 text-xs font-bold transition flex items-center justify-center gap-2 ${
                        dateMode === 'manual'
                          ? 'border-violet-500 bg-violet-600 text-white shadow-sm'
                          : 'border-violet-200 bg-white text-violet-700 hover:bg-violet-50'
                      }`}
                    >
                      <Calendar size={14} /> Set date manually
                    </button>
                  </div>
                  {dateMode === 'manual' && (
                    <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                      <input
                        type="date"
                        value={manualDate}
                        onChange={e => setManualDate(e.target.value)}
                        className="w-full px-4 py-2.5 border-2 border-violet-300 rounded-xl text-sm font-bold text-slate-800 focus:outline-none focus:border-violet-500 bg-white"
                      />
                      <p className="text-xs text-violet-600 mt-1.5 font-medium">All {mappedTrips.length} trips will be assigned to this date.</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-slate-500">No dates detected in file — set the service date for all trips:</p>
                  <input
                    type="date"
                    value={manualDate}
                    onChange={e => setManualDate(e.target.value)}
                    className="w-full px-4 py-2.5 border-2 border-violet-300 rounded-xl text-sm font-bold text-slate-800 focus:outline-none focus:border-violet-500 bg-white"
                  />
                </div>
              )}
            </div>

            {uploadContext !== 'reports' && (
            <div className="mt-4 sm:mt-6 p-4 bg-blue-50 border border-blue-200 rounded-2xl">
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-black text-slate-900 flex items-center gap-2">
                  <Truck size={18} className="text-blue-600" /> Assign Trips to Drivers
                </label>
                <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-blue-100">
                  <input type="checkbox" id="assign-prompt" checked={showAssignPrompt} onChange={(e) => setShowAssignPrompt(e.target.checked)} className="w-4 h-4 accent-blue-600" />
                  <label htmlFor="assign-prompt" className="text-xs font-bold text-blue-600 uppercase tracking-widest cursor-pointer">Enable Assignment</label>
                </div>
              </div>

              {showAssignPrompt ? (
                <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                  <p className="text-xs text-blue-600 font-bold uppercase tracking-widest opacity-70">Bulk Assign All Uploaded Trips:</p>
                  <div className="flex gap-2">
                    <select value={assignToDriver} onChange={(e) => setAssignToDriver(e.target.value)} className="flex-1 px-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:border-blue-500 text-sm bg-white font-bold shadow-sm">
                      <option value="">Leave Most as {forceCompleted ? 'Unassigned (Driver Unknown)' : 'Unassigned'} (Or use per-trip selector below)</option>
                      {drivers.map(d => (
                         <option key={d.id} value={d.id}>{d.name} — {d.vehicle || 'No vehicle'} (Active)</option>
                      ))}
                    </select>
                    {assignToDriver && (
                      <button onClick={() => setAssignToDriver('')} className="px-3 py-2 text-slate-400 hover:text-rose-600 border border-slate-200 bg-white rounded-xl transition active:scale-95">
                        <X size={18} />
                      </button>
                    )}
                  </div>
                  
                  {assignToDriver && (
                    <p className="text-xs text-emerald-700 font-black flex items-center gap-1.5 uppercase tracking-wider">
                      <CheckCircle2 size={12} /> All {mappedTrips.length} trips will default to {drivers.find(d => d.id === assignToDriver)?.name}
                    </p>
                  )}
                  <p className="text-xs text-slate-500 font-bold italic">Tip: You can still override individual trips in the table below.</p>
                </div>
              ) : forceCompleted ? (
                <div className="p-4 border-2 border-dashed border-emerald-200 bg-emerald-50 rounded-xl text-center">
                  <p className="text-xs font-bold text-emerald-700 flex items-center justify-center gap-2"><CheckCircle2 size={14}/> Trips will be imported as Completed.</p>
                </div>
              ) : (
                <div className="p-4 border-2 border-dashed border-blue-100 rounded-xl text-center">
                  <p className="text-xs font-bold text-slate-400">Assignment disabled. Trips will be imported as Unassigned.</p>
                </div>
              )}
            </div>
            )}

            <div className="mt-4 sm:mt-6 flex flex-col sm:flex-row gap-2 sm:gap-3">
              <button onClick={() => { setStep('upload'); setFile(null); setMappedTrips([]); setParsedRows([]); setError(''); if (fileInputRef.current) fileInputRef.current.value = ''; }} className="w-full sm:flex-1 py-3 border border-slate-300 text-slate-700 font-bold rounded-xl hover:bg-slate-50 transition text-sm">
                Cancel
              </button>
              <button onClick={confirmImport} className="w-full sm:flex-1 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition flex items-center justify-center gap-2 shadow-sm text-sm">
                <CheckCircle2 size={18} />
                Import {totalSelected} {forceCompleted ? 'Completed ' : ''}Trips
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FileUploadTrips;
