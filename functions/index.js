const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");
const crypto = require("crypto");

admin.initializeApp();

const TELNYX_API_BASE = "https://api.telnyx.com/v2";

function normalizePhone(raw) {
  if (!raw) return raw;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return "+" + digits;
  if (digits.length === 10) return "+1" + digits;
  return "+" + digits;
}

async function requireRole(context, allowedRoles) {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "You must be logged in.");
  }
  const userDoc = await admin.firestore().doc(`users/${context.auth.uid}`).get();
  if (!userDoc.exists) {
    throw new functions.https.HttpsError("permission-denied", "User profile not found.");
  }
  const role = userDoc.data().role;
  if (!allowedRoles.includes(role)) {
    throw new functions.https.HttpsError("permission-denied", `This action requires one of these roles: ${allowedRoles.join(", ")}.`);
  }
}

async function requireAdmin(context) {
  return requireRole(context, ["admin"]);
}

async function requireAdminOrDispatcher(context) {
  return requireRole(context, ["admin", "dispatcher"]);
}

function sanitizeForFirestore(value) {
  return JSON.parse(JSON.stringify(value, (_key, item) => item === undefined ? null : item));
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function buildOdometerDistance(startOdo, endOdo) {
  const start = Number(startOdo);
  const end = Number(endOdo);
  if (Number.isNaN(start) || Number.isNaN(end)) return "";
  const diff = end - start;
  return diff >= 0 ? Number(diff.toFixed(1)) : "";
}

function parseTimeMinutes(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (raw.includes("T") || /^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date.getHours() * 60 + date.getMinutes();
  }
  const match = raw.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!match) return null;
  let hours = parseInt(match[1], 10);
  const mins = parseInt(match[2], 10);
  const ampm = match[3]?.toUpperCase();
  if (ampm === "PM" && hours !== 12) hours += 12;
  if (ampm === "AM" && hours === 12) hours = 0;
  return hours * 60 + mins;
}

function buildTravelDuration(startTime, endTime) {
  if (!startTime || !endTime) return "";
  const startDate = new Date(startTime);
  const endDate = new Date(endTime);
  if (!Number.isNaN(startDate.getTime()) && !Number.isNaN(endDate.getTime())) {
    const diff = Math.round((endDate - startDate) / 60000);
    if (diff < 0) return "";
    const hours = Math.floor(diff / 60);
    const mins = diff % 60;
    return hours > 0 ? `${hours}h${mins > 0 ? mins : ""}` : `${mins}m`;
  }
  const start = parseTimeMinutes(startTime);
  const end = parseTimeMinutes(endTime);
  if (start === null || end === null || end < start) return "";
  const diff = end - start;
  const hours = Math.floor(diff / 60);
  const mins = diff % 60;
  return hours > 0 ? `${hours}h${mins > 0 ? mins : ""}` : `${mins}m`;
}

function enrichTripMetrics(trip) {
  const travelTime = buildTravelDuration(trip.arrivalTime, trip.arrivalDropoffTime || trip.completedAt);
  const distance = buildOdometerDistance(trip.pickupOdometer, trip.dropoffOdometer);
  return {
    ...trip,
    travelTime: travelTime || trip.travelTime || "",
    distance: distance !== "" ? distance : trip.distance || "",
  };
}

async function getUserRoleContext(context) {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "You must be logged in.");
  }
  const userDoc = await admin.firestore().doc(`users/${context.auth.uid}`).get();
  if (!userDoc.exists) {
    throw new functions.https.HttpsError("permission-denied", "User profile not found.");
  }
  const userData = userDoc.data() || {};
  return {
    uid: context.auth.uid,
    email: normalizeEmail(context.auth.token.email || userData.email),
    role: String(userData.role || "").toLowerCase(),
    profileId: userData.profileId || "",
    userData,
  };
}

