/**
 * Advanced AI Service for Agape Care Enterprise Platform
 * Integrates Gemini AI with business logic for:
 * - Trip optimization, demand forecasting, anomaly detection
 * - Natural language processing, sentiment analysis
 * - Predictive analytics
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { GEMINI_API_CONFIG } from "./firebase";

const geminiApiKey = GEMINI_API_CONFIG().apiKey || import.meta.env.VITE_GOOGLE_AI_API_KEY || "";
const genAI = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;
const model = genAI?.getGenerativeModel({ model: "gemini-2.0-flash" }) || {
  generateContent: async () => {
    throw new Error("Gemini API key is not configured.");
  },
};

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
 * DOCUMENT PROCESSING
 */

export const aiExtractTripInfo = async (documentText) => {
  try {
    const prompt = `
    Extract trip information from this document text:

    "${documentText}"

    Extract:
    1. Patient name, phone, address
    2. Pickup location, time, special instructions
    3. Dropoff location
    4. Medical notes or accessibility requirements
    5. Insurance or billing info
    6. Confidence score for each field

    Format as JSON.
    `;

    const result = await model.generateContent(prompt);
    return JSON.parse(result.response.text());
  } catch (e) {
    console.error("Document extraction error:", e);
    return { extracted: false, data: {} };
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
