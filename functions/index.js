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

function phoneConversationId(rawPhone) {
  const normalized = normalizePhone(rawPhone || "");
  const digits = String(normalized || "").replace(/\D/g, "");
  return digits ? `sms_${digits}` : "";
}

function extractTelnyxPhone(val) {
  if (!val) return "";
  if (typeof val === "string") return val;
  if (Array.isArray(val)) return val[0]?.phone_number || val[0] || "";
  return val.phone_number || val.phone || "";
}

async function mirrorDeliveryStatusToChat(messageId, status) {
  if (!messageId || !status) return;
  try {
    const snapshot = await admin.firestore()
      .collectionGroup("messages")
      .where("telnyxMessageId", "==", messageId)
      .limit(10)
      .get();
    if (snapshot.empty) return;
    const batch = admin.firestore().batch();
    snapshot.docs.forEach((messageDoc) => {
      batch.update(messageDoc.ref, {
        status,
        telnyxStatusUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
    await batch.commit();
  } catch (err) {
    functions.logger.warn("Unable to mirror Telnyx delivery status to chat:", {
      messageId,
      status,
      error: err.message,
    });
  }
}

async function writeInboundSmsToChat({ from, to, text, messageId, payload }) {
  const normalizedFrom = normalizePhone(from);
  const normalizedTo = normalizePhone(to);
  const conversationId = phoneConversationId(normalizedFrom);
  if (!conversationId) return;

  const conversationRef = admin.firestore().collection("chat_conversations").doc(conversationId);
  const conversationSnap = await conversationRef.get();
  const existing = conversationSnap.exists ? conversationSnap.data() || {} : {};
  const participants = Array.isArray(existing.participants) ? existing.participants : [];
  const assignedStaff = new Set([
    ...participants,
    ...(Array.isArray(existing.assignedStaff) ? existing.assignedStaff : []),
    ...(existing.assignedTo ? [existing.assignedTo] : []),
  ].filter(Boolean));
  const unreadUpdates = {};
  assignedStaff.forEach((uid) => {
    unreadUpdates[`unread.${uid}`] = admin.firestore.FieldValue.increment(1);
  });

  await conversationRef.set({
    id: conversationId,
    type: "sms",
    clientPhone: normalizedFrom,
    clientName: existing.clientName || normalizedFrom,
    participants,
    participantNames: existing.participantNames || {},
    participantRoles: existing.participantRoles || {},
    assignedTo: existing.assignedTo || "",
    assignedStaff: Array.from(assignedStaff),
    lastMessage: text,
    lastMessageTime: admin.firestore.FieldValue.serverTimestamp(),
    createdAt: existing.createdAt || admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    ...unreadUpdates,
  }, { merge: true });

  await conversationRef.collection("messages").add({
    senderId: "client",
    senderName: existing.clientName || normalizedFrom,
    senderRole: "client",
    text,
    ts: admin.firestore.FieldValue.serverTimestamp(),
    status: "received",
    isClient: true,
    from: normalizedFrom,
    to: normalizedTo,
    telnyxMessageId: messageId || "",
    raw: payload || null,
  });
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
  const { to: rawTo, text, tripId, conversationId } = data;
  const to = normalizePhone(rawTo);
  if (!to || !text) {
    throw new functions.https.HttpsError("invalid-argument", "Both 'to' and 'text' are required.");
  }
  try {
    const cfg = functions.config();
    const apiKey = cfg.telnyx?.api_key;
    const fromNumber = cfg.telnyx?.from || "+18552223330";
    const messagingProfileId = cfg.telnyx?.messaging_profile_id || null;
    if (!apiKey) {
      throw new functions.https.HttpsError("failed-precondition", "Telnyx API key not configured.");
    }
    const body = { from: fromNumber, to, text, type: "SMS" };
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
    functions.logger.info("Telnyx send response:", { messageId, status, to, from: fromNumber });
    await admin.firestore().collection("smsLogs").add({
      tripId: tripId || "",
      conversationId: conversationId || phoneConversationId(to),
      direction: "outbound",
      to,
      from: fromNumber,
      text,
      status,
      messageId,
      senderUid: context.auth.uid,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { success: true, messageId, status, from: fromNumber, to };
  } catch (err) {
    const errDetail = err.response?.data?.errors?.[0]?.detail || err.message;
    const errCode = err.response?.data?.errors?.[0]?.code || "";
    functions.logger.error("Telnyx send error:", { detail: errDetail, code: errCode, response: err.response?.data });
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
    try {
      const body = { from: fromNumber, to, text, type: "SMS" };
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
      functions.logger.error(`Failed to send SMS to ${to}:`, err.response?.data || err.message);
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
      const toNumber = extractTelnyxPhone(payload?.to);
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
      await mirrorDeliveryStatusToChat(messageId, status);
      res.status(200).json({ ok: true });
      return;
    }

    // Only process inbound messages from here
    if (eventType && eventType !== "message.received") {
      res.status(200).json({ ok: true, ignored: eventType });
      return;
    }

    // Extract fields — handle both string and object formats
    const from = extractTelnyxPhone(payload.from);
    const to = extractTelnyxPhone(payload.to);
    const text = payload.text || payload.body || "";
    const messageId = payload.id || payload.message_id || "";

    if (!from || !text) {
      functions.logger.warn("Inbound SMS skipped — missing from or text", { from, text, payload });
      res.status(200).json({ ok: true, skipped: "missing fields" });
      return;
    }

    await admin.firestore().collection("smsLogs").add({
      direction: "inbound",
      from: normalizePhone(from),
      to: normalizePhone(to),
      text,
      messageId,
      raw: JSON.stringify(payload),
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
    await writeInboundSmsToChat({ from, to, text, messageId, payload });
    functions.logger.info("Inbound SMS logged:", { from, to, messageId });

    const confirmation = parseConfirmation(text);
    if (confirmation && from) {
      const smsSnapshot = await admin.firestore()
        .collection("smsLogs")
        .where("to", "==", normalizePhone(from))
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