const DRIVER_TRIP_STATUSES = new Set([
  "Assigned",
  "Unassigned",
  "In Mission",
  "En Route",
  "In Progress",
  "Navigating Pickup",
  "At Pickup",
  "In Transit",
  "Navigating Dropoff",
  "At Dropoff",
  "Arrived",
  "Completed",
  "No Show",
  "Cancelled",
  "Rerouted",
]);

const TERMINAL_WORKFLOW_STATUSES = new Set(["Completed", "Cancelled", "No Show", "Rerouted"]);

const WORKFLOW_STATUS_RANK = {
  Unassigned: 0,
  Assigned: 0,
  "In Mission": 1,
  "En Route": 1,
  "In Progress": 1,
  "Navigating Pickup": 2,
  "At Pickup": 3,
  "In Transit": 4,
  "Navigating Dropoff": 5,
  "At Dropoff": 6,
  Arrived: 6,
  Completed: 7,
  "No Show": 7,
  Cancelled: 7,
  Rerouted: 7,
};

function getWorkflowRank(status, data = {}) {
  const persistedRank = Number(data.workflowStatusRank);
  const hasPersistedRank = Number.isFinite(persistedRank);
  let rank = hasPersistedRank ? persistedRank : 0;
  rank = Math.max(rank, WORKFLOW_STATUS_RANK[status] ?? WORKFLOW_STATUS_RANK[data.status] ?? 0);
  if (hasPersistedRank) return rank;
  if (data.completedAt || status === "Completed") rank = Math.max(rank, 7);
  if (data.arrivalDropoffTime) rank = Math.max(rank, 6);
  if (data.departedPickupTime || data.paperSignatureConfirmed || data.unableToSign) rank = Math.max(rank, 4);
  if (data.pickupOdometer || data.arrivalTime) rank = Math.max(rank, 3);
  if (data.startedAt) rank = Math.max(rank, 1);
  return rank;
}

function workflowStepForRank(rank) {
  if (rank >= 7) return "complete";
  if (rank >= 6) return "dropoff-arrived";
  if (rank >= 5) return "nav-dropoff";
  if (rank >= 4) return "in-transit";
  if (rank >= 3) return "pickup-arrived";
  if (rank >= 2) return "nav-pickup";
  if (rank >= 1) return "started";
  return "assigned";
}

