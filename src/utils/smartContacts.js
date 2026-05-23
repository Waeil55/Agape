const FACILITY_KEYWORDS = ['hospital','center','clinic','academy','school','treatment','health','dental','pharmacy','office','suite','care','medical','therapy','rehab','wellness','surgery','diagnostic','lab','institute','senior','living','manor','village','skills','nursing','facility','campus'];

const cleanPhone = (p) => (p || '').replace(/[^0-9]/g, '');

const isLikelyFacilityAddress = (address) => {
  if (!address) return false;
  const lower = address.toLowerCase();
  return FACILITY_KEYWORDS.some(kw => lower.includes(kw));
};

const isLikelyHomeAddress = (address) => {
  if (!address) return false;
  const lower = address.toLowerCase();
  const homeIndicators = ['apt','apartment','unit','suite','#','floor','st','street','ave','avenue','blvd','drive','lane','court','place','way','circle','terrace','road'];
  return homeIndicators.some(ind => lower.includes(ind)) && !isLikelyFacilityAddress(address);
};

const detectContactType = (phone, address, patientName, allTrips) => {
  if (!phone || !cleanPhone(phone)) return null;
  const cleaned = cleanPhone(phone);

  // Check if this phone is shared across multiple patients (likely facility)
  const patientsUsingThis = new Set();
  allTrips.forEach(t => {
    if (cleanPhone(t.pickupPhone) === cleaned) patientsUsingThis.add((t.patient || '').trim().toLowerCase());
    if (cleanPhone(t.dropoffPhone) === cleaned) patientsUsingThis.add((t.patient || '').trim().toLowerCase());
    if (cleanPhone(t.patientPhone) === cleaned) patientsUsingThis.add((t.patient || '').trim().toLowerCase());
  });

  const isShared = patientsUsingThis.size > 1;
  const addressIsFacility = isLikelyFacilityAddress(address);
  const addressIsHome = isLikelyHomeAddress(address);

  if (isShared && addressIsFacility) return { type: 'facility', label: 'Facility', confidence: 'high' };
  if (isShared) return { type: 'facility', label: 'Facility', confidence: 'medium' };
  if (addressIsFacility) return { type: 'facility', label: 'Facility', confidence: 'medium' };
  if (addressIsHome) return { type: 'patient', label: 'Patient', confidence: 'high' };

  // Default: if it's on the trip as pickupPhone and not shared, it's likely patient
  return { type: 'patient', label: 'Patient', confidence: 'low' };
};

