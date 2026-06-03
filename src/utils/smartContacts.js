const FACILITY_KEYWORDS = ['hospital','center','clinic','academy','school','treatment','health','dental','pharmacy','office','suite','care','medical','therapy','rehab','wellness','surgery','diagnostic','lab','institute','senior','living','manor','village','skills','nursing','facility','campus','recreation','community','assisted','hospice','psychiatric','behavioral','outpatient','urgent care','emergency room','er','medicaid','medicare','health services','clinic','surgical center','doctors office','dr office','physician','specialty center','imaging','radiology','oncology','cardiology','orthopedic','pediatrics','obgyn','women','family practice'];

export const cleanPhone = (p) => (p || '').replace(/[^0-9]/g, '');

const isLikelyFacilityAddress = (address) => {
  if (!address) return false;
  const lower = address.toLowerCase();
  return FACILITY_KEYWORDS.some(kw => lower.includes(kw));
};

const isLikelyHomeAddress = (address) => {
  if (!address) return false;
  const lower = address.toLowerCase();
  const homeIndicators = ['apt','apartment','unit','suite','#','floor','st','street','ave','avenue','blvd','drive','lane','court','place','way','circle','terrace','road','lane','drive','avenue','boulevard'];
  return homeIndicators.some(ind => lower.includes(ind)) && !isLikelyFacilityAddress(address);
};

const detectContactTypeForNumber = (phone, contextAddress, patientName, allTrips) => {
  if (!phone || !cleanPhone(phone)) return null;
  const cleaned = cleanPhone(phone);

  const patientsUsingThis = new Set();
  allTrips.forEach(t => {
    if (cleanPhone(t.pickupPhone) === cleaned) patientsUsingThis.add((t.patient || '').trim().toLowerCase());
    if (cleanPhone(t.dropoffPhone) === cleaned) patientsUsingThis.add((t.patient || '').trim().toLowerCase());
    if (cleanPhone(t.patientPhone) === cleaned) patientsUsingThis.add((t.patient || '').trim().toLowerCase());
    if (cleanPhone(t.patientMobile) === cleaned) patientsUsingThis.add((t.patient || '').trim().toLowerCase());
    if (cleanPhone(t.guardianPhone) === cleaned) patientsUsingThis.add((t.patient || '').trim().toLowerCase());
    if (cleanPhone(t.escortPhone) === cleaned) patientsUsingThis.add((t.patient || '').trim().toLowerCase());
  });

  const isShared = patientsUsingThis.size > 1;
  const addressIsFacility = isLikelyFacilityAddress(contextAddress);
  const addressIsHome = isLikelyHomeAddress(contextAddress);

  if (isShared && addressIsFacility) return { type: 'facility', label: 'Facility', confidence: 'high' };
  if (isShared) return { type: 'facility', label: 'Facility', confidence: 'medium' };
  if (addressIsFacility) return { type: 'facility', label: 'Facility', confidence: 'medium' };
  if (addressIsHome) return { type: 'patient', label: 'Patient', confidence: 'high' };

  return { type: 'patient', label: 'Patient', confidence: 'low' };
};

const detectRoleFromField = (fieldName) => {
  const roleMap = {
    patientMobile: { role: 'patient', label: 'Patient Mobile', priority: 1, confidence: 'high' },
    patientPhone: { role: 'patient', label: 'Patient', priority: 1, confidence: 'high' },
    guardianPhone: { role: 'guardian', label: 'Guardian', priority: 2, confidence: 'high' },
    escortPhone: { role: 'escort', label: 'Escort', priority: 2, confidence: 'high' },
    emergencyContact: { role: 'emergency', label: 'Emergency', priority: 3, confidence: 'medium' },
    pickupPhone: { role: 'pickup', label: 'Pickup Location', priority: 4, confidence: 'medium' },
    dropoffPhone: { role: 'dropoff', label: 'Dropoff Location', priority: 4, confidence: 'medium' },
    hospitalPhone: { role: 'facility', label: 'Facility', priority: 4, confidence: 'medium' },
    dispatcher: { role: 'dispatcher', label: 'Dispatch', priority: 5, confidence: 'high' },
    routing: { role: 'routing', label: 'Routing', priority: 6, confidence: 'high' },
  };
  return roleMap[fieldName] || { role: 'patient', label: 'Contact', priority: 3, confidence: 'low' };
};

