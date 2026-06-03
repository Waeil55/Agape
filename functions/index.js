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
    const payload = JSON.stringify(req.body);
    const signedPayload = timestamp + payload;
    const verifier = crypto.createVerify("ed25519");
    verifier.update(signedPayload);
    return verifier.verify(publicKey, signature, "base64");
  } catch (err) {
    functions.logger.error("Telnyx signature verification error:", err);
    return false;
  }
}

exports.handleInboundSms = functions.https.onRequest(async (req, res) => {
  try {
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