exports.updateDriverTrip = functions.https.onCall(async (data, context) => {
  const actor = await getUserRoleContext(context);
  const tripId = String(data?.tripId || "").trim();
  const status = String(data?.status || "").trim();
  const updates = data?.updates && typeof data.updates === "object" && !Array.isArray(data.updates)
    ? sanitizeForFirestore(data.updates)
    : {};
  const allowWorkflowRegression = updates.allowWorkflowRegression === true;
  const cleanUpdates = { ...updates };
  delete cleanUpdates.allowWorkflowRegression;

  if (!tripId || !status) {
    throw new functions.https.HttpsError("invalid-argument", "tripId and status are required.");
  }
  if (actor.role === "driver" && !DRIVER_TRIP_STATUSES.has(status)) {
    throw new functions.https.HttpsError("permission-denied", "Drivers cannot apply this trip status.");
  }
  if (!["admin", "dispatcher", "driver"].includes(actor.role)) {
    throw new functions.https.HttpsError("permission-denied", "This action requires an active app role.");
  }

  const db = admin.firestore();
  const appDataRef = db.doc("appData/agape");
  const nowIso = new Date().toISOString();
  const result = await db.runTransaction(async (transaction) => {
    const appSnap = await transaction.get(appDataRef);
    if (!appSnap.exists) {
      throw new functions.https.HttpsError("failed-precondition", "App data is not initialized.");
    }

    const appData = appSnap.data() || {};
    const trips = [...(appData.trips || [])];
    const drivers = [...(appData.drivers || [])];
    const tripIndex = trips.findIndex((trip) => String(trip.id) === tripId);
    if (tripIndex === -1) {
      throw new functions.https.HttpsError("not-found", "Trip was not found.");
    }

    const previousTrip = trips[tripIndex] || {};
    const assignedDriver = drivers.find((driver) => String(driver.id || "") === String(previousTrip.driverId || ""));
    const driverProfileIds = new Set([
      actor.profileId,
      ...drivers
        .filter((driver) => normalizeEmail(driver.email) === actor.email)
        .map((driver) => driver.id),
    ].filter(Boolean).map(String));
    const tripDriverEmail = normalizeEmail(previousTrip.driverEmail || assignedDriver?.email);

    if (actor.role === "driver" && !driverProfileIds.has(String(previousTrip.driverId || "")) && tripDriverEmail !== actor.email) {
      throw new functions.https.HttpsError("permission-denied", "Drivers can only update their own assigned trips.");
    }

    const previousRank = getWorkflowRank(previousTrip.status, previousTrip);
    const requestedRank = getWorkflowRank(status, cleanUpdates);
    const ignoreDriverRegression = actor.role === "driver" &&
      !allowWorkflowRegression &&
      !TERMINAL_WORKFLOW_STATUSES.has(status) &&
      requestedRank < previousRank;
    const effectiveStatus = ignoreDriverRegression ? previousTrip.status : status;
    const effectiveUpdates = ignoreDriverRegression ? {
      workflowRegressionIgnored: true,
      workflowRegressionIgnoredAt: nowIso,
    } : cleanUpdates;
    const workflowStatusRank = allowWorkflowRegression
      ? requestedRank
      : Math.max(previousRank, requestedRank);

    const nextTrip = enrichTripMetrics(sanitizeForFirestore({
      ...previousTrip,
      status: effectiveStatus,
      ...effectiveUpdates,
      workflowStatusRank,
      workflowStep: workflowStepForRank(workflowStatusRank),
      workflowUpdatedAt: nowIso,
      updatedAtLocal: nowIso,
      updatedBy: actor.email,
    }));

    trips[tripIndex] = nextTrip;
    const appUpdate = {
      trips,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedField: "trips",
      updatedAtLocal: nowIso,
    };

    const finalOdometer = Number(nextTrip.dropoffOdometer);
    const completedWithOdometer = effectiveStatus === "Completed" && Number.isFinite(finalOdometer) && finalOdometer > 0;
    const driverId = String(nextTrip.driverId || actor.profileId || assignedDriver?.id || "");
    if (completedWithOdometer && driverId) {
      appUpdate.drivers = drivers.map((driver) => (
        String(driver.id) === driverId
          ? { ...driver, odometer: finalOdometer, updatedAtLocal: nowIso }
          : driver
      ));
      transaction.set(db.doc(`driverProfiles/${driverId}`), {
        odometer: finalOdometer,
        updatedAtLocal: nowIso,
      }, { merge: true });
    }

    transaction.set(appDataRef, appUpdate, { merge: true });
    transaction.set(db.doc(`tripLedger/${tripId}`), {
      ...nextTrip,
      archiveState: "active",
      mirroredAt: nowIso,
    }, { merge: true });
    transaction.set(db.collection("logs").doc(), {
      t: effectiveStatus === "Completed" ? "Trip Completed" : "Driver Trip Update",
      d: `${actor.email || "Driver"} updated trip ${tripId} (${previousTrip.patient || "Unknown"}) to ${effectiveStatus}.`,
      c: effectiveStatus === "Completed" ? "emerald" : "blue",
      type: "audit",
      time: Date.now(),
      actor: actor.email,
      actorRole: actor.role,
      meta: {
        entity: "trip",
        id: tripId,
        status: effectiveStatus,
        requestedStatus: status,
        workflowStatusRank,
        workflowRegressionIgnored: ignoreDriverRegression,
      },
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { trip: nextTrip, driverId, odometer: completedWithOdometer ? finalOdometer : null };
  });

  return { success: true, ...result };
});

exports.deleteUser = functions.https.onCall(async (data, context) => {
  await requireAdmin(context);
  const { uid } = data;
  if (!uid) {
    throw new functions.https.HttpsError("invalid-argument", "The function must be called with a valid 'uid' property.");
  }
  try {
    await admin.auth().deleteUser(uid);
    return { success: true, message: "User deleted successfully." };
  } catch (error) {
    throw new functions.https.HttpsError("internal", error.message || "Failed to delete user.");
  }
});

exports.sendSms = functions.https.onCall(async (data, context) => {
  await requireAdminOrDispatcher(context);
  const { to: rawTo, text, tripId } = data;
  const to = normalizePhone(rawTo);
  if (!to || !text) {
    throw new functions.https.HttpsError("invalid-argument", "Both 'to' and 'text' are required.");
  }
  let body = null;
  let fromNumber = "";
  try {
    const cfg = functions.config();
    const apiKey = cfg.telnyx?.api_key;
    fromNumber = cfg.telnyx?.from || "+18552223330";
    const messagingProfileId = cfg.telnyx?.messaging_profile_id || null;
    if (!apiKey) {
      throw new functions.https.HttpsError("failed-precondition", "Telnyx API key not configured.");
    }
    body = { from: fromNumber, to, text };
    if (messagingProfileId) {
      body.messaging_profile_id = messagingProfileId;
    }
    functions.logger.info("Telnyx send request:", { body, apiKey: apiKey ? "***" : "missing" });
    const res = await axios.post(
      `${TELNYX_API_BASE}/messages`,
      body,
      { headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" } }
    );
    functions.logger.info("Telnyx API response status:", { status: res.status, statusText: res.statusText });
    const telnyxData = res.data?.data || {};
    const messageId = telnyxData.id;
    const status = telnyxData.to?.[0]?.status || "queued";
    functions.logger.info("Telnyx send response:", { messageId, status, to, from: fromNumber, telnyxData });
    if (tripId) {
      await admin.firestore().collection("smsLogs").add({
        tripId,
        direction: "outbound",
        to,
        from: fromNumber,
        text,
        status,
        messageId,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    return { success: true, messageId, status };
  } catch (err) {
    const errDetail = err.response?.data?.errors?.[0]?.detail || err.message;
    const errCode = err.response?.data?.errors?.[0]?.code || "";
    const status = err.response?.status || "";
    functions.logger.error("Telnyx send error:", { 
      detail: errDetail, 
      code: errCode, 
      status,
      response: err.response?.data,
      body: body,
      to,
      from: fromNumber
    });
    throw new functions.https.HttpsError("internal", errDetail || "Failed to send SMS.");
  }
});

exports.sendBulkSms = functions.https.onCall(async (data, context) => {
  await requireAdminOrDispatcher(context);
  const { messages } = data;
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    throw new functions.https.HttpsError("invalid-argument", "'messages' must be a non-empty array.");
  }
  const cfg = functions.config();
  const apiKey = cfg.telnyx?.api_key;
  const fromNumber = cfg.telnyx?.from || "+18552223330";
  const messagingProfileId = cfg.telnyx?.messaging_profile_id || null;
  if (!apiKey) {
    throw new functions.https.HttpsError("failed-precondition", "Telnyx API key not configured.");
  }
  const results = [];
  let sent = 0;
  let failed = 0;
  let firstError = null;
  for (const { to: rawTo, text, metadata } of messages) {
    const to = normalizePhone(rawTo);
    let body = null;
    try {
      body = { from: fromNumber, to, text };
      if (messagingProfileId) {
        body.messaging_profile_id = messagingProfileId;
      }
      const res = await axios.post(
        `${TELNYX_API_BASE}/messages`,
        body,
        { headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" } }
      );
      const telnyxData = res.data?.data || {};
      const messageId = telnyxData.id;
      const status = telnyxData.to?.[0]?.status || "queued";
      results.push({ to, success: true, messageId });
      sent++;
      if (metadata?.tripId) {
        await admin.firestore().collection("smsLogs").add({
          tripId: metadata.tripId,
          direction: "outbound",
          to,
          from: fromNumber,
          text,
          status,
          messageId,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    } catch (err) {
      const errorMsg = err.response?.data?.errors?.[0]?.detail || err.message;
      const errCode = err.response?.data?.errors?.[0]?.code || "";
      const status = err.response?.status || "";
      functions.logger.error(`Failed to send SMS to ${to}:`, { 
        errorMsg, 
        errCode, 
        status,
        response: err.response?.data,
        body,
        from: fromNumber
      });
      results.push({ to, success: false, error: errorMsg });
      failed++;
      if (!firstError) firstError = errorMsg;
    }
  }
  return {
    success: failed === 0,
    sent,
    failed,
    results,
    error: firstError
  };
});

const CONFIRM_WORDS = ["yes", "yea", "yep", "sure", "confirm", "confirmed", "coming", "1", "ok", "okay"];
const DENY_WORDS = ["no", "nah", "nope", "cancel", "not coming", "not", "0", "stop"];

function parseConfirmation(text) {
  const t = (text || "").trim().toLowerCase().replace(/[^a-z0-9 ]/g, "");
  if (CONFIRM_WORDS.some(w => t === w || t.startsWith(w + " "))) return "confirmed";
  if (DENY_WORDS.some(w => t === w || t.startsWith(w + " "))) return "not_coming";
  return null;
}

function verifyTelnyxSignature(req) {
  const cfg = functions.config();
  const publicKey = cfg.telnyx?.webhook_public_key;
  if (!publicKey) {
    functions.logger.warn("Telnyx webhook public key not configured — skipping signature verification");
    return true;
  }
  const signature = req.headers["telnyx-signature-ed25519"];
  const timestamp = req.headers["telnyx-timestamp"];
  if (!signature || !timestamp) {
    functions.logger.warn("Missing Telnyx webhook signature headers");
    return false;
  }
  try {
    const timestampValue = Number(timestamp);
    const timestampMs = timestampValue > 1e12 ? timestampValue : timestampValue * 1000;
    if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > 5 * 60 * 1000) {
      functions.logger.warn("Telnyx webhook timestamp outside tolerance", { timestamp });
      return false;
    }

    const payload = req.rawBody?.toString("utf8") || JSON.stringify(req.body);
    const signedPayload = Buffer.from(`${timestamp}|${payload}`, "utf8");
    const publicKeyMaterial = String(publicKey).trim();
    let keyObject;

    if (publicKeyMaterial.includes("BEGIN PUBLIC KEY")) {
      keyObject = crypto.createPublicKey(publicKeyMaterial);
    } else {
      const rawKey = Buffer.from(
        publicKeyMaterial,
        /^[0-9a-f]{64}$/i.test(publicKeyMaterial) ? "hex" : "base64"
      );
      const spkiPrefix = Buffer.from("302a300506032b6570032100", "hex");
      keyObject = crypto.createPublicKey({
        key: rawKey.length === 32 ? Buffer.concat([spkiPrefix, rawKey]) : rawKey,
        format: "der",
        type: "spki",
      });
    }

    return crypto.verify(null, signedPayload, keyObject, Buffer.from(signature, "base64"));
  } catch (err) {
    functions.logger.error("Telnyx signature verification error:", err);
    return false;
  }
}

exports.handleInboundSms = functions.https.onRequest(async (req, res) => {
  try {
    if (!verifyTelnyxSignature(req)) {
      res.status(403).json({ error: "Invalid Telnyx signature" });
      return;
    }

    const eventType = req.body?.data?.event_type || "";
    const payload = req.body?.data?.payload || req.body;

    functions.logger.info("Telnyx webhook received:", { eventType, bodyKeys: Object.keys(req.body || {}) });

    // Handle delivery receipts (message.finalized / message.sent)
    if (eventType === "message.finalized" || eventType === "message.sent") {
      const messageId = payload?.id || "";
      const status = payload?.to?.[0]?.status || payload?.status || "";
      const toNumber = typeof payload?.to === "string" ? payload.to :
                       payload?.to?.[0]?.phone_number || payload?.to?.phone_number || "";
      functions.logger.info("Delivery receipt:", { messageId, status, to: toNumber });
      if (messageId && status) {
        const smsSnapshot = await admin.firestore()
          .collection("smsLogs")
          .where("messageId", "==", messageId)
          .limit(1)
          .get();
        if (!smsSnapshot.empty) {
          await smsSnapshot.docs[0].ref.update({ status, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
          functions.logger.info("Updated smsLog status:", { messageId, status });
        }
      }
      res.status(200).json({ ok: true });
      return;
    }

    // Only process inbound messages from here
    if (eventType && eventType !== "message.received") {
      res.status(200).json({ ok: true, ignored: eventType });
      return;
    }

    // Extract fields — handle both string and object formats
    const extractPhone = (val) => {
      if (!val) return "";
      if (typeof val === "string") return val;
      if (Array.isArray(val)) return val[0]?.phone_number || val[0] || "";
      return val.phone_number || val.phone || "";
    };
    const from = extractPhone(payload.from);
    const to = extractPhone(payload.to);
    const text = payload.text || payload.body || "";
    const messageId = payload.id || payload.message_id || "";

    if (!from || !text) {
      functions.logger.warn("Inbound SMS skipped — missing from or text", { from, text, payload });
      res.status(200).json({ ok: true, skipped: "missing fields" });
      return;
    }

    await admin.firestore().collection("smsLogs").add({
      direction: "inbound",
      from,
      to,
      text,
      messageId,
      raw: JSON.stringify(payload),
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
    functions.logger.info("Inbound SMS logged:", { from, to, messageId });

    const confirmation = parseConfirmation(text);
    if (confirmation && from) {
      const smsSnapshot = await admin.firestore()
        .collection("smsLogs")
        .where("to", "==", from)
        .where("direction", "==", "outbound")
        .orderBy("timestamp", "desc")
        .limit(1)
        .get();

      if (!smsSnapshot.empty) {
        const smsData = smsSnapshot.docs[0].data();
        const tripId = smsData.metadata?.tripId || smsData.tripId;
        if (tripId) {
          const appDataRef = admin.firestore().doc("appData/agape");
          const appData = await appDataRef.get();
          if (appData.exists) {
            const trips = [...(appData.data().trips || [])];
            const idx = trips.findIndex(t => t.id === tripId);
            if (idx !== -1) {
              trips[idx] = { ...trips[idx], clientConfirmation: confirmation };
              await appDataRef.update({
                trips,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedField: "trips",
                updatedAtLocal: new Date().toISOString(),
              });
              functions.logger.info("Trip confirmation updated:", { tripId, confirmation });
            }
          }
        }
      }
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    functions.logger.error("Inbound SMS handler error:", err);
    res.status(500).json({ error: err.message });
  }
});

exports.diagnoseTelnyx = functions.https.onCall(async (data, context) => {
  await requireAdminOrDispatcher(context);
  const results = { checks: [], passed: 0, failed: 0, warnings: 0 };

  const addCheck = (name, status, detail) => {
    results.checks.push({ name, status, detail });
    if (status === "pass") results.passed++;
    else if (status === "fail") results.failed++;
    else results.warnings++;
  };

  try {
    const cfg = functions.config();
    const apiKey = cfg.telnyx?.api_key;
    const fromNumber = cfg.telnyx?.from;
    const messagingProfileId = cfg.telnyx?.messaging_profile_id;

    // 1. Check config
    if (!apiKey) {
      addCheck("Telnyx API key configured", "fail", "No telnyx.api_key found in Firebase config. Run: firebase functions:config:set telnyx.api_key=\"YOUR_KEY\"");
    } else {
      addCheck("Telnyx API key configured", "pass", "API key is set");
    }

    if (!fromNumber) {
      addCheck("Telnyx from number configured", "warn", "No telnyx.from found in Firebase config. Using default +18552223330");
    } else {
      addCheck("Telnyx from number configured", "pass", `From number: ${fromNumber}`);
    }

    if (messagingProfileId) {
      addCheck("Messaging profile ID configured", "pass", `Profile ID: ${messagingProfileId}`);
    } else {
      addCheck("Messaging profile ID configured", "warn", "Not set — Telnyx will auto-detect. Set via: firebase functions:config:set telnyx.messaging_profile_id=\"UUID\"");
    }

    if (!apiKey) {
      return results;
    }

    // 2. Test Telnyx API authentication
    try {
      const meRes = await axios.get(`${TELNYX_API_BASE}/messaging_profiles`, {
        headers: { Authorization: `Bearer ${apiKey}` }
      });
      const profiles = meRes.data?.data || [];
      addCheck("Telnyx API authentication", "pass", `Authenticated successfully. Found ${profiles.length} messaging profile(s)`);

      // 3. Check messaging profiles
      if (profiles.length === 0) {
        addCheck("Messaging profiles exist", "fail", "No messaging profiles found. Create one in Telnyx Portal → Messaging → Messaging Profiles");
      } else {
        addCheck("Messaging profiles exist", "pass", `${profiles.length} profile(s) found`);
        const hasWebhook = profiles.some(p => p.webhook_url || p.webhook_failover_url);
        if (hasWebhook) {
          addCheck("Webhook URL configured", "pass", "At least one profile has a webhook URL");
        } else {
          addCheck("Webhook URL configured", "warn", "No webhook URL set on any profile. Set to: https://us-central1-agape-95c9f.cloudfunctions.net/handleInboundSms");
        }
        if (messagingProfileId) {
          const match = profiles.find(p => p.id === messagingProfileId);
          if (match) {
            addCheck("Configured profile ID matches", "pass", `Profile "${match.name || match.id}" found`);
          } else {
            addCheck("Configured profile ID matches", "warn", `Profile ID "${messagingProfileId}" not found among ${profiles.length} profiles. Check the UUID.`);
          }
        }
      }
    } catch (err) {
      const errDetail = err.response?.data?.errors?.[0]?.detail || err.message;
      addCheck("Telnyx API authentication", "fail", `API call failed: ${errDetail}`);
    }

    // 4. Check phone number
    try {
      const numParams = {};
      numParams['filter[phone_number]'] = fromNumber;
      const numRes = await axios.get(`${TELNYX_API_BASE}/phone_numbers`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        params: numParams
      });
      const numbers = numRes.data?.data || [];
      if (numbers.length === 0) {
        addCheck(`Number ${fromNumber} exists on account`, "fail", `Number ${fromNumber} not found in your Telnyx account. Check the number in Telnyx Portal → Numbers → My Numbers`);
      } else {
        const num = numbers[0];
        const smsEnabled = num.messaging?.product === "SMS" || num.messaging?.enabled === true;
        if (smsEnabled) {
          addCheck(`Number ${fromNumber} SMS enabled`, "pass", "SMS is enabled on this number");
        } else {
          addCheck(`Number ${fromNumber} SMS enabled`, "fail", "SMS is NOT enabled on this number. In Telnyx Portal, go to Numbers → My Numbers → click the number → enable Messaging");
        }
        const status = num.status || "unknown";
        addCheck(`Number status`, "pass", `Status: ${status}`);
      }
    } catch (err) {
      addCheck("Phone number check", "warn", `Could not check number: ${err.response?.data?.errors?.[0]?.detail || err.message}`);
    }

    // 5. Test sending a diagnostic message
    addCheck("TCR / Campaign status", "warn", "Cannot check TCR status via API. Go to Telnyx Portal → Messaging → Toll-Free and verify Brand + Campaign are both APPROVED. This is the #1 reason toll-free messages are queued but never delivered.");

    return results;
  } catch (err) {
    functions.logger.error("Telnyx diagnosis error:", err);
    throw new functions.https.HttpsError("internal", err.message || "Diagnosis failed");
  }
});
