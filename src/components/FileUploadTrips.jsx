import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Upload, AlertCircle, Loader, CheckCircle2, FileText, Zap, BrainCircuit, AlertTriangle, Info, ArrowRight, Download, Truck, X } from 'lucide-react';
import { GEMINI_API_CONFIG } from '../config/firebase';

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
  bookingId: ['booking id', 'bookingid', 'reservation id', 'trip id', 'booking number', 'confirmation id'],
  patient: ['client', 'client name', 'passenger', 'passenger name', 'rider', 'customer', 'patient name', 'name', 'rider name', 'guest', 'user', 'person'],
  pickup: ['pickup', 'pickup address', 'pickup_address', 'pick up', 'origin', 'from', 'from address', 'from_address', 'pu', 'pickup location', 'start address', 'start'],
  dropoff: ['dropoff', 'dropoff address', 'dropoff_address', 'drop off', 'destination', 'to', 'to address', 'to_address', 'do', 'dest', 'dropoff location', 'end address', 'end'],
  pickupPhone: ['pickup phone', 'pickup phone number', 'pickup_phone', 'phone', 'client phone', 'passenger phone', 'primary phone', 'phone number', 'tel', 'telephone', 'contact'],
  dropoffPhone: ['dropoff phone', 'dropoff phone number', 'dropoff_phone', 'facility phone', 'destination phone', 'location phone', 'secondary phone'],
  time: ['time', 'pickup time', 'pickup_time', 'schedule time', 'scheduled time', 'appt time', 'appt', 'appointment time', 'timestamp', 'slot', 'scheduled'],
  dropoffTime: ['requested late dropoff', 'requested time dropoff', 'dropoff time', 'late dropoff', 'return time'],
  date: ['date', 'trip date', 'service date', 'requested date'],
  type: ['type', 'trip type', 'am/pm', 'run', 'shift', 'route type', 'service type', 'schedule type', 'trip_type'],
  notes: ['notes', 'special instructions', 'instructions', 'comment', 'comments', 'note', 'memo', 'remarks', 'additional info', 'info', 'pickup comments', 'dropoff comments', 'message', 'purpose'],
};

const cleanPhone = (p) => (p || '').replace(/[^0-9]/g, '');

function normalizeDateValue(value) {
  if (!value) return '';
  const raw = String(value).trim();
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
  }
  const simple = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!simple) return '';
  const month = String(simple[1]).padStart(2, '0');
  const day = String(simple[2]).padStart(2, '0');
  const year = simple[3].length === 2 ? `20${simple[3]}` : simple[3];
  return `${year}-${month}-${day}`;
}

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

function parseCSV(text) {
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
  const headerLine = lines[0];
  const headers = [];
  let h = ''; let hq = false;
  for (let i = 0; i < headerLine.length; i++) {
    const ch = headerLine[i];
    if (hq) { if (ch === '"' && headerLine[i + 1] === '"') { h += '"'; i++; } else if (ch === '"') { hq = false; } else { h += ch; } }
    else { if (ch === '"') { hq = true; } else if (ch === ',') { headers.push(h.trim()); h = ''; } else { h += ch; } }
  }
  headers.push(h.trim());

  const data = [];
  for (let r = 1; r < lines.length; r++) {
    if (!lines[r].trim()) continue;
    const values = [];
    let v = ''; let vq = false;
    for (let i = 0; i < lines[r].length; i++) {
      const ch = lines[r][i];
      if (vq) { if (ch === '"' && lines[r][i + 1] === '"') { v += '"'; i++; } else if (ch === '"') { vq = false; } else { v += ch; } }
      else { if (ch === '"') { vq = true; } else if (ch === ',') { values.push(v.trim()); v = ''; } else { v += ch; } }
    }
    values.push(v.trim());
    const row = {};
    headers.forEach((h, idx) => { row[h.trim()] = values[idx] || ''; });
    data.push(row);
  }
  return data;
}

function parseExcel(buffer) {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
  return rows.map(row => {
    const normalized = {};
    Object.keys(row).forEach(k => { normalized[k.trim()] = String(row[k] ?? '').trim(); });
    return normalized;
  });
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
  };
}

async function aiValidate(rows, onProgress) {
  const results = [];
  const batchSize = 10;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    onProgress(`AI validating batch ${Math.min(i + batchSize, rows.length)} of ${rows.length}...`, Math.round((i / rows.length) * 70) + 15);

    const prompt = `You are a data validation AI. For each trip below, check if the pickup and dropoff look like valid addresses, the time looks valid, and the client name is present. Return a JSON array of objects, one per input row, with fields: "issues" (array of strings describing problems, empty if none), "correctedPickup" (fix obvious typos or leave as-is), "correctedDropoff", "correctedTime", "confidence" (0-100). If all looks good, "issues" should be [].

Input rows:
${JSON.stringify(batch.map((r, idx) => ({ idx: i + idx, patient: r.patient, pickup: r.pickup, dropoff: r.dropoff, time: r.time })), null, 2)}

Return ONLY valid JSON array. No markdown. No explanation.`;

    try {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_CONFIG.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
          }),
        }
      );
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
    } catch {
      for (let j = 0; j < batch.length && i + j < rows.length; j++) {
        if (!results[i + j]) results[i + j] = { issues: [], confidence: 100 };
      }
    }
  }
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

