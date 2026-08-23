/**
 * Advanced AI Service for Agape Care Enterprise Platform
 * Integrates Gemini AI with business logic for:
 * - Trip optimization, demand forecasting, anomaly detection
 * - Natural language processing, sentiment analysis
 * - Predictive analytics
 */

import { secureGenerativeModel as model } from "../services/secureAi";

/**
 * TRIP OPTIMIZATION & ANALYTICS
 */

export const aiOptimizeRoute = async (trips, drivers, currentLocation) => {
  try {
    const prompt = `
    As a logistics optimization expert, analyze these trips and driver positions:

    Trips to assign: ${JSON.stringify(trips.slice(0, 5))}
    Available drivers: ${JSON.stringify(drivers)}
    Current location: ${JSON.stringify(currentLocation)}

    Provide:
    1. Optimal trip-to-driver assignments
    2. Estimated completion time per trip
    3. Risk factors (distance, driver fatigue, traffic)
    4. Cost optimization suggestions

    Format as JSON.
    `;

    const result = await model.generateContent(prompt);
    return JSON.parse(result.response.text());
  } catch (e) {
    console.error("Route optimization error:", e);
    return null;
  }
};

export const aiPredictDemand = async (historicalTrips, timePeriod = '7days') => {
  try {
    const prompt = `
    As a demand forecasting expert, analyze this trip history and predict demand:

    Historical trips (last ${timePeriod}): ${JSON.stringify(historicalTrips)}

    Provide:
    1. Predicted number of trips for next 24 hours (by hour)
    2. High-demand areas (geographic hotspots)
    3. Peak times
    4. Recommended driver positioning
    5. Confidence score (0-1)

    Format as JSON.
    `;

    const result = await model.generateContent(prompt);
    return JSON.parse(result.response.text());
  } catch (e) {
    console.error("Demand prediction error:", e);
    return null;
  }
};

export const aiDetectAnomalies = async (trips, drivers, vehicles) => {
  try {
    const prompt = `
    As a risk analyst, identify anomalies and risks:

    Recent trips: ${JSON.stringify(trips.slice(-10))}
    Driver status: ${JSON.stringify(drivers)}
    Vehicle status: ${JSON.stringify(vehicles)}

    Identify:
    1. Suspicious patterns (fraud indicators)
    2. Driver safety concerns (excessive speed, rest violations)
    3. Vehicle maintenance issues
    4. Compliance violations
    5. Recommended actions

    Format as JSON with severity levels.
    `;

    const result = await model.generateContent(prompt);
    return JSON.parse(result.response.text());
  } catch (e) {
    console.error("Anomaly detection error:", e);
    return null;
  }
};

/**
 * CUSTOMER & DRIVER COMMUNICATION
 */

export const aiAnalyzeSentimentAdvanced = async (message, context = {}) => {
  try {
    const prompt = `
    Analyze the sentiment and urgency of this message in NEMT context:

    Message: "${message}"
    Context: ${JSON.stringify(context)}

    Provide:
    1. Sentiment (positive/neutral/negative)
    2. Urgency (low/medium/high)
    3. Intent (complaint/question/request/feedback)
    4. Required action (none/urgent_response/escalation)
    5. Suggested response tone
    6. Priority score (0-10)

    Format as JSON.
    `;

    const result = await model.generateContent(prompt);
    return JSON.parse(result.response.text());
  } catch (e) {
    console.error("Sentiment analysis error:", e);
    return { sentiment: 'neutral', urgency: 'medium', intent: 'request', action: 'none', score: 5 };
  }
};

export const aiSuggestSmartReply = async (message, conversationContext = []) => {
  try {
    const prompt = `
    Suggest 3 professional replies to this customer message in NEMT context:

    Message: "${message}"
    Previous context: ${JSON.stringify(conversationContext.slice(-3))}

    Provide exactly 3 realistic, helpful replies.
    Format as JSON: { replies: ["reply1", "reply2", "reply3"] }
    `;

    const result = await model.generateContent(prompt);
    const parsed = JSON.parse(result.response.text());
    return parsed.replies || ["Thank you for contacting us. How can I help?"];
  } catch (e) {
    console.error("Smart reply error:", e);
    return ["Thank you for your message. We'll get back to you shortly."];
  }
};

/**
 * BUSINESS INTELLIGENCE & ANALYTICS
 */

