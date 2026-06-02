/**
 * ENTERPRISE AI ENGINE — Powered by Gemini 2.0 Flash
 * Central intelligence hub for the entire NEMT fleet platform.
 */
import { GEMINI_API_CONFIG } from './firebase';
import { getDistanceMiles } from './maps';

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_CONFIG().apiKey}`;

async function callGemini(prompt) {
  try {
    const resp = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
      }),
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      console.error(`[AI] Gemini API error: ${resp.status} ${resp.statusText}`, errText.slice(0, 500));
      return null;
    }
    const data = await resp.json();
    let text = data?.candidates?.[0]?.parts?.[0]?.text || '';
    text = text.replace(/```json\s*/gi, '').replace(/```\s*$/gi, '').trim();
    return text;
  } catch (err) {
    console.error('[AI] callGemini network error:', err);
    return null;
  }
}

// ==================== ROUTE OPTIMIZATION ====================

export async function optimizeRoute(trips, driverLocation) {
  const prompt = `You are a route optimization AI for a NEMT fleet. Given the driver's current location and a list of trips with pickup/dropoff addresses and times, determine the optimal order.

Driver location: ${driverLocation}

Trips:
${JSON.stringify(trips.map(t => ({ id: t.id, patient: t.patient, pickup: t.pickup, dropoff: t.dropoff, time: t.time })), null, 2)}

Return a JSON array of trip IDs in optimal order. Consider: nearest pickup first, appointment times, and logical routing. Return ONLY the JSON array. No explanation.`;

  const text = await callGemini(prompt);
  if (!text) {
    console.warn('[AI] optimizeRoute: no response from Gemini, returning original order');
    return trips.map(t => t.id);
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    console.error('[AI] optimizeRoute: failed to parse Gemini response:', text.slice(0, 200), err);
    return trips.map(t => t.id);
  }
}

// ==================== DRIVER MATCHING ====================

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
  } catch (err) {
    console.error('Gemini API call failed:', err);
    return null;
  }
}

export async function suggestBatchAssignment(unassignedTrips, drivers, allTrips = []) {
  const activeStatuses = new Set(['Assigned', 'In Mission', 'En Route', 'At Pickup', 'At Dropoff', 'In Progress', 'Navigating Pickup', 'Navigating Dropoff', 'In Transit', 'Arrived']);
  const driverProfiles = drivers.map(d => {
    const activeTrips = allTrips.filter(t => t.driverId === d.id && activeStatuses.has(t.status));
    return {
      id: d.id, name: d.name, vehicle: d.vehicle, currentZone: d.currentZone,
      status: d.status, clockedIn: d.clockedIn,
      assignedDispatcher: d.assignedDispatcher || d.assignedTo || null,
      activeTripCount: activeTrips.length,
      nextTripTime: activeTrips.filter(t => t.time && t.time !== 'Will Call').sort((a, b) => timeToSortValue(a.time) - timeToSortValue(b.time))[0]?.time || null,
    };
  });
  const tripProfiles = unassignedTrips.map(t => ({
    id: t.id, patient: t.patient, pickup: t.pickup, dropoff: t.dropoff,
    time: t.time, date: t.date, type: t.type, priority: t.priority, mobility: t.mobility,
  }));

  const prompt = `You are a fleet dispatch AI. Given unassigned trips and available drivers, suggest the optimal assignment for each trip.

Unassigned Trips:
${JSON.stringify(tripProfiles, null, 2)}

Available Drivers:
${JSON.stringify(driverProfiles, null, 2)}

Return a JSON object where keys are trip IDs and values are driver IDs. Consider appointment time, pickup/dropoff location, grouped route volume, activeTripCount, currentZone, status, clocked-in readiness, vehicle fit, and workload balance. Only use driver IDs from the supplied list. Return ONLY the JSON object. No explanation.`;

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

// ==================== LOG ANALYSIS & INTELLIGENCE ====================

export async function analyzeActivityLogs(logs) {
  if (!logs || logs.length === 0) return { summary: 'No recent activity.', mistakes: [] };
  const recentLogs = logs.slice(0, 50);
  const prompt = `You are an AI oversight system for a NEMT fleet.
Analyze the following recent system audit logs to summarize what the team has been doing, and flag any operational mistakes or suspicious activity.

Logs:
${JSON.stringify(recentLogs.map(l => ({ timestamp: l.timestamp, type: l.t, details: l.d })), null, 2)}

Return a JSON object with two fields:
1. "summary": A concise 2-3 sentence summary of what the team has been working on recently.
2. "mistakes": An array of strings describing potential mistakes, inefficiencies, or suspicious actions found in the logs.

Return ONLY the JSON object. No markdown.`;

  const text = await callGemini(prompt);
  if (!text) return { summary: 'AI unavailable at the moment.', mistakes: [] };
  try {
    return JSON.parse(text);
  } catch {
    return { summary: 'Failed to analyze logs.', mistakes: [] };
  }
}

export async function aiPrioritizeTrips(trips) {
  if (!trips || trips.length === 0) return [];
  const prompt = `You are a NEMT fleet dispatch AI. Prioritize these trips for operational efficiency.

Trips:
${JSON.stringify(trips.map(t => ({ id: t.id, patient: t.patient, time: t.time, status: t.status, priority: t.priority, pickup: t.pickup, dropoff: t.dropoff, clientConfirmation: t.clientConfirmation })), null, 2)}

Consider: late trips first, then soonest appointment time, then unassigned trips, then high-priority trips, then confirmed trips. Return a JSON array of trip IDs in optimal operational priority order (most urgent first). Return ONLY the JSON array. No explanation.`;

  const text = await callGemini(prompt);
  if (!text) return trips.map(t => t.id);
  try { return JSON.parse(text); } catch { return trips.map(t => t.id); }
}

export async function analyzeActivityLogsV2(logs) {
  if (!logs || logs.length === 0) return null;
  const prompt = `You are an enterprise AI security analyst for a NEMT fleet platform. Analyze these audit logs deeply.

Logs (last 100):
${JSON.stringify(logs.slice(0, 100).map(l => ({ ts: l.timestamp, user: l.user || l.u, action: l.action || l.t, details: l.details || l.d })), null, 2)}

Return JSON:
{
  "summary": "Executive summary of recent activity (2-3 sentences)",
  "securityFlags": ["flag1", "flag2"] (suspicious access patterns, failed logins, unauthorized actions),
  "efficiencyScore": <0-100>,
  "topPerformer": "name of most active productive user or null",
  "bottlenecks": ["description of workflow bottlenecks"],
  "suggestedActions": ["action1", "action2"]
}
Return ONLY JSON. No markdown.`;
  const text = await callGemini(prompt);
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

// ==================== REPORTING & ANALYTICS ====================

export async function aiAnalyzeTrips(trips, stats) {
  if (!trips || trips.length === 0) return null;
  const prompt = `You are a NEMT fleet reporting AI. Analyze these completed trips and provide insights.

Report Period Stats:
${JSON.stringify(stats, null, 2)}

Trips (first 50):
${JSON.stringify(trips.slice(0, 50).map(t => ({ patient: t.patient, time: t.time, status: t.status, driver: t.driverName, pickup: t.pickup, dropoff: t.dropoff, arrivalTime: t.arrivalTime, departedPickupTime: t.departedPickupTime, arrivalDropoffTime: t.arrivalDropoffTime, distance: t.distance, travelTime: t.travelTime })), null, 2)}

Return a JSON object with:
{
  "summary": "2-3 sentence executive summary of the reporting period",
  "trends": ["trend 1", "trend 2", ...],
  "anomalies": ["anomaly 1", "anomaly 2", ...],
  "recommendations": ["recommendation 1", "recommendation 2", ...]
}
Return ONLY the JSON object. No markdown.`;

  const text = await callGemini(prompt);
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

export async function aiGenerateNarrativeReport(trips, driverTelemetry, dateRange) {
  if (!trips || trips.length === 0) return null;
  const prompt = `You are an executive reporting AI for a NEMT transportation company. Generate a comprehensive narrative report.

Date Range: ${dateRange}
Total Trips: ${trips.length}
Completed: ${trips.filter(t => t.status === 'Completed').length}
Cancelled: ${trips.filter(t => t.status === 'Cancelled').length}
No Show: ${trips.filter(t => t.status === 'No Show').length}
Unique Drivers: ${new Set(trips.map(t => t.driverName || t.driverId)).size}
Total Distance: ${trips.reduce((s, t) => s + (parseFloat(t.distance) || 0), 0).toFixed(1)} mi
Avg Travel Time: ${trips.filter(t => t.travelTime).reduce((s, t) => s + (parseInt(t.travelTime) || 0), 0) / Math.max(trips.filter(t => t.travelTime).length, 1)} min

Return a JSON object:
{
  "executiveSummary": "3-4 sentence executive overview",
  "keyMetrics": { "onTimeRate": "X%", "avgResponseTime": "X min", "busiestHour": "HH:00", "peakDay": "Day name" },
  "driverPerformance": [{"name": "driver", "trips": N, "avgDuration": "X min", "rating": "Good/Fair/Needs Improvement"}],
  "operationalInsights": ["insight1", "insight2"],
  "costOptimization": ["suggestion1", "suggestion2"],
  "riskFactors": ["risk1", "risk2"]
}
Return ONLY JSON. No markdown.`;
  const text = await callGemini(prompt);
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

// ==================== PREDICTIVE ANALYTICS ====================

export async function aiPredictEta(trip, currentTraffic = 'moderate') {
  const prompt = `You are a predictive ETA AI for a NEMT fleet. Estimate the travel time between pickup and dropoff.

Pickup: ${trip.pickup || 'Unknown'}
Dropoff: ${trip.dropoff || 'Unknown'}
Traffic: ${currentTraffic}
Distance: ${trip.distance ? trip.distance + ' mi' : 'Unknown'}

Return a JSON object:
{
  "estimatedMinutes": <number>,
  "confidence": "high/medium/low",
  "factors": ["factor1", "factor2"]
}
Return ONLY JSON. No markdown.`;
  const text = await callGemini(prompt);
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

export async function aiPredictNoShowRisk(trip) {
  const prompt = `You are a predictive AI for NEMT operations. Assess the no-show risk for this trip.

Trip: ${JSON.stringify({ patient: trip.patient, time: trip.time, pickup: trip.pickup, dropoff: trip.dropoff, status: trip.status, clientConfirmation: trip.clientConfirmation, notes: trip.notes }, null, 2)}

Return JSON:
{
  "riskScore": <0-100>,
  "riskLevel": "low/medium/high",
  "reason": "brief explanation",
  "recommendedAction": "action to mitigate risk"
}
Return ONLY JSON. No markdown.`;
  const text = await callGemini(prompt);
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

// ==================== DRIVER ANALYTICS ====================

export async function aiAnalyzeDriver(driver, trips) {
  const prompt = `You are an AI fleet performance analyst. Evaluate this driver's performance.

Driver: ${JSON.stringify({ name: driver.name, vehicle: driver.vehicle, status: driver.status, joinedDate: driver.joinedDate || 'N/A' }, null, 2)}

Recent Trips (${trips.length}):
${JSON.stringify(trips.slice(0, 30).map(t => ({ patient: t.patient, time: t.time, status: t.status, pickup: t.pickup, dropoff: t.dropoff, arrivalTime: t.arrivalTime, arrivalDropoffTime: t.arrivalDropoffTime, distance: t.distance })), null, 2)}

Return JSON:
{
  "performanceScore": <0-100>,
  "strengths": ["strength1", "strength2"],
  "areasForImprovement": ["area1", "area2"],
  "reliabilityRating": "Excellent/Good/Fair/Poor",
  "avgResponseTime": "X min",
  "suggestedRoutePreference": "Urban/Suburban/Mixed",
  "notes": "brief personalized note"
}
Return ONLY JSON. No markdown.`;
  const text = await callGemini(prompt);
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

// ==================== CONFLICT DETECTION ====================

export async function aiDetectConflicts(trips, drivers) {
  if (!trips || trips.length < 2) return [];
  const prompt = `You are an AI conflict detection system for a NEMT fleet. Analyze these trips for scheduling conflicts.

Trips:
${JSON.stringify(trips.slice(0, 30).map(t => ({ id: t.id, patient: t.patient, time: t.time, status: t.status, driverId: t.driverId, driverName: t.driverName || t.driver, pickup: t.pickup, dropoff: t.dropoff })), null, 2)}

Drivers:
${JSON.stringify(drivers.map(d => ({ id: d.id, name: d.name, status: d.status })), null, 2)}

Return a JSON array of conflict objects:
[{ "type": "double_booking|tight_transition|overlap|unassigned_urgent", "severity": "critical|warning|info", "tripIds": ["id1", "id2"], "description": "Human-readable conflict description", "suggestion": "How to resolve" }]
Return ONLY the JSON array. No markdown.`;
  const text = await callGemini(prompt);
  if (!text) return [];
  try { return JSON.parse(text); } catch { return []; }
}

// ==================== COMMUNICATIONS ====================

export async function aiSuggestReply(conversationHistory, tripContext) {
  const prompt = `You are an AI customer service assistant for a NEMT company. Suggest a reply to this client conversation.

Trip Context: ${JSON.stringify({ patient: tripContext.patient, time: tripContext.time, pickup: tripContext.pickup, dropoff: tripContext.dropoff }, null, 2)}

Conversation:
${conversationHistory.map(m => `${m.direction === 'outbound' ? 'Agent' : 'Client'}: ${m.body || m.text}`).join('\n')}

Return a JSON object:
{
  "suggestedReply": "your suggested reply text",
  "tone": "professional/empathetic/urgent",
  "intent": "confirmation/cancellation/reschedule/inquiry"
}
Return ONLY JSON. No markdown.`;
  const text = await callGemini(prompt);
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

export async function aiAnalyzeSentiment(message) {
  const prompt = `Analyze the sentiment of this message from a NEMT client:

Message: "${message}"

Return JSON:
{"sentiment": "positive/negative/neutral/urgent", "score": <-1 to 1>, "keyPhrases": ["phrase1", "phrase2"]}
Return ONLY JSON. No markdown.`;
  const text = await callGemini(prompt);
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

// ==================== SECURITY & COMPLIANCE ====================

export async function aiSecurityAnalysis(users, logs) {
  const prompt = `You are an enterprise security AI. Analyze user activity for security concerns.

Users: ${JSON.stringify(users.map(u => ({ email: u.email, role: u.role, lastLogin: u.lastLogin, disabled: u.disabled })), null, 2)}

Recent Activity:
${JSON.stringify((logs || []).slice(0, 50).map(l => ({ user: l.user || l.u, action: l.action || l.t, timestamp: l.timestamp })), null, 2)}

Return JSON:
{
  "securityScore": <0-100>,
  "flags": [{"severity": "critical/high/medium/low", "description": "issue", "recommendation": "fix"}],
  "inactiveAccounts": ["email1", "email2"],
  "suspiciousActivity": ["activity1", "activity2"],
  "complianceStatus": "compliant/attention_needed/critical"
}
Return ONLY JSON. No markdown.`;
  const text = await callGemini(prompt);
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

// ==================== OPERATIONAL INSIGHTS ====================

export async function aiOptimizeFleet(trips, drivers) {
  const active = trips.filter(t => !['Completed', 'Cancelled', 'No Show'].includes(t.status));
  const prompt = `You are a fleet optimization AI. Analyze current fleet state and provide optimization recommendations.

Active Trips: ${active.length}
Available Drivers: ${drivers.filter(d => d.status === 'Available').length}
Total Drivers: ${drivers.length}

Trips:
${JSON.stringify(active.slice(0, 40).map(t => ({ id: t.id, patient: t.patient, time: t.time, status: t.status, driverId: t.driverId, pickup: t.pickup, dropoff: t.dropoff })), null, 2)}

Drivers:
${JSON.stringify(drivers.map(d => ({ id: d.id, name: d.name, status: d.status, vehicle: d.vehicle, currentZone: d.currentZone, activeTrips: active.filter(t => t.driverId === d.id).length })), null, 2)}

Return JSON:
{
  "fleetEfficiency": <0-100>,
  "underutilizedDrivers": ["name1", "name2"],
  "overloadedDrivers": ["name1"],
  "rebalancingSuggestions": ["move driver X to zone Y"],
  "projectedCompletionRate": "X%",
  "estimatedOvertimeRisk": "low/medium/high"
}
Return ONLY JSON. No markdown.`;
  const text = await callGemini(prompt);
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

// ==================== UTILITY FUNCTIONS ====================

export async function sortTripsByProximity(trips, referenceAddress) {
  const prompt = `You are a logistics AI. Sort these trips by proximity to the reference address (closest first).

Reference: ${referenceAddress}

Trips:
${JSON.stringify(trips.map(t => ({ id: t.id, patient: t.patient, pickup: t.pickup, dropoff: t.dropoff })), null, 2)}

Return a JSON array of trip IDs sorted by proximity to reference. Return ONLY the array. No explanation.`;

  const text = await callGemini(prompt);
  if (!text) return trips.map(t => t.id);
  try { return JSON.parse(text); } catch { return trips.map(t => t.id); }
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

export async function suggestOptimalDriver(trip, drivers = [], allTrips = []) {
  const now = new Date();
  const currentTimeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  const activeStatuses = new Set(['Assigned', 'In Mission', 'En Route', 'At Pickup', 'At Dropoff', 'In Progress', 'Navigating Pickup', 'Navigating Dropoff', 'In Transit', 'Arrived']);

  const driverProfiles = await Promise.all(drivers.map(async (d) => {
    const currentScheduleStatus = getCurrentScheduleStatus(d.schedule);
    const assignedTrips = allTrips.filter(t => t.driverId === d.id && activeStatuses.has(t.status));
    const nextTrip = [...assignedTrips].filter(t => t.time && t.time !== 'Will Call').sort((a, b) => timeToSortValue(a.time) - timeToSortValue(b.time))[0] || assignedTrips[0] || null;
    const liveLocation = typeof d.latitude === 'number' && typeof d.longitude === 'number' ? { lat: d.latitude, lng: d.longitude } : (typeof d.lat === 'number' && typeof d.lng === 'number' ? { lat: d.lat, lng: d.lng } : null);
    let pickupDistanceMiles = null;
    try { pickupDistanceMiles = await getDistanceMiles(liveLocation || d.currentZone, trip.pickup); } catch { pickupDistanceMiles = null; }
    return {
      id: d.id, name: d.name, vehicle: d.vehicle, status: d.status,
      currentZone: d.currentZone, dist: d.dist, clockedIn: d.clockedIn,
      liveLocation, assignedDispatcher: d.assignedDispatcher || d.assignedTo || null,
      schedule: d.schedule, currentScheduleStatus,
      assignedTripCount: assignedTrips.length, activeTripIds: assignedTrips.map(t => t.id),
      nextTripPickup: nextTrip?.pickup || null, nextTripTime: nextTrip?.time || null,
      pickupDistanceMiles: typeof pickupDistanceMiles === 'number' && Number.isFinite(pickupDistanceMiles) ? Number(pickupDistanceMiles.toFixed(1)) : null,
    };
  }));

  const prompt = `You are a NEMT fleet dispatch AI. Given a trip that needs assignment, select the OPTIMAL driver.

TRIP TO ASSIGN:
${JSON.stringify({ id: trip.id, patient: trip.patient, pickup: trip.pickup, dropoff: trip.dropoff, time: trip.time, date: trip.date, priority: trip.priority, mobility: trip.mobility, notes: trip.notes }, null, 2)}

AVAILABLE DRIVERS:
${JSON.stringify(driverProfiles, null, 2)}

Current time: ${currentTimeStr}

Return JSON:
{
  "driverId": "best driver ID",
  "score": <0-100>,
  "reason": "brief 1-sentence explanation"
}
Return ONLY the JSON. No other text.`;

  const text = await callGemini(prompt);
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

// ==================== SCHEDULE MANAGEMENT ====================

function timeToSortValue(time) {
  if (!time || time === 'Will Call') return Number.MAX_SAFE_INTEGER;
  const match = String(time).match(/(\d+):(\d+)\s*(AM|PM)?/i);
  if (!match) return Number.MAX_SAFE_INTEGER;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const meridiem = match[3]?.toUpperCase();
  if (meridiem === 'PM' && hours !== 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

function getCurrentScheduleStatus(schedule) {
  if (!schedule || schedule.length === 0) return { status: 'unknown', label: 'No Schedule' };
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  for (const slot of schedule) {
    const startParts = slot.start.match(/(\d+):(\d+)\s*(AM|PM)/i);
    const endParts = slot.end.match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (!startParts || !endParts) continue;
    let startH = parseInt(startParts[1], 10); let startM = parseInt(startParts[2], 10);
    if (startParts[3].toUpperCase() === 'PM' && startH !== 12) startH += 12;
    if (startParts[3].toUpperCase() === 'AM' && startH === 12) startH = 0;
    let endH = parseInt(endParts[1], 10); let endM = parseInt(endParts[2], 10);
    if (endParts[3].toUpperCase() === 'PM' && endH !== 12) endH += 12;
    if (endParts[3].toUpperCase() === 'AM' && endH === 12) endH = 0;
    const startMins = startH * 60 + startM;
    const endMins = endH * 60 + endM;
    if (currentMinutes >= startMins && currentMinutes < endMins)
      return { status: slot.status, label: slot.status === 'free' ? 'Available Now' : 'On Trip', slot };
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
    let startH = parseInt(startParts[1], 10); let startM = parseInt(startParts[2], 10);
    if (startParts[3].toUpperCase() === 'PM' && startH !== 12) startH += 12;
    if (startParts[3].toUpperCase() === 'AM' && startH === 12) startH = 0;
    let endH = parseInt(endParts[1], 10); let endM = parseInt(endParts[2], 10);
    if (endParts[3].toUpperCase() === 'PM' && endH !== 12) endH += 12;
    if (endParts[3].toUpperCase() === 'AM' && endH === 12) endH = 0;
    const startMin = startH * 60 + startM;
    const endMin = endH * 60 + endM;
    return { ...slot, startMin, endMin, duration: endMin - startMin, label: slot.status === 'free' ? 'Free' : 'Busy', isFree: slot.status === 'free' };
  }).filter(Boolean);
}

export const useGeminiOptimization = () => {
  const optimizeRoute = async (trips, currentLocation) => {
    if (!trips || trips.length === 0) return null;
    const prompt = `You are an intelligent route optimization AI for a transportation company.

Current Driver Location: Latitude ${currentLocation.lat}, Longitude ${currentLocation.lng}

Trips to Optimize:
${trips.map((trip, idx) => `
Trip ${idx + 1}:
- Client: ${trip.clientName}
- Booking ID: ${trip.id}
- Pickup: (${trip.pickupLat}, ${trip.pickupLng})
- Dropoff: (${trip.dropoffLat}, ${trip.dropoffLng})
- Urgency: ${trip.urgency}
- Time Window: ${trip.timeWindow || 'Flexible'}
`).join('\n')}

Respond in JSON:
{
  "optimizedSequence": ["trip_id1", "trip_id2", ...],
  "suggestions": ["suggestion1", "suggestion2", ...],
  "estimatedTimeSavings": "X minutes"
}`;
    try {
      const text = await callGemini(prompt);
      if (text) return JSON.parse(text);
      return null;
    } catch { return null; }
  };
  return { optimizeRoute };
};