const buildContactList = (trip, allTrips, phoneNumbers = {}) => {
  const contacts = [];
  const addedPhones = new Set();

  const tryAddContact = (phone, name, role, label, priority, confidence, extra = {}) => {
    const cleaned = cleanPhone(phone);
    if (!cleaned) return;
    if (addedPhones.has(cleaned)) return;
    addedPhones.add(cleaned);
    contacts.push({
      phone,
      name: name || trip.patient || 'Unknown',
      role,
      label,
      priority,
      confidence,
      isPrimary: false,
      field: extra.field || null,
      relation: extra.relation || '',
    });
  };

  const knownFieldRoles = [
    { field: 'patientMobile', role: 'patient', label: 'Patient Mobile', priority: 1 },
    { field: 'patientPhone', role: 'patient', label: 'Patient', priority: 1 },
    { field: 'guardianPhone', role: 'guardian', label: 'Guardian', priority: 2 },
    { field: 'escortPhone', role: 'escort', label: 'Escort', priority: 2 },
    { field: 'emergencyContact', role: 'emergency', label: 'Emergency Contact', priority: 3 },
  ];

  for (const { field, role, label, priority } of knownFieldRoles) {
    const phone = trip[field];
    if (phone && cleanPhone(phone)) {
      tryAddContact(phone, trip.patient, role, label, priority, 'high', { field });
    }
  }

  const cleanedPatientMobile = cleanPhone(trip.patientMobile);
  const cleanedPatientPhone = cleanPhone(trip.patientPhone);
  const knownPatientPhones = new Set();
  if (cleanedPatientMobile) knownPatientPhones.add(cleanedPatientMobile);
  if (cleanedPatientPhone) knownPatientPhones.add(cleanedPatientPhone);

  const cleanedPickup = cleanPhone(trip.pickupPhone);
  const cleanedDropoff = cleanPhone(trip.dropoffPhone);

  const isPickupPatientPhone = cleanedPickup && knownPatientPhones.has(cleanedPickup);
  const isDropoffPatientPhone = cleanedDropoff && knownPatientPhones.has(cleanedDropoff);

  const pickupAddress = typeof trip.pickup === 'string' ? trip.pickup : trip.pickup?.address || '';
  const dropoffAddress = typeof trip.dropoff === 'string' ? trip.dropoff : trip.dropoff?.address || '';

  if (cleanedPickup) {
    if (isPickupPatientPhone) {
      tryAddContact(trip.pickupPhone, trip.patient, 'patient', 'Patient (Pickup)', 1, 'high', { field: 'pickupPhone' });
    } else {
      const pickupType = detectContactTypeForNumber(trip.pickupPhone, pickupAddress, trip.patient, allTrips);
      tryAddContact(trip.pickupPhone, pickupType.type === 'facility' ? (pickupAddress.split(',')[0] || 'Facility') : trip.patient, pickupType.type, pickupType.label, pickupType.type === 'facility' ? 4 : 2, pickupType.confidence, { field: 'pickupPhone' });
    }
  }

  if (cleanedDropoff) {
    if (isDropoffPatientPhone) {
      tryAddContact(trip.dropoffPhone, trip.patient, 'patient', 'Patient (Dropoff)', 1, 'high', { field: 'dropoffPhone' });
    } else {
      const dropoffType = detectContactTypeForNumber(trip.dropoffPhone, dropoffAddress, trip.patient, allTrips);
      tryAddContact(trip.dropoffPhone, dropoffType.type === 'facility' ? (dropoffAddress.split(',')[0] || 'Facility') : trip.patient, dropoffType.type, dropoffType.label, dropoffType.type === 'facility' ? 4 : 2, dropoffType.confidence, { field: 'dropoffPhone' });
    }
  }

  const cleanedHospitalPhone = cleanPhone(trip.hospitalPhone);
  if (cleanedHospitalPhone && !addedPhones.has(cleanedHospitalPhone)) {
    tryAddContact(trip.hospitalPhone, 'Hospital', 'facility', 'Facility', 4, 'medium', { field: 'hospitalPhone' });
  }

  if (phoneNumbers.dispatcher) {
    tryAddContact(phoneNumbers.dispatcher, 'Dispatch', 'dispatcher', 'Dispatch', 5, 'high', { field: 'dispatcher' });
  }

  if (phoneNumbers.routing) {
    tryAddContact(phoneNumbers.routing, 'Routing', 'routing', 'Routing', 6, 'high', { field: 'routing' });
  }

  contacts.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    const confOrder = { high: 0, medium: 1, low: 2 };
    return (confOrder[a.confidence] || 2) - (confOrder[b.confidence] || 2);
  });

  const firstPatient = contacts.find(c => c.role === 'patient');
  if (firstPatient) firstPatient.isPrimary = true;

  return contacts;
};

