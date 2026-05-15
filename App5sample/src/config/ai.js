import { GEMINI_API_CONFIG } from './firebase';

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_CONFIG.apiKey}`;

async function callGemini(prompt) {
  try {
    const resp = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
      }),
    });
    const data = await resp.json();
    let text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    text = text.replace(/```json\s*/gi, '').replace(/```\s*$/gi, '').trim();
    return text;
  } catch {
    return null;
  }
}

export async function optimizeRoute(trips, driverLocation) {
  const prompt = `You are a route optimization AI for a NEMT fleet. Given the driver's current location and a list of trips with pickup/dropoff addresses and times, determine the optimal order.

Driver location: ${driverLocation}

Trips:
${JSON.stringify(trips.map(t => ({ id: t.id, patient: t.patient, pickup: t.pickup, dropoff: t.dropoff, time: t.time })), null, 2)}

Return a JSON array of trip IDs in optimal order. Consider: nearest pickup first, appointment times, and logical routing. Return ONLY the JSON array. No explanation.`;

  const text = await callGemini(prompt);
  if (!text) return trips.map(t => t.id);
  try {
    return JSON.parse(text);
  } catch {
    return trips.map(t => t.id);
  }
}

export async function suggestDrivers(trip, drivers) {
  const prompt = `You are a fleet dispatch AI. Given a trip and available drivers, suggest the best driver match.

Trip: ${JSON.stringify({ patient: trip.patient, pickup: trip.pickup, dropoff: trip.dropoff, time: trip.time })}

Available Drivers:
${JSON.stringify(drivers.map(d => ({ id: d.id, name: d.name, vehicle: d.vehicle, currentZone: d.currentZone, status: d.status })), null, 2)}

Return the single best driver ID as a JSON string. Consider: proximity, vehicle type, current zone, availability. Return ONLY the driver ID in quotes. No explanation.`;

  const text = await callGemini(prompt);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function suggestBatchAssignment(unassignedTrips, drivers) {
  const prompt = `You are a fleet dispatch AI. Given unassigned trips and available drivers, suggest the optimal assignment for each trip.

Unassigned Trips:
${JSON.stringify(unassignedTrips.map(t => ({ id: t.id, patient: t.patient, pickup: t.pickup, dropoff: t.dropoff, time: t.time })), null, 2)}

Available Drivers:
${JSON.stringify(drivers.map(d => ({ id: d.id, name: d.name, vehicle: d.vehicle, currentZone: d.currentZone, status: d.status })), null, 2)}

Return a JSON object where keys are trip IDs and values are driver IDs. Consider proximity, zone matching, workload balance. Return ONLY the JSON object. No explanation.`;

  const text = await callGemini(prompt);
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

export async function explainAssignment(trip, driver) {
  const prompt = `You are a fleet dispatch AI. Briefly explain why this driver is a good match for this trip (1-2 sentences).

Trip: ${trip.patient} from ${trip.pickup} to ${trip.dropoff} at ${trip.time}
Driver: ${driver.name} (${driver.vehicle}) in ${driver.currentZone}

Return ONLY the explanation text. No JSON.`;

  return await callGemini(prompt) || `${driver.name} is available and in a suitable zone.`;
}

export async function sortTripsByProximity(trips, referenceAddress) {
  const prompt = `You are a logistics AI. Sort these trips by proximity to the reference address (closest first).

Reference: ${referenceAddress}

Trips:
${JSON.stringify(trips.map(t => ({ id: t.id, patient: t.patient, pickup: t.pickup, dropoff: t.dropoff })), null, 2)}

Return a JSON array of trip IDs sorted by proximity to reference. Return ONLY the array. No explanation.`;

  const text = await callGemini(prompt);
  if (!text) return trips.map(t => t.id);
  try {
    return JSON.parse(text);
  } catch {
    return trips.map(t => t.id);
  }
}

export async function extractZipCode(address) {
  const match = address?.match(/\b(\d{5})(?:-\d{4})?\b/);
  return match ? match[1] : '';
}

export async function groupByZipCode(trips) {
  const grouped = {};
  for (const trip of trips) {
    const zip = await extractZipCode(trip.pickup);
    if (!grouped[zip]) grouped[zip] = [];
    grouped[zip].push(trip);
  }
  return grouped;
}

export async function suggestOptimalDriver(trip, drivers, allTrips) {
  const now = new Date();
  const currentTimeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });

  const driverProfiles = drivers.map(d => {
    const currentScheduleStatus = getCurrentScheduleStatus(d.schedule);
    const assignedTrips = allTrips.filter(t => t.driverId === d.id && t.status === 'Assigned');
    const nextTrip = assignedTrips.length > 0 ? assignedTrips[0] : null;
    return {
      id: d.id, name: d.name, vehicle: d.vehicle, status: d.status,
      currentZone: d.currentZone, dist: d.dist, clockedIn: d.clockedIn,
      schedule: d.schedule, currentScheduleStatus,
      assignedTripCount: assignedTrips.length,
      nextTripPickup: nextTrip?.pickup || null,
      nextTripTime: nextTrip?.time || null,
    };
  });

  const prompt = `You are a NEMT fleet dispatch AI. Given a trip that needs assignment, select the OPTIMAL driver considering ALL factors below.

TRIP TO ASSIGN:
${JSON.stringify({ id: trip.id, patient: trip.patient, pickup: trip.pickup, dropoff: trip.dropoff, time: trip.time }, null, 2)}

AVAILABLE DRIVERS (with live schedule, zone, and next-trip context):
${JSON.stringify(driverProfiles, null, 2)}

Current time: ${currentTimeStr}

SCORING CRITERIA (weighted):
1. CLOCKED IN (highest priority — must be clocked in)
2. SCHEDULE FIT — driver must have a free slot covering the trip time
3. PROXIMITY — driver's current zone should be near the pickup
4. NEXT-TIP PROXIMITY — after finishing this trip's dropoff, the driver should not be far from their next assigned trip's pickup
5. WORKLOAD — prefer drivers with fewer current assigned trips

Return a JSON response with:
{
  "driverId": "best driver ID",
  "score": <0-100>,
  "reason": "brief 1-sentence explanation covering fit reasons"
}

Return ONLY the JSON. No other text.`;

  const text = await callGemini(prompt);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function getCurrentScheduleStatus(schedule) {
  if (!schedule || schedule.length === 0) return { status: 'unknown', label: 'No Schedule' };
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  for (const slot of schedule) {
    const startParts = slot.start.match(/(\d+):(\d+)\s*(AM|PM)/i);
    const endParts = slot.end.match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (!startParts || !endParts) continue;

    let startH = parseInt(startParts[1], 10);
    let startM = parseInt(startParts[2], 10);
    if (startParts[3].toUpperCase() === 'PM' && startH !== 12) startH += 12;
    if (startParts[3].toUpperCase() === 'AM' && startH === 12) startH = 0;

    let endH = parseInt(endParts[1], 10);
    let endM = parseInt(endParts[2], 10);
    if (endParts[3].toUpperCase() === 'PM' && endH !== 12) endH += 12;
    if (endParts[3].toUpperCase() === 'AM' && endH === 12) endH = 0;

    const startMins = startH * 60 + startM;
    const endMins = endH * 60 + endM;

    if (currentMinutes >= startMins && currentMinutes < endMins) {
      return { status: slot.status, label: slot.status === 'free' ? 'Available Now' : 'On Trip', slot };
    }
  }
  return { status: 'off', label: 'Off Shift' };
}

export function getDriverScheduleStatus(driver) {
  return getCurrentScheduleStatus(driver?.schedule);
}

export function getScheduleBlocks(schedule) {
  if (!schedule) return [];
  return schedule.map(slot => {
    const startParts = slot.start.match(/(\d+):(\d+)\s*(AM|PM)/i);
    const endParts = slot.end.match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (!startParts || !endParts) return null;

    let startH = parseInt(startParts[1], 10);
    let startM = parseInt(startParts[2], 10);
    if (startParts[3].toUpperCase() === 'PM' && startH !== 12) startH += 12;
    if (startParts[3].toUpperCase() === 'AM' && startH === 12) startH = 0;

    let endH = parseInt(endParts[1], 10);
    let endM = parseInt(endParts[2], 10);
    if (endParts[3].toUpperCase() === 'PM' && endH !== 12) endH += 12;
    if (endParts[3].toUpperCase() === 'AM' && endH === 12) endH = 0;

    const startMin = startH * 60 + startM;
    const endMin = endH * 60 + endM;
    const duration = endMin - startMin;

    return {
      ...slot,
      startMin,
      endMin,
      duration,
      label: slot.status === 'free' ? 'Free' : 'Busy',
      isFree: slot.status === 'free',
    };
  }).filter(Boolean);
}

export function timeToMinutes(timeStr) {
  if (!timeStr || timeStr === 'Will Call') return 1440;
  const m = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m) return 1440;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (m[3].toUpperCase() === 'PM' && h !== 12) h += 12;
  if (m[3].toUpperCase() === 'AM' && h === 12) h = 0;
  return h * 60 + min;
}
