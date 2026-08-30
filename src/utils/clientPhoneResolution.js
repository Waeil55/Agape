export const normalizePhoneDigits = (value) => String(value ?? '').replace(/\D/g, '');

export const normalizePatientName = (value) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

export const isValidPhoneDigits = (digits) => {
  if (!digits) return false;
  let clean = String(digits).replace(/\D/g, '');
  if (clean.length === 11 && clean.startsWith('1')) {
    clean = clean.slice(1);
  }
  if (clean.length !== 10) return false;
  // Filter out invalid/repeating numbers (e.g. 0000000000, 1111111111)
  if (/^(\d)\1{9}$/.test(clean)) return false;
  // Filter out 8-digit date representations (e.g. 20130301, 20260817)
  if (clean.startsWith('201') || clean.startsWith('202') || clean.startsWith('199')) return false;
  // Filter out area codes that don't exist (e.g. 0xx, 1xx)
  if (clean[0] === '0' || clean[0] === '1') return false;
  return true;
};

const FACILITY_KEYWORDS = [
  'center', 'centre', 'clinic', 'hospital', 'care', 'treatment', 'medical', 'health', 'therapy',
  'academy', 'school', 'facility', 'pharmacy', 'pharm',
  'dialysis', 'rehab', 'rehabilitation', 'mental health', 'behavioral', 'paediatric', 'pediatric',
  'dental', 'lab', 'imaging', 'radiology', 'urgent care', 'emergency', 'surgery', 'surgical',
  'ortho', 'cardio', 'neuro', 'specialty', 'diagnostic', 'wellness',
  'medical center', 'health services', 'primary care', 'physician', 'doctor', 'doctors office', 'provider',
];

const HOME_KEYWORDS = [
  'home', 'house', 'residence', 'apartment', 'apt', 'unit', 'mother', 'father', 'grandmother',
  'grandfather', 'mom', 'dad', 'guardian', 'foster', 'shelter', 'group home', 'group-home', 'family',
  'mother\'s address', 'father\'s address', 'guardian\'s address', 'client\'s address', 'patient\'s address',
];

const GUARDIAN_KEYWORDS = [
  'mother', 'father', 'mom', 'dad', 'parent', 'guardian', 'caregiver', 'escort', 'foster', 'sponsor',
];

export const isFacilityLikeText = (value) => {
  const lower = String(value ?? '').trim().toLowerCase();
  if (!lower) return false;
  return FACILITY_KEYWORDS.some((keyword) => {
    const esc = keyword.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    return new RegExp(`\\b${esc}\\b`, 'i').test(lower);
  });
};

export const isHomeLikeText = (value) => {
  const lower = String(value ?? '').trim().toLowerCase();
  if (!lower) return false;
  if (isFacilityLikeText(lower)) return false;
  const hasStreet = /\b\d+\s+\w+\s+(st|street|dr|drive|rd|road|ave|avenue|blvd|boulevard|ln|lane|way|ct|court|pl|place|cir|circle|ter|terrace)\b/i.test(lower);
  if (hasStreet) return true;
  return HOME_KEYWORDS.some((keyword) => lower.includes(keyword));
};

const isWorkLikeText = (value) => {
  const lower = String(value ?? '').trim().toLowerCase();
  return lower === 'work' || lower === 'wrk' || lower === 'office' || lower.includes('place of work');
};

const getTripPatientKey = (tripLike = {}) => {
  const patient = tripLike?.patient || tripLike?.clientName || tripLike?.memberName || tripLike?.rider || tripLike?.name || '';
  return normalizePatientName(patient);
};

// Extract phone numbers from free-text notes/comments
export const extractPhonesFromComments = (text = '') => {
  if (!text) return [];
  const matches = String(text).match(/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g) || [];
  const validDigits = [];
  matches.forEach((m) => {
    const digits = normalizePhoneDigits(m);
    if (isValidPhoneDigits(digits)) {
      const ten = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
      if (!validDigits.includes(ten)) validDigits.push(ten);
    }
  });
  return validDigits;
};

// Check if comments mention guardian/escort relationship
export const parseGuardianMetadataFromComments = (comments = '', passengerTypes = '') => {
  const combined = `${comments} ${passengerTypes}`.toLowerCase();
  let hasGuardianMention = false;
  let guardianRole = '';

  for (const kw of GUARDIAN_KEYWORDS) {
    if (combined.includes(kw)) {
      hasGuardianMention = true;
      guardianRole = kw;
      break;
    }
  }
  return { hasGuardianMention, guardianRole };
};