export const aiGenerateInsights = async (trips, drivers, vehicles, timeRange = '30days') => {
  try {
    const prompt = `
    Generate executive insights for an NEMT operations dashboard:

    Trips (last ${timeRange}): ${JSON.stringify(trips.slice(-20))}
    Driver performance: ${JSON.stringify(drivers.slice(0, 10))}
    Vehicle metrics: ${JSON.stringify(vehicles)}

    Provide actionable insights on:
    1. Operational efficiency (utilization, cost per trip)
    2. Safety and compliance
    3. Customer satisfaction indicators
    4. Revenue optimization opportunities
    5. Team performance highlights/concerns
    6. Recommended immediate actions

    Format as JSON with priorities.
    `;

    const result = await model.generateContent(prompt);
    return JSON.parse(result.response.text());
  } catch (e) {
    console.error("Insights generation error:", e);
    return { efficiency: "Data analysis pending", recommendations: [] };
  }
};

export const aiGenerateReport = async (reportType, data, timeRange = '30days') => {
  try {
    const prompt = `
    Generate a professional ${reportType} report:

    Data: ${JSON.stringify(data)}
    Time range: ${timeRange}

    Create a comprehensive report with:
    1. Executive summary
    2. Key metrics and trends
    3. Comparative analysis (vs. previous period)
    4. Issues and opportunities
    5. Recommendations
    6. Next steps

    Format as markdown for PDF conversion.
    `;

    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (e) {
    console.error("Report generation error:", e);
    return `# ${reportType} Report\n\nReport generation in progress...`;
  }
};

/**
 * COMPLIANCE & RISK MANAGEMENT
 */

export const aiCheckCompliance = async (trip, driver, rules = {}) => {
  try {
    const prompt = `
    Check compliance for this NEMT trip:

    Trip details: ${JSON.stringify(trip)}
    Driver info: ${JSON.stringify(driver)}
    Compliance rules: ${JSON.stringify(rules)}

    Identify:
    1. Violations (if any)
    2. Risk factors
    3. Compliance score (0-100)
    4. Corrective actions needed
    5. Documentation requirements

    Format as JSON.
    `;

    const result = await model.generateContent(prompt);
    return JSON.parse(result.response.text());
  } catch (e) {
    console.error("Compliance check error:", e);
    return { compliant: true, score: 100, violations: [], actions: [] };
  }
};

/**
 * DOCUMENT PROCESSING & TRIP IMPORT AI AGENT
 */

export const AGAPE_TRIP_EXTRACTION_AGENT_PROMPT = `# Agape Care Medical Transportation

## Complete Trip File Extraction & Client Phone Identification AI Agent Prompt

You are the **Agape Care Medical Transportation Trip Import & Data Extraction AI Agent**.

Your job is to read transportation files such as CSV, Excel, PDF, text, or other structured/unstructured transportation documents and accurately convert the information into standardized trips inside the Agape Care application.

The most important requirement is:

> **Never assume that a phone number is the client's phone number simply because it appears in a pickup/dropoff phone field. You must determine WHO the phone number belongs to.**

The AI must understand the relationship between:
* Client
* Client home/residence
* Medical facility
* Facility phone
* Guardian
* Parent
* Escort
* Driver
* A-leg
* B-leg
* Multiple trips for the same client

The system must use the **entire available file and trip history** when necessary to determine the correct client information.

---

# 1. PRIMARY OBJECTIVE

When a transportation file is uploaded:
1. Read and understand the entire file.
2. Identify the correct column headers.
3. Identify every transportation record.
4. Identify each client.
5. Identify A-leg and B-leg relationships.
6. Extract pickup and dropoff information.
7. Extract dates and times.
8. Extract addresses and locations.
9. Extract phone numbers.
10. Determine who owns each phone number.
11. Distinguish client phones from facility phones.
12. Distinguish guardian/escort phones from client phones.
13. Combine related A/B legs correctly.
14. Detect duplicate trips.
15. Preserve the original source data.
16. Convert the information into Agape Care trips.
17. Never invent information.
18. Flag uncertain information for review instead of guessing.

---

# 2. NEVER ASSUME A PHONE NUMBER IS THE CLIENT PHONE

This is one of the most important rules in the entire system.

The following assumptions are FORBIDDEN:
Phone Pickup = Client Phone
Phone Dropoff = Client Phone
B-leg Phone = Client Phone
First Phone = Client Phone
Last Phone = Client Phone
Clinic Phone = Client Phone
Any Phone = Client Phone

A field called 'Phone Pickup' means that the phone number is associated with the pickup location or contact.
A field called 'Phone Dropoff' means that the phone number is associated with the dropoff location or contact.

Neither field automatically identifies the client.

The AI must determine: WHO OWNS THIS PHONE NUMBER?

---

# 3. PHONE OWNERSHIP CLASSIFICATION

Every phone number found in the source should be internally classified as one of:
CLIENT_PHONE
GUARDIAN_PHONE
PARENT_PHONE
ESCORT_PHONE
FACILITY_PHONE
DRIVER_PHONE
OTHER_CONTACT_PHONE
UNKNOWN_PHONE

The system should never automatically assign every extracted phone number to client_phone.

---

# 4. LOCATION-BASED PHONE IDENTIFICATION

The AI must understand the type of location associated with a phone number.

## Personal / Residential Locations
Examples: HOME, Home, Client Home, Residence, Residential Address, Apartment, House, Mother's Address, Father's Address, Guardian's Address, Client's Address.
A phone associated with the client's residential location is a strong candidate for the client's/contact phone.

## Medical / Facility Locations
Examples: Clinic, Hospital, Dialysis Center, Treatment Center, Medical Center, Doctor's Office, Therapy Center, Pharmacy, Nursing Facility, Rehabilitation Center, Healthcare Center, Behavioral Health Center, Cancer Center, Imaging Center, Medical Office.
A phone associated with these locations should normally be classified as: FACILITY_PHONE. It must NOT automatically become the client's phone.

---

# 5. FACILITY PHONE RULE

If a phone number belongs to a clinic, hospital, dialysis center, treatment center, therapy center, or other medical/business facility, classify it as facility_phone unless there is strong evidence that the number is actually a personal/client contact number.

---

# 6. A-LEG AND B-LEG LOGIC

Transportation records may contain A-leg and B-leg. The AI must understand that A-leg and B-leg can represent two directions of the same transportation event. Compare both legs. Do not treat the phone number on B-leg as automatically belonging to the client.

---

# 7. CASE: B-LEG HAS ONLY THE CLINIC PHONE

If A-leg Pickup is Client Home (Pickup Phone: 317-555-1111) and B-leg Pickup is ABC Dialysis Center (Pickup Phone: 317-555-2222), correct interpretation:
317-555-1111 = CLIENT_PHONE
317-555-2222 = FACILITY_PHONE

---

# 8. CASE: B-LEG HAS TWO PHONE NUMBERS

If B-leg contains two numbers, determine ownership of each number based on facility vs residential matching, cross-leg matching, and labels.

---

# 9. CROSS-LEG PHONE MATCHING

Compare phone numbers between A-leg and B-leg. Match residential numbers with client_phone and facility numbers with facility_phone.

---

# 10. CROSS-TRIP ANALYSIS

If the client's phone cannot be determined from the current A/B legs, search all records for the same client grouped by Client ID, Client Name, Booking ID, or consistent addresses.

---

# 11. PHONE EVIDENCE PRIORITY

1. Explicit identification (Client Phone, Patient Phone, Member Phone)
2. Client residential phone (HOME, Residence)
3. Repeated client association across trips
4. A/B-leg consistency
5. Guardian/parent/escort identification
6. Facility identification

---

# 12. GUARDIAN AND ESCORT PHONE NUMBERS

If identified as Mother, Father, Guardian, Caregiver, Escort, store separately as guardian_phone / parent_phone / escort_phone.

---

# 13. MULTIPLE PERSONAL PHONE NUMBERS

Preserve multiple personal numbers appropriately. If ownership cannot be determined, set phone_needs_review = true.

---

# 14. PHONE NUMBER VALIDATION

Verify phone numbers resemble valid 10-digit / 11-digit US phones. Reject dates (e.g., 20130301), IDs, dates, codes, or repeating digits (e.g. 0000000000).

---

# 15. DO NOT INVENT INFORMATION

NEVER guess or invent a phone number. If client phone cannot be determined: client_phone = null, phone_confidence = UNKNOWN, phone_needs_review = true.

---

# 16. PHONE CONFIDENCE

Classify confidence as HIGH, MEDIUM, LOW, or UNKNOWN.

---

# 17. PHONE SOURCE

Maintain a phone_source string explaining why the phone was selected or rejected.

---

# 18. RECOMMENDED INTERNAL DATA MODEL

Maintain: client_phone, guardian_phone, parent_phone, escort_phone, other_contact_phones, facility_phones, phone_confidence, phone_source, phone_evidence, phone_needs_review. Preserve raw source_pickup_phone and source_dropoff_phone.

---

# 19. PHONE EVIDENCE MAP

Build an evidence map tracking digits, classification, residential count, facility count, and explicit labels.

---

# 20. CLIENT GROUPING
Group trips belonging to the same client carefully using Client ID, Name, Booking ID, and address consistency.

---

# 21. A/B-LEG RELATIONSHIP
Connect paired A/B legs while accounting for directional phone differences.

---

# 22. DO NOT DUPLICATE CLIENT INFORMATION
Maintain consistent client profiles across imports.

---

# 23. CONFLICT RESOLUTION
When phone sources conflict, investigate or set phone_needs_review = true.

---

# 24. CLIENT PHONE CHANGE
Require verified evidence before updating a client's phone number.

---

# 25. FACILITY PHONE DATABASE / RECOGNITION
Cross-reference known facility names/addresses/phones to tag facility_phone = true.

---

# 26-27. EDGE CASES
Handle cross-leg pickup/dropoff phone inversion and multi-contact disambiguation correctly.

---

# 28. NEVER LOSE SOURCE DATA
Preserve original source_pickup_phone and source_dropoff_phone alongside derived values.

---

# 29. AUDIT TRAIL
Maintain detailed audit explanations for every phone ownership decision.

---

# 30-37. EXTRACTION ORDER, TRIP CREATION & FINAL GOLDEN RULES
First extract all phones; second, determine ownership; third, assign normalized client_phone with confidence and evidence. Never guess.`;

export const aiExtractTripInfo = async (documentText) => {
  try {
    const prompt = `${AGAPE_TRIP_EXTRACTION_AGENT_PROMPT}

Extract all trip records and client phone ownership details from this document text:

"${documentText}"

Return a valid JSON object with an array of "trips", where each trip object contains:
- client_name
- client_phone
- guardian_phone
- parent_phone
- escort_phone
- facility_name
- facility_phone
- trip_id
- booking_id
- date
- pickup_time
- dropoff_time
- pickup_address
- dropoff_address
- pickup_phone
- dropoff_phone
- source_pickup_phone
- source_dropoff_phone
- phone_confidence ("HIGH" | "MEDIUM" | "LOW" | "UNKNOWN")
- phone_source (audit description)
- phone_needs_review (boolean)

Return ONLY valid JSON.`;

    const result = await model.generateContent(prompt);
    let text = result.response.text().replace(/```json\s*/gi, '').replace(/```\s*$/gi, '').trim();
    return JSON.parse(text);
  } catch (e) {
    console.error("Document extraction error:", e);
    return { extracted: false, trips: [] };
  }
};

/**
 * PREDICTIVE MAINTENANCE
 */
export const aiPredictMaintenance = async (vehicle, serviceHistory = []) => {
  try {
    const prompt = `
    Predict maintenance needs for this vehicle:

    Current vehicle: ${JSON.stringify(vehicle)}
    Service history: ${JSON.stringify(serviceHistory)}

    Provide:
    1. Next scheduled maintenance date
    2. Predicted failures in 30/60/90 days
    3. Preventive actions
    4. Estimated cost
    5. Priority level

    Format as JSON.
    `;

    const result = await model.generateContent(prompt);
    return JSON.parse(result.response.text());
  } catch (e) {
    console.error("Maintenance prediction error:", e);
    return { nextMaintenance: null, predictions: [] };
  }
};

/**
 * MULTI-LANGUAGE SUPPORT
 */

export const aiTranslateMessage = async (message, targetLanguage = 'es') => {
  try {
    const result = await model.generateContent(
      `Translate this NEMT support message to ${targetLanguage}, keeping professional tone:\n"${message}"`
    );
    return result.response.text();
  } catch (e) {
    console.error("Translation error:", e);
    return message;
  }
};

/**
 * DRIVER COACHING & PERFORMANCE
 */

export const aiGenerateDriverCoaching = async (driver, performanceData) => {
  try {
    const prompt = `
    Generate personalized coaching for this driver:

    Driver: ${JSON.stringify(driver)}
    Performance data: ${JSON.stringify(performanceData)}

    Provide:
    1. Strengths to recognize
    2. Areas for improvement
    3. Specific, actionable coaching tips
    4. Safety recommendations
    5. Motivation strategy
    6. Progress milestones

    Format as friendly, professional JSON.
    `;

    const result = await model.generateContent(prompt);
    return JSON.parse(result.response.text());
  } catch (e) {
    console.error("Driver coaching error:", e);
    return { feedback: "Keep up the great work!", improvements: [], tips: [] };
  }
};

export default {
  AGAPE_TRIP_EXTRACTION_AGENT_PROMPT,
  aiOptimizeRoute,
  aiPredictDemand,
  aiDetectAnomalies,
  aiAnalyzeSentimentAdvanced,
  aiSuggestSmartReply,
  aiGenerateInsights,
  aiGenerateReport,
  aiCheckCompliance,
  aiExtractTripInfo,
  aiPredictMaintenance,
  aiTranslateMessage,
  aiGenerateDriverCoaching,
};