const FileUploadTrips = ({ onTripsCreated, drivers = [], preSelectDriver = '' }) => {
  const [file, setFile] = useState(null);
  const [step, setStep] = useState('upload');
  const [parsedRows, setParsedRows] = useState([]);
  const [mappedTrips, setMappedTrips] = useState([]);
  const [aiResults, setAiResults] = useState([]);
  const [error, setError] = useState('');
  const [progressMsg, setProgressMsg] = useState('');
  const [progressPct, setProgressPct] = useState(0);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [detectedColumns, setDetectedColumns] = useState({});
  const [allColumnNames, setAllColumnNames] = useState([]);
  const [selectedCount, setSelectedCount] = useState(0);
  const [assignToDriver, setAssignToDriver] = useState(preSelectDriver || '');
  const [showAssignPrompt, setShowAssignPrompt] = useState(true);
  const dropRef = useRef(null);

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

      // First pass: group by patient and phone to identify facility numbers and determine the "Earliest Leg" phone
      const patientData = {};
      const phoneToPatients = {}; // phone -> Set of patient names
      
      // Temporary sort to find earliest trip per patient
      const sortedByTime = [...rows].sort((a, b) => {
        const m1 = mapColumns(a);
        const m2 = mapColumns(b);
        return timeToMinutes(m1.time) - timeToMinutes(m2.time);
      });

      sortedByTime.forEach(row => {
        const m = mapColumns(row);
        const p = (m.patient || '').trim().toLowerCase();
        if (!p) return;
        if (!patientData[p]) {
          patientData[p] = { 
            homePhones: new Set(), 
            allPhones: new Set(),
            earliestPhone: m.pickupPhone || m.dropoffPhone || '' 
          };
        }
        
        const pickupPhone = cleanPhone(m.pickupPhone);
        const dropoffPhone = cleanPhone(m.dropoffPhone);
        
        if (pickupPhone) {
          if (!phoneToPatients[pickupPhone]) phoneToPatients[pickupPhone] = new Set();
          phoneToPatients[pickupPhone].add(p);
        }
        if (dropoffPhone) {
          if (!phoneToPatients[dropoffPhone]) phoneToPatients[dropoffPhone] = new Set();
          phoneToPatients[dropoffPhone].add(p);
        }

        const isPickupHome = (m.pickup || '').toLowerCase().includes('home') || (row[colMap.pickupSite] || '').toLowerCase().includes('home');
        const isDropoffHome = (m.dropoff || '').toLowerCase().includes('home') || (row[colMap.dropoffSite] || '').toLowerCase().includes('home');
        
        if (m.pickupPhone) {
          patientData[p].allPhones.add(m.pickupPhone);
          if (isPickupHome) patientData[p].homePhones.add(m.pickupPhone);
        }
        if (m.dropoffPhone) {
          patientData[p].allPhones.add(m.dropoffPhone);
          if (isDropoffHome) patientData[p].homePhones.add(m.dropoffPhone);
        }
      });

      // Identify shared numbers (used by > 1 patient) as facility numbers
      const facilityPhones = new Set();
      Object.entries(phoneToPatients).forEach(([phone, patients]) => {
        if (patients.size > 1) facilityPhones.add(phone);
      });

      const mapped = rows.map((row, idx) => {
        const m = mapColumns(row);
        const pKey = (m.patient || '').trim().toLowerCase();
        const pInfo = patientData[pKey];
        
        let patientPhone = '';
        if (pInfo) {
          // Priority 1: A phone number associated with a "home" address that IS NOT a shared facility number
          const homePhonesList = Array.from(pInfo.homePhones);
          const nonFacHome = homePhonesList.find(ph => !facilityPhones.has(cleanPhone(ph)));
          
          if (nonFacHome) {
            patientPhone = nonFacHome;
          } else if (pInfo.earliestPhone && !facilityPhones.has(cleanPhone(pInfo.earliestPhone))) {
            // Priority 2: Use the phone from the EARLIEST trip (if not a facility)
            patientPhone = pInfo.earliestPhone;
          } else if (homePhonesList.length > 0) {
            patientPhone = homePhonesList[0];
          } else {
            // Priority 3: Any phone number for this patient that IS NOT a shared facility number
            const allPhonesList = Array.from(pInfo.allPhones);
            const nonFacAny = allPhonesList.find(ph => !facilityPhones.has(cleanPhone(ph)));
            if (nonFacAny) {
              patientPhone = nonFacAny;
            } else {
              // Fallback
              patientPhone = m.pickupPhone || m.dropoffPhone || '';
            }
          }
        }

        const notes = [m.notes, row['Pickup Comments'], row['Dropoff Comments'], row['Comments'], row['Message']]
          .filter(Boolean)
          .join(' | ');

        return {
          id: `TRIP-${Date.now()}-${idx}`,
          bookingId: m.bookingId || '',
          patient: m.patient || '',
          patientPhone: patientPhone,
          date: normalizeDateValue(m.date) || today,
          time: m.time || '',
          dropoffTime: m.dropoffTime || '',
          type: m.type || row['Space Types'] || '',
          purpose: row['Purpose'] || '',
          providerName: row['Provider Name'] || '',
          directDistance: row['Direct Distance'] || '',
          driverId: null,
          pickup: m.pickup || '',
          dropoff: m.dropoff || '',
          pickupSiteName: colMap.pickupSite ? row[colMap.pickupSite] : '',
          dropoffSiteName: colMap.dropoffSite ? row[colMap.dropoffSite] : '',
          pickupPhone: m.pickupPhone || '',
          dropoffPhone: m.dropoffPhone || '',
          status: 'Unassigned',
          notes,
          _originalRow: row,
          _hasIssues: false,
          _issues: [],
          _confidence: 100,
        };
      });

      setMappedTrips(mapped);
      setParsedRows(rows);
      setSelectedCount(mapped.length);

      if (aiEnabled && GEMINI_API_CONFIG?.apiKey) {
        const aiResults = await aiValidate(mapped, (msg, pct) => {
          setProgressMsg(msg);
          setProgressPct(pct);
        });

        const updated = mapped.map((trip, idx) => {
          const ai = aiResults[idx];
          if (ai && ai.issues?.length > 0) {
            return { ...trip, _hasIssues: true, _issues: ai.issues, _confidence: ai.confidence || 100 };
          }
          return { ...trip, _confidence: ai?.confidence || 100 };
        });

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
      setError(`Processing error: ${err.message}`);
      setStep('upload');
    }
  };

  const confirmImport = () => {
    const cleanTrips = mappedTrips.map(({ _originalRow, _hasIssues, _issues, _confidence, ...trip }) => {
      // Per-trip driver assignment takes precedence, otherwise use global selector
      const finalDriverId = trip.driverId || assignToDriver;
      if (finalDriverId) {
        const driver = drivers.find(d => d.id === finalDriverId);
        return { ...trip, driverId: finalDriverId, status: driver ? 'Assigned' : trip.status };
      }
      return trip;
    });
    onTripsCreated(cleanTrips);
  };

  const totalSelected = mappedTrips.length;
  const withIssues = mappedTrips.filter(t => t._hasIssues).length;
  const avgConfidence = mappedTrips.length > 0
    ? Math.round(mappedTrips.reduce((s, t) => s + (t._confidence || 100), 0) / mappedTrips.length)
    : 100;

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
              <input id="fu-file-input" type="file" accept=".csv,.xlsx,.xls" onChange={handleInputChange} className="hidden" />
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
                      <td className="px-2 sm:px-3 py-1.5 sm:py-2.5 text-xs sm:text-xs text-slate-600 max-w-[80px] sm:max-w-[160px] truncate" title={trip.pickup}>{trip.pickup || <span className="text-rose-400 italic">missing</span>}</td>
                      <td className="px-2 sm:px-3 py-1.5 sm:py-2.5 text-xs sm:text-xs text-slate-600 max-w-[80px] sm:max-w-[160px] truncate" title={trip.dropoff}>{trip.dropoff || <span className="text-rose-400 italic">missing</span>}</td>
                      <td className="px-2 sm:px-3 py-1.5 sm:py-2.5 text-xs sm:text-xs text-slate-600 hidden sm:table-cell">{trip.time}</td>
                      <td className="px-2 sm:px-3 py-1.5 sm:py-2.5">
                        <select 
                          value={trip.driverId || ''} 
                          onChange={(e) => {
                            const newTrips = [...mappedTrips];
                            newTrips[idx].driverId = e.target.value;
                            setMappedTrips(newTrips);
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
                      <option value="">Leave Most as Unassigned (Or use per-trip selector below)</option>
                      {drivers.map(d => (
                        <option key={d.id} value={d.id}>{d.name} — {d.vehicle || 'No vehicle'} ({d.status})</option>
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
              ) : (
                <div className="p-4 border-2 border-dashed border-blue-100 rounded-xl text-center">
                  <p className="text-xs font-bold text-slate-400">Assignment disabled. Trips will be imported as Unassigned.</p>
                </div>
              )}
            </div>

            <div className="mt-4 sm:mt-6 flex flex-col sm:flex-row gap-2 sm:gap-3">
              <button onClick={() => { setStep('upload'); setFile(null); setMappedTrips([]); setParsedRows([]); setError(''); }} className="w-full sm:flex-1 py-3 border border-slate-300 text-slate-700 font-bold rounded-xl hover:bg-slate-50 transition text-sm">
                Cancel
              </button>
              <button onClick={confirmImport} className="w-full sm:flex-1 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition flex items-center justify-center gap-2 shadow-sm text-sm">
                <CheckCircle2 size={18} />
                Import {totalSelected} Trips
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FileUploadTrips;