/**
 * Detailed Phone Ownership Analysis Engine
 * Analyzes all trips for a given patient and categorizes every phone number.
 */
export const analyzePhoneOwnershipForTrips = (trips = [], patientName = '') => {
  const allTrips = Array.isArray(trips) ? trips.filter(Boolean) : [];
  const patientKey = normalizePatientName(patientName || '');

  const samePatientTrips = patientKey
    ? allTrips.filter((trip) => getTripPatientKey(trip) === patientKey)
    : allTrips;

  if (samePatientTrips.length === 0) {
    return {
      clientPhone: '',
      guardianPhone: '',
      parentPhone: '',
      escortPhone: '',
      facilityPhones: [],
      otherContactPhones: [],
      phoneConfidence: 'UNKNOWN',
      phoneSource: 'No trips provided for patient.',
      phoneEvidenceMap: {},
      phoneNeedsReview: true,
    };
  }

  // Count how many unique patients share each phone across ALL trips in the file
  const phonePatientCounts = new Map();
  allTrips.forEach((trip) => {
    const values = [trip.patientPhone, trip.pickupPhone, trip.dropoffPhone, trip.hospitalPhone];
    values.forEach((value) => {
      const digits = normalizePhoneDigits(value);
      if (!isValidPhoneDigits(digits)) return;
      const ten = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
      const set = phonePatientCounts.get(ten) || new Set();
      const patient = getTripPatientKey(trip);
      if (patient) set.add(patient);
      phonePatientCounts.set(ten, set);
    });
  });

  // Build evidence records for every phone candidate found for this patient
  const phoneMap = new Map(); // phoneDigits -> Evidence object

  const registerCandidate = (rawPhone, { locationText, siteName, side, explicitLabel }) => {
    const digits = normalizePhoneDigits(rawPhone);
    if (!isValidPhoneDigits(digits)) return;
    const ten = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;

    if (!phoneMap.has(ten)) {
      phoneMap.set(ten, {
        digits: ten,
        formatted: `(${ten.slice(0,3)}) ${ten.slice(3,6)}-${ten.slice(6)}`,
        residentialCount: 0,
        facilityCount: 0,
        workCount: 0,
        explicitLabels: new Set(),
        locations: [],
        appearsOnTrips: 0,
        isSharedAcrossPatients: (phonePatientCounts.get(ten)?.size || 0) > 1,
        scores: { client: 0, guardian: 0, facility: 0, other: 0 },
      });
    }

    const rec = phoneMap.get(ten);
    rec.appearsOnTrips += 1;

    if (explicitLabel) rec.explicitLabels.add(explicitLabel);

    const isFac = isFacilityLikeText(siteName) || isFacilityLikeText(locationText);
    const isHome = isHomeLikeText(siteName) || isHomeLikeText(locationText);
    const isWork = isWorkLikeText(siteName) || isWorkLikeText(locationText);

    if (isHome) rec.residentialCount += 1;
    if (isFac) rec.facilityCount += 1;
    if (isWork) rec.workCount += 1;

    rec.locations.push({
      siteName: siteName || '',
      locationText: locationText || '',
      side: side || 'unknown',
      isHome,
      isFacility: isFac,
      isWork,
    });
  };

  samePatientTrips.forEach((trip) => {
    const commentsText = [trip.notes, trip.pickupComments, trip.dropoffComments, trip.comments, trip.message].filter(Boolean).join(' ');
    const commentPhones = extractPhonesFromComments(commentsText);
    commentPhones.forEach((cp) => {
      registerCandidate(cp, {
        locationText: 'Notes/Comments',
        siteName: 'Comments',
        side: 'comments',
        trip,
        explicitLabel: 'Extracted from Comments',
      });
    });

    const pickupSite = trip.pickupSiteName || trip.pickupSite || '';
    const dropoffSite = trip.dropoffSiteName || trip.dropoffSite || '';

    if (trip.patientPhone) {
      registerCandidate(trip.patientPhone, {
        locationText: trip.pickup || '',
        siteName: pickupSite,
        side: 'patientPhone',
        trip,
        explicitLabel: 'Patient Phone',
      });
    }

    if (trip.pickupPhone) {
      registerCandidate(trip.pickupPhone, {
        locationText: trip.pickup || '',
        siteName: pickupSite,
        side: 'pickup',
        trip,
        explicitLabel: isHomeLikeText(pickupSite) || isHomeLikeText(trip.pickup) ? 'Pickup Home Phone' : 'Pickup Phone',
      });
    }

    if (trip.dropoffPhone) {
      registerCandidate(trip.dropoffPhone, {
        locationText: trip.dropoff || '',
        siteName: dropoffSite,
        side: 'dropoff',
        trip,
        explicitLabel: isHomeLikeText(dropoffSite) || isHomeLikeText(trip.dropoff) ? 'Dropoff Home Phone' : 'Dropoff Phone',
      });
    }

    if (trip.hospitalPhone) {
      registerCandidate(trip.hospitalPhone, {
        locationText: dropoffSite || pickupSite || '',
        siteName: dropoffSite || pickupSite || 'Facility',
        side: 'hospitalPhone',
        trip,
        explicitLabel: 'Facility Phone',
      });
    }
  });

  if (phoneMap.size === 0) {
    return {
      clientPhone: '',
      guardianPhone: '',
      parentPhone: '',
      escortPhone: '',
      facilityPhones: [],
      otherContactPhones: [],
      phoneConfidence: 'UNKNOWN',
      phoneSource: 'No valid phone numbers found in source data.',
      phoneEvidenceMap: {},
      phoneNeedsReview: true,
    };
  }

  // Check guardian context for child/dependent passenger
  const sampleTrip = samePatientTrips[0] || {};
  const sampleComments = [sampleTrip.notes, sampleTrip.pickupComments, sampleTrip.dropoffComments, sampleTrip.comments, sampleTrip.message].filter(Boolean).join(' ');
  const guardianMeta = parseGuardianMetadataFromComments(sampleComments, sampleTrip.type || sampleTrip.passengerTypes || '');

  // Score each candidate phone
  phoneMap.forEach((rec) => {
    let clientScore = 0;
    let guardianScore = 0;
    let facilityScore = 0;

    if (rec.explicitLabels.has('Patient Phone')) clientScore += 60;
    if (rec.residentialCount > 0) {
      clientScore += 80 + rec.residentialCount * 20;
      if (guardianMeta.hasGuardianMention) guardianScore += 70;
    }
    if (rec.workCount > 0) clientScore += 40;

    if (rec.facilityCount > 0) {
      facilityScore += 100 + rec.facilityCount * 20;
      clientScore -= 120;
      guardianScore -= 120;
    }

    if (rec.explicitLabels.has('Facility Phone')) {
      facilityScore += 150;
      clientScore -= 150;
    }

    if (rec.isSharedAcrossPatients) {
      facilityScore += 90;
      clientScore -= 100;
    }

    if (rec.explicitLabels.has('Extracted from Comments')) {
      rec.scores.other = 50;
      if (guardianMeta.hasGuardianMention) guardianScore += 40;
    }

    rec.scores.client = clientScore;
    rec.scores.guardian = guardianScore;
    rec.scores.facility = facilityScore;
  });

  // Categorize candidates
  const candidates = Array.from(phoneMap.values());
  const facilityCandidates = candidates.filter((c) => c.scores.facility > c.scores.client && c.scores.facility > c.scores.guardian);
  const personalCandidates = candidates.filter((c) => c.scores.facility <= c.scores.client || c.scores.facility <= c.scores.guardian);

  personalCandidates.sort((a, b) => {
    const scoreA = Math.max(a.scores.client, a.scores.guardian);
    const scoreB = Math.max(b.scores.client, b.scores.guardian);
    return scoreB - scoreA;
  });

  facilityCandidates.sort((a, b) => b.scores.facility - a.scores.facility);

  const facilityPhones = facilityCandidates.map((c) => c.digits);
  const primaryPersonal = personalCandidates[0] || null;

  let clientPhone = '';
  let guardianPhone = '';
  let parentPhone = '';
  let escortPhone = '';
  let otherContactPhones = [];
  let phoneConfidence = 'UNKNOWN';
  let phoneSource = '';
  let phoneNeedsReview = false;

  if (primaryPersonal) {
    if (guardianMeta.hasGuardianMention && (primaryPersonal.residentialCount > 0 || primaryPersonal.scores.guardian > 50)) {
      guardianPhone = primaryPersonal.digits;
      clientPhone = primaryPersonal.digits; // Contact for minor/dependent client
      if (guardianMeta.guardianRole === 'mother' || guardianMeta.guardianRole === 'mom' || guardianMeta.guardianRole === 'father' || guardianMeta.guardianRole === 'dad') {
        parentPhone = primaryPersonal.digits;
      } else if (guardianMeta.guardianRole === 'escort') {
        escortPhone = primaryPersonal.digits;
      }
    } else {
      clientPhone = primaryPersonal.digits;
    }

    // Set Confidence
    if (primaryPersonal.explicitLabels.has('Patient Phone') || primaryPersonal.residentialCount >= 1 || primaryPersonal.scores.client >= 80) {
      phoneConfidence = 'HIGH';
    } else if (primaryPersonal.scores.client >= 30) {
      phoneConfidence = 'MEDIUM';
    } else {
      phoneConfidence = 'LOW';
    }

    if (personalCandidates.length > 1) {
      otherContactPhones = personalCandidates.slice(1).map((c) => c.digits);
    }

    // Generate Audit Trail Explanation (phoneSource)
    const selectedFormatted = primaryPersonal.formatted;
    const resLoc = primaryPersonal.locations.find((l) => l.isHome);
    const locDesc = resLoc ? `associated with residential location (${resLoc.siteName || resLoc.locationText || 'HOME'})` : 'derived from personal pickup/dropoff contact';

    let reasonText = `Selected ${selectedFormatted} as client phone (${locDesc} on ${primaryPersonal.appearsOnTrips} trip(s); confidence ${phoneConfidence}).`;

    if (facilityCandidates.length > 0) {
      const facDesc = facilityCandidates.map((f) => `${f.formatted} (${f.locations[0]?.siteName || 'medical facility'})`).join(', ');
      reasonText += ` Classified as FACILITY_PHONE: ${facDesc}.`;
    }

    phoneSource = reasonText;
  } else if (facilityCandidates.length > 0) {
    // Only facility phones exist, no personal client phone candidate found
    clientPhone = '';
    phoneConfidence = 'UNKNOWN';
    phoneNeedsReview = true;
    phoneSource = `No client personal phone found. All detected numbers belong to medical facilities: ${facilityCandidates.map((f) => f.formatted).join(', ')}.`;
  } else {
    clientPhone = '';
    phoneConfidence = 'UNKNOWN';
    phoneNeedsReview = true;
    phoneSource = 'Ownership of candidate phone numbers is uncertain. Requires admin review.';
  }

  if (phoneConfidence === 'LOW' || phoneConfidence === 'UNKNOWN') {
    phoneNeedsReview = true;
  }

  const phoneEvidenceMap = {};
  candidates.forEach((c) => {
    let classification = 'UNKNOWN_PHONE';
    if (c.digits === clientPhone) classification = guardianPhone ? 'GUARDIAN_PHONE' : 'CLIENT_PHONE';
    else if (c.scores.facility > 50) classification = 'FACILITY_PHONE';
    else if (c.explicitLabels.has('Extracted from Comments')) classification = 'OTHER_CONTACT_PHONE';

    phoneEvidenceMap[c.digits] = {
      digits: c.digits,
      formatted: c.formatted,
      classification,
      residentialCount: c.residentialCount,
      facilityCount: c.facilityCount,
      appearsOnTrips: c.appearsOnTrips,
      isSharedAcrossPatients: c.isSharedAcrossPatients,
      explicitLabels: Array.from(c.explicitLabels),
    };
  });

  return {
    clientPhone,
    guardianPhone,
    parentPhone,
    escortPhone,
    facilityPhones,
    otherContactPhones,
    phoneConfidence,
    phoneSource,
    phoneEvidenceMap,
    phoneNeedsReview,
  };
};

export const resolveClientPhoneForTrips = (trips = [], patientName = '') => {
  const analysis = analyzePhoneOwnershipForTrips(trips, patientName);
  return analysis.clientPhone || '';
};

export const resolveClientPhoneForTrip = (trip, allTrips = []) => {
  if (!trip) return '';
  const patientTrips = allTrips.length > 0 ? allTrips.filter(Boolean) : [trip];
  const patientName = trip.patient || trip.clientName || trip.memberName || '';
  const analysis = analyzePhoneOwnershipForTrips(patientTrips, patientName);
  if (analysis.clientPhone) return analysis.clientPhone;

  const direct = [trip.patientPhone, trip.pickupPhone, trip.dropoffPhone]
    .map(normalizePhoneDigits)
    .find((digits) => isValidPhoneDigits(digits));

  if (direct) {
    const ten = direct.length === 11 && direct.startsWith('1') ? direct.slice(1) : direct;
    return ten;
  }
  return '';
};