const buildContactList = (trip, allTrips, phoneNumbers = {}) => {
  const contacts = [];
  const cleanedPickup = cleanPhone(trip.pickupPhone);
  const cleanedDropoff = cleanPhone(trip.dropoffPhone);
  const cleanedPatient = cleanPhone(trip.patientPhone);

  // 1. Patient phone (highest priority) - from smart-resolved patientPhone
  if (cleanedPatient && cleanedPickup !== cleanedPatient && cleanedDropoff !== cleanedPatient) {
    const pickupType = detectContactType(trip.patientPhone, trip.pickup, trip.patient, allTrips);
    const dropoffType = detectContactType(trip.patientPhone, trip.dropoff, trip.patient, allTrips);
    const bestType = pickupType?.confidence === 'high' ? pickupType : dropoffType?.confidence === 'high' ? dropoffType : { type: 'patient', label: 'Patient', confidence: 'low' };
    contacts.push({
      phone: trip.patientPhone,
      name: trip.patient,
      role: 'patient',
      label: bestType.label,
      priority: 1,
      confidence: bestType.confidence,
      isPrimary: true,
    });
  }

  // 2. Pickup phone - detect if patient or facility
  if (cleanedPickup) {
    const pickupType = detectContactType(trip.pickupPhone, trip.pickup, trip.patient, allTrips);
    const isAlreadyAdded = contacts.some(c => cleanPhone(c.phone) === cleanedPickup);
    if (!isAlreadyAdded) {
      contacts.push({
        phone: trip.pickupPhone,
        name: pickupType.type === 'facility' ? (trip.pickup.split(',')[0] || 'Facility') : trip.patient,
        role: pickupType.type,
        label: pickupType.label,
        priority: pickupType.type === 'facility' ? 4 : 2,
        confidence: pickupType.confidence,
        isPrimary: false,
      });
    }
  }

  // 3. Dropoff phone - detect if patient or facility
  if (cleanedDropoff) {
    const dropoffType = detectContactType(trip.dropoffPhone, trip.dropoff, trip.patient, allTrips);
    const isAlreadyAdded = contacts.some(c => cleanPhone(c.phone) === cleanedDropoff);
    if (!isAlreadyAdded) {
      contacts.push({
        phone: trip.dropoffPhone,
        name: dropoffType.type === 'facility' ? (trip.dropoff.split(',')[0] || 'Facility') : trip.patient,
        role: dropoffType.type,
        label: dropoffType.label,
        priority: dropoffType.type === 'facility' ? 4 : 2,
        confidence: dropoffType.confidence,
        isPrimary: false,
      });
    }
  }

  // 4. Dispatch number
  if (phoneNumbers.dispatcher) {
    contacts.push({
      phone: phoneNumbers.dispatcher,
      name: 'Dispatch',
      role: 'dispatcher',
      label: 'Dispatch',
      priority: 5,
      confidence: 'high',
      isPrimary: false,
    });
  }

  // 5. Routing number
  if (phoneNumbers.routing) {
    const isAlreadyAdded = contacts.some(c => cleanPhone(c.phone) === cleanPhone(phoneNumbers.routing));
    if (!isAlreadyAdded) {
      contacts.push({
        phone: phoneNumbers.routing,
        name: 'Routing',
        role: 'routing',
        label: 'Routing',
        priority: 6,
        confidence: 'high',
        isPrimary: false,
      });
    }
  }

  // Sort by priority, then by confidence
  contacts.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    const confOrder = { high: 0, medium: 1, low: 2 };
    return (confOrder[a.confidence] || 2) - (confOrder[b.confidence] || 2);
  });

  // Mark the first patient-type contact as primary
  const firstPatient = contacts.find(c => c.role === 'patient');
  if (firstPatient) firstPatient.isPrimary = true;

  return contacts;
};

const getPrimaryContact = (trip, allTrips, phoneNumbers = {}) => {
  const contacts = buildContactList(trip, allTrips, phoneNumbers);
  const patientContact = contacts.find(c => c.role === 'patient');
  if (patientContact) return patientContact;

  // Fallback: first non-facility contact
  const nonFacility = contacts.find(c => c.role !== 'facility' && c.role !== 'dispatcher' && c.role !== 'routing');
  if (nonFacility) return nonFacility;

  // Last resort: first contact
  return contacts[0] || null;
};

const getContactWarning = (trip, allTrips) => {
  const primary = getPrimaryContact(trip, allTrips);
  if (!primary) return { show: true, message: 'No contact number available for this trip.' };
  if (primary.role === 'facility') return { show: true, message: 'No patient mobile available. Calling facility.' };
  if (primary.confidence === 'low') return { show: true, message: 'Patient number not confirmed. Verify before calling.' };
  return { show: false, message: '' };
};

const formatPhoneDisplay = (phone) => {
  const cleaned = cleanPhone(phone);
  if (!cleaned) return '';
  if (cleaned.length === 10) return `(${cleaned.slice(0,3)}) ${cleaned.slice(3,6)}-${cleaned.slice(6)}`;
  if (cleaned.length === 11 && cleaned.startsWith('1')) return `+1 (${cleaned.slice(1,4)}) ${cleaned.slice(4,7)}-${cleaned.slice(7)}`;
  return cleaned;
};

export { FACILITY_KEYWORDS, cleanPhone, isLikelyFacilityAddress, isLikelyHomeAddress, detectContactType, buildContactList, getPrimaryContact, getContactWarning, formatPhoneDisplay };