const CONTACT_ROLES = new Set(['patient', 'guardian', 'escort', 'emergency', 'pickup', 'dropoff', 'facility']);

const getPrimaryContact = (trip, allTrips, phoneNumbers = {}) => {
  const contacts = buildContactList(trip, allTrips, phoneNumbers);
  for (const role of ['patient', 'guardian', 'escort', 'emergency']) {
    const found = contacts.find(c => c.role === role);
    if (found) return found;
  }
  const personal = contacts.find(c => CONTACT_ROLES.has(c.role));
  if (personal) return personal;
  return null;
};

const getContactWarning = (trip, allTrips) => {
  const contacts = buildContactList(trip, allTrips);
  const primary = getPrimaryContact(trip, allTrips);
  if (!primary) return { show: true, message: 'No contact number available for this trip.', severity: 'error' };
  if (primary.role === 'facility') return { show: true, message: 'No patient mobile available. Calling facility.', severity: 'warning' };
  if (primary.confidence === 'low') return { show: true, message: 'Patient number not confirmed. Verify before calling.', severity: 'info' };
  if (primary.role === 'guardian') return { show: true, message: `Contacting guardian: ${primary.name}`, severity: 'info' };
  if (primary.role === 'escort') return { show: true, message: `Contacting escort: ${primary.name}`, severity: 'info' };
  return { show: false, message: '', severity: 'none' };
};

const formatPhoneDisplay = (phone) => {
  const cleaned = cleanPhone(phone);
  if (!cleaned) return '';
  if (cleaned.length === 10) return `(${cleaned.slice(0,3)}) ${cleaned.slice(3,6)}-${cleaned.slice(6)}`;
  if (cleaned.length === 11 && cleaned.startsWith('1')) return `+1 (${cleaned.slice(1,4)}) ${cleaned.slice(4,7)}-${cleaned.slice(7)}`;
  return cleaned;
};

const getContactRoleIcon = (role) => {
  const icons = {
    patient: { icon: 'User', color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200', ring: 'ring-emerald-200' },
    guardian: { icon: 'Shield', color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-200', ring: 'ring-purple-200' },
    escort: { icon: 'PhoneForwarded', color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-200', ring: 'ring-indigo-200' },
    emergency: { icon: 'AlertTriangle', color: 'text-rose-600', bg: 'bg-rose-50', border: 'border-rose-200', ring: 'ring-rose-200' },
    facility: { icon: 'Building', color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200', ring: 'ring-amber-200' },
    pickup: { icon: 'MapPin', color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200', ring: 'ring-blue-200' },
    dropoff: { icon: 'MapPin', color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200', ring: 'ring-emerald-200' },
    dispatcher: { icon: 'Headphones', color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200', ring: 'ring-blue-200' },
    routing: { icon: 'Route', color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-200', ring: 'ring-indigo-200' },
  };
  return icons[role] || icons.patient;
};

const getContactRoleActions = (role) => {
  const actions = {
    patient: { callLabel: 'Call Patient', smsLabel: 'Message Patient' },
    guardian: { callLabel: 'Call Guardian', smsLabel: 'Message Guardian' },
    escort: { callLabel: 'Call Escort', smsLabel: 'Message Escort' },
    emergency: { callLabel: 'Call Emergency', smsLabel: null },
    facility: { callLabel: 'Call Facility', smsLabel: 'Message Facility' },
    pickup: { callLabel: 'Call Pickup', smsLabel: null },
    dropoff: { callLabel: 'Call Dropoff', smsLabel: null },
    dispatcher: { callLabel: 'Call Dispatch', smsLabel: null },
    routing: { callLabel: 'Call Routing', smsLabel: null },
  };
  return actions[role] || { callLabel: 'Call', smsLabel: null };
};

export {
  FACILITY_KEYWORDS,
  isLikelyFacilityAddress,
  isLikelyHomeAddress,
  detectContactTypeForNumber,
  detectRoleFromField,
  buildContactList,
  getPrimaryContact,
  getContactWarning,
  formatPhoneDisplay,
  getContactRoleIcon,
  getContactRoleActions,
};
