const functions = require("firebase-functions/v1");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const axios = require("axios");
const crypto = require("crypto");

admin.initializeApp();

const TELNYX_API_BASE = "https://api.telnyx.com/v2";
const runtimeConfigSecret = defineSecret("AGAPE_RUNTIME_CONFIG");

function getRuntimeConfig() {
  const raw = runtimeConfigSecret.value();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (error) {
    functions.logger.error("AGAPE_RUNTIME_CONFIG is not valid JSON.", {
      error: error.message,
    });
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Secure runtime configuration is unavailable.",
    );
  }
}

function getTelnyxConfig() {
  return getRuntimeConfig().telnyx || {};
}

// Deliver Messenger-style push alerts for every newly created team-chat message.
// Tokens are registered by the web client in users/{uid}.fcmToken.
exports.notifyChatMessage = functions.firestore
  .document("chat_channels/{channelId}/messages/{messageId}")
  .onCreate(async (snapshot, context) => {
    const message = snapshot.data() || {};
    const channelSnap = await admin.firestore().doc(`chat_channels/${context.params.channelId}`).get();
    if (!channelSnap.exists) return null;

    const channel = channelSnap.data() || {};
    const recipientIds = (channel.participants || []).filter((uid) => uid && uid !== message.senderId && !channel.mutedBy?.[uid]);
    if (!recipientIds.length) return null;

    const recipients = await Promise.all(recipientIds.map((uid) => admin.firestore().doc(`users/${uid}`).get()));
    const tokens = recipients.map((user) => user.data()?.fcmToken).filter(Boolean);
    if (!tokens.length) return null;

    const title = message.senderName || "New message";
    const body = String(message.text || "Sent you a message").slice(0, 180);
    const response = await admin.messaging().sendEachForMulticast({
      tokens,
      data: {
        type: "message",
        title,
        body,
        channelId: context.params.channelId,
      },
      webpush: {
        headers: { Urgency: "high" },
        notification: { title, body, icon: "/agape.png", badge: "/agape.png", tag: `chat-${context.params.channelId}`, renotify: true },
        fcmOptions: { link: `/?chatChannel=${encodeURIComponent(context.params.channelId)}` },
      },
    });

    const invalidTokens = [];
    response.responses.forEach((result, index) => {
      if (!result.success && ["messaging/registration-token-not-registered", "messaging/invalid-registration-token"].includes(result.error?.code)) {
        invalidTokens.push(tokens[index]);
      }
    });
    if (invalidTokens.length) {
      await Promise.all(recipients.map((user) => {
        if (invalidTokens.includes(user.data()?.fcmToken)) return user.ref.update({ fcmToken: admin.firestore.FieldValue.delete() });
        return null;
      }));
    }
    return null;
  });

exports.auditChatMessageChanges = functions.firestore
  .document("chat_channels/{channelId}/messages/{messageId}")
  .onWrite(async (change, context) => {
    const before = change.before.exists ? change.before.data() : null;
    const after = change.after.exists ? change.after.data() : null;
    let action = "chat.message.created";
    if (!after) action = "chat.message.deleted";
    else if (after.deletedAt && !before?.deletedAt) action = "chat.message.removed";
    else if (after.editedAt && (!before?.editedAt || !after.editedAt.isEqual(before.editedAt))) action = "chat.message.edited";
    else if (before && JSON.stringify(after.reactions || {}) !== JSON.stringify(before.reactions || {})) action = "chat.message.reaction_changed";
    else if (before) return null;

    await admin.firestore().collection("audit_logs").add({
      action,
      entityType: "chat_message",
      entityId: context.params.messageId,
      channelId: context.params.channelId,
      actorId: after?.deletedBy || after?.senderId || before?.senderId || "unknown",
      hasAttachment: Boolean(after?.attachment || before?.attachment || after?.attachments?.length || before?.attachments?.length),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    if (after?.deletedAt && !before?.deletedAt) {
      const attachments = after.attachments || (after.attachment ? [after.attachment] : []);
      await Promise.all(attachments.filter(item => item?.path).map(item => admin.storage().bucket().file(item.path).delete({ ignoreNotFound: true })));
    }
    return null;
  });

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

exports.sendSms = functions
  .runWith({ secrets: [runtimeConfigSecret] })
  .https.onCall(async (data, context) => {
  await requireAdminOrDispatcher(context);
  const { to: rawTo, text, tripId } = data;
  const to = normalizePhone(rawTo);
  if (!to || !text) {
    throw new functions.https.HttpsError("invalid-argument", "Both 'to' and 'text' are required.");
  }
  try {
    const telnyx = getTelnyxConfig();
    const apiKey = telnyx.api_key;
    const fromNumber = telnyx.from || "+18552223330";
    const messagingProfileId = telnyx.messaging_profile_id || null;
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

exports.sendBulkSms = functions
  .runWith({ secrets: [runtimeConfigSecret] })
  .https.onCall(async (data, context) => {
  await requireAdminOrDispatcher(context);
  const { messages } = data;
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    throw new functions.https.HttpsError("invalid-argument", "'messages' must be a non-empty array.");
  }
  const telnyx = getTelnyxConfig();
  const apiKey = telnyx.api_key;
  const fromNumber = telnyx.from || "+18552223330";
  const messagingProfileId = telnyx.messaging_profile_id || null;
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
  const publicKey = getTelnyxConfig().webhook_public_key;
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

exports.handleInboundSms = functions
  .runWith({ secrets: [runtimeConfigSecret] })
  .https.onRequest(async (req, res) => {
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

exports.diagnoseTelnyx = functions
  .runWith({ secrets: [runtimeConfigSecret] })
  .https.onCall(async (data, context) => {
  await requireAdminOrDispatcher(context);
  const results = { checks: [], passed: 0, failed: 0, warnings: 0 };

  const addCheck = (name, status, detail) => {
    results.checks.push({ name, status, detail });
    if (status === "pass") results.passed++;
    else if (status === "fail") results.failed++;
    else results.warnings++;
  };

  try {
    const telnyx = getTelnyxConfig();
    const apiKey = telnyx.api_key;
    const fromNumber = telnyx.from;
    const messagingProfileId = telnyx.messaging_profile_id;

    // 1. Check config
    if (!apiKey) {
      addCheck("Telnyx API key configured", "fail", "The secure AGAPE_RUNTIME_CONFIG secret does not contain a Telnyx API key.");
    } else {
      addCheck("Telnyx API key configured", "pass", "API key is set");
    }

    if (!fromNumber) {
      addCheck("Telnyx from number configured", "warn", "No Telnyx sender number is configured. Using default +18552223330.");
    } else {
      addCheck("Telnyx from number configured", "pass", `From number: ${fromNumber}`);
    }

    if (messagingProfileId) {
      addCheck("Messaging profile ID configured", "pass", `Profile ID: ${messagingProfileId}`);
    } else {
      addCheck("Messaging profile ID configured", "warn", "Not set — Telnyx will auto-detect.");
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

exports.createAssignments = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "You must be logged in.");
  }
  const { assignments } = data;
  if (!assignments || !Array.isArray(assignments) || assignments.length === 0) {
    throw new functions.https.HttpsError("invalid-argument", "'assignments' must be a non-empty array.");
  }
  let role = null;
  try {
    const userDoc = await admin.firestore().doc(`users/${context.auth.uid}`).get();
    role = userDoc.exists ? userDoc.data().role : null;
  } catch (e) {
    functions.logger.warn("createAssignments: could not read user role, proceeding anyway", { uid: context.auth.uid, err: e.message });
  }
  if (role && !['admin', 'dispatcher'].includes(role)) {
    throw new functions.https.HttpsError("permission-denied", `Role '${role}' cannot create assignments.`);
  }
  const batch = admin.firestore().batch();
  let count = 0;
  for (const a of assignments) {
    if (!a.id || !a.tripId) continue;
    batch.set(admin.firestore().doc("assignments", a.id), a, { merge: true });
    count++;
  }
  if (count > 0) await batch.commit();
  functions.logger.info(`createAssignments: created ${count} assignment(s) by ${context.auth.uid}`);
  return { created: count };
});

// ── Stub functions — previously deployed, preserved to avoid deletion ──────────

exports.cleanupOldTelemetry = functions.pubsub.schedule("0 3 * * *").onRun(async (ctx) => {
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const snap = await admin.firestore().collection("telemetry").where("timestamp", "<", cutoff).get();
  let deleted = 0;
  const batch = admin.firestore().batch();
  snap.forEach((doc) => { batch.delete(doc.ref); deleted++; });
  if (deleted > 0) await batch.commit();
  functions.logger.info(`cleanupOldTelemetry: deleted ${deleted} telemetry docs older than ${cutoff.toISOString()}`);
});

exports.enforceChatRetention = functions.pubsub.schedule("30 3 * * *").onRun(async () => {
  const db = admin.firestore();
  const policySnap = await db.doc("systemConfig/chatRetention").get();
  const policy = policySnap.exists ? policySnap.data() : {};
  if (!policy.enabled || policy.legalHold === true) {
    functions.logger.info("Chat retention skipped", { enabled: Boolean(policy.enabled), legalHold: Boolean(policy.legalHold) });
    return null;
  }
  const retentionDays = Math.min(3650, Math.max(30, Number(policy.retentionDays) || 365));
  const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - retentionDays * 86400000);
  const snapshot = await db.collectionGroup("messages").where("timestamp", "<", cutoff).limit(400).get();
  let deleted = 0;
  let attachmentsDeleted = 0;
  for (const messageDoc of snapshot.docs) {
    const message = messageDoc.data();
    if (message.legalHold === true || message.pinned === true) continue;
    const attachments = message.attachments || (message.attachment ? [message.attachment] : []);
    await Promise.all(attachments.filter(item => item?.path).map(async item => {
      await admin.storage().bucket().file(item.path).delete({ ignoreNotFound: true });
      attachmentsDeleted += 1;
    }));
    await messageDoc.ref.delete();
    deleted += 1;
  }
  await db.collection("audit_logs").add({
    action: "chat.retention.enforced", entityType: "chat_retention", actorId: "system",
    retentionDays, deleted, attachmentsDeleted, cutoff,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  functions.logger.info("Chat retention complete", { retentionDays, deleted, attachmentsDeleted });
  return null;
});

exports.auditChatRetentionPolicy = functions.firestore
  .document("systemConfig/chatRetention")
  .onWrite(async (change) => {
    const before = change.before.exists ? change.before.data() : null;
    const after = change.after.exists ? change.after.data() : null;
    await admin.firestore().collection("audit_logs").add({
      action: "chat.retention.policy_changed", entityType: "chat_retention",
      actorId: after?.updatedBy || "unknown",
      before: before ? { enabled: before.enabled, legalHold: before.legalHold, retentionDays: before.retentionDays } : null,
      after: after ? { enabled: after.enabled, legalHold: after.legalHold, retentionDays: after.retentionDays } : null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return null;
  });

const normalizeWellTransBookingId = (trip = {}) =>
  String(trip.bookingId || trip.tripId || trip.tripNumber || trip.id || "").trim().replace(/^TRIP-/i, "");

const wellTransClock = (value) => {
  if (!value) return "";
  if (/^\d{1,2}:\d{2}$/.test(String(value).trim())) return String(value).trim().padStart(5, "0");
  const date = value?.toDate?.() || new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-US", { timeZone: "America/Indiana/Indianapolis", hour12: false, hour: "2-digit", minute: "2-digit" });
};

const wellTransServiceDate = (trip = {}) => {
  const value = trip.dateKey || trip.serviceDate || trip.tripDate || trip.scheduledDate || trip.pickupDate || trip.date;
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value).trim())) return String(value).trim();
  const iso = String(value).trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${String(iso[2]).padStart(2, "0")}-${String(iso[3]).padStart(2, "0")}`;
  const us = String(value).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (us) {
    const year = us[3].length === 2 ? `20${us[3]}` : us[3];
    return `${year}-${String(us[1]).padStart(2, "0")}-${String(us[2]).padStart(2, "0")}`;
  }
  const date = value?.toDate?.() || new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Indiana/Indianapolis" }).format(date);
};

const buildWellTransJobPayload = (trip = {}) => {
  const bookingId = normalizeWellTransBookingId(trip);
  const start = Number(trip.pickupOdometer || trip.startOdometer || trip.startMileage);
  const end = Number(trip.dropoffOdometer || trip.endOdometer || trip.endMileage || trip.odometer);
  const odometerMiles = Number.isFinite(start) && Number.isFinite(end) && start > 0 && end >= start ? end - start : null;
  const fallbackMiles = Number(trip.actualDistance ?? trip.distance ?? trip.miles ?? trip.totalMiles);
  const mileage = odometerMiles === null && Number.isFinite(fallbackMiles) && fallbackMiles >= 0 ? fallbackMiles : odometerMiles;
  const payload = {
    bookingId, tripId: String(trip.id || bookingId), serviceDate: wellTransServiceDate(trip),
    driver: trip.completedDriverName || trip.driverName || trip.driver || "",
    vehicle: trip.completedVehicle || trip.vehicle || trip.vehicleName || "",
    pickup: { arrival: wellTransClock(trip.pickupArrival || trip.arrivalTime || trip.arrivedPickupTime), departure: wellTransClock(trip.pickupDeparture || trip.departedPickupTime || trip.departureTime), mileage: Number.isFinite(start) ? start : null, signatureCaptured: false },
    dropoff: { arrival: wellTransClock(trip.dropoffArrival || trip.arrivalDropoffTime || trip.completedAt), departure: wellTransClock(trip.dropoffDeparture || trip.departedDropoffTime || trip.dropoffArrival || trip.arrivalDropoffTime || trip.completedAt), mileage: Number.isFinite(end) ? end : (mileage === null ? null : Number(mileage.toFixed(3))), signatureCaptured: Boolean(trip.signatureCaptured || trip.paperSignatureConfirmed || trip.signatureUrl || trip.signature) },
  };
  const errors = [];
  if (!bookingId) errors.push("Trip has no Booking ID");
  const lifecycle = [
    trip.status, trip.operationalStatus, trip.lifecycleStatus, trip.lifecycleStep,
  ].map((value) => String(value || "").trim().toLowerCase()).join(" ");
  if (/cancell?ed/.test(lifecycle)) errors.push("Trip is cancelled");
  else if (!["completed", "complete"].includes(String(trip.status || "").toLowerCase()) && !trip.completedAt) errors.push("Trip is not completed");
  if (!payload.pickup.arrival) errors.push("Pickup arrival is missing");
  if (!payload.serviceDate) errors.push("Service date is missing");
  const assignmentValid = (value) => {
    const normalized = String(value || "").trim().toLowerCase();
    return normalized && !normalized.includes("pending assignment") && !normalized.includes("medical transportation inc");
  };
  if (!assignmentValid(payload.driver)) errors.push("A valid assigned driver is missing");
  if (!payload.pickup.departure) errors.push("Pickup departure is missing");
  if (!payload.dropoff.arrival) errors.push("Dropoff arrival is missing");
  if (!payload.dropoff.departure) errors.push("Dropoff departure is missing");
  if (!Number.isFinite(payload.pickup.mileage) || payload.pickup.mileage <= 0) errors.push("Pickup odometer is missing");
  if (!Number.isFinite(payload.dropoff.mileage) || payload.dropoff.mileage < payload.pickup.mileage) {
    errors.push("Dropoff odometer is missing or precedes pickup odometer");
  }
  if (!payload.dropoff.signatureCaptured) errors.push("Captured rider signature is missing");
  return { payload, errors };
};

const isWellTransCompletedTrip = (trip = {}) => {
  const lifecycle = [
    trip.status, trip.operationalStatus, trip.lifecycleStatus, trip.lifecycleStep,
  ].map((value) => String(value || "").trim().toLowerCase()).join(" ");
  if (/cancell?ed/.test(lifecycle)) return false;
  const status = String(trip.status || "").trim().toLowerCase();
  return ["completed", "complete", "done"].includes(status)
    || status.includes("completed")
    || status.includes("complete")
    || Boolean(trip.completedAt);
};

const loadCompletedWellTransTrips = async (serviceDate) => {
  // A full collection reconciliation is deliberate: legacy trips do not all
  // share one canonical date field. Filtering only dateKey was the source of
  // silent omissions in earlier builds.
  const snapshot = await admin.firestore().collection("trips").get();
  return snapshot.docs
    .map((document) => ({ id: document.id, ...document.data() }))
    .filter((trip) => isWellTransCompletedTrip(trip) && wellTransServiceDate(trip) === serviceDate);
};

const wellTransSourceFingerprint = (payload) => crypto
  .createHash("sha256")
  .update(JSON.stringify({
    bookingId: payload.bookingId,
    serviceDate: payload.serviceDate,
    driver: payload.driver,
    vehicle: payload.vehicle,
    pickup: payload.pickup,
    dropoff: payload.dropoff,
  }))
  .digest("hex");

const wellTransOutboxId = (serviceDate, tripId) => crypto
  .createHash("sha256")
  .update(`welltrans:${serviceDate}:${tripId}`)
  .digest("hex");

// Durable completion outbox. The worker can discover changed trips for one
// service date without repeatedly downloading the entire trips collection.
exports.captureWellTransTripCompletion = functions.firestore
  .document("trips/{tripId}")
  .onWrite(async (change, context) => {
    const before = change.before.exists ? { id: context.params.tripId, ...change.before.data() } : null;
    const after = change.after.exists ? { id: context.params.tripId, ...change.after.data() } : null;
    const dates = [...new Set([before && wellTransServiceDate(before), after && wellTransServiceDate(after)].filter(Boolean))];
    if (!dates.length) return null;
    const batch = admin.firestore().batch();
    for (const serviceDate of dates) {
      const eligible = Boolean(
        after
        && wellTransServiceDate(after) === serviceDate
        && isWellTransCompletedTrip(after)
      );
      const ref = admin.firestore().doc(
        `welltrans_sync_outbox/${wellTransOutboxId(serviceDate, context.params.tripId)}`,
      );
      batch.set(ref, {
        provider: "welltrans",
        tripId: context.params.tripId,
        serviceDate,
        eligibility: eligible ? "eligible" : "ineligible",
        sourceDocumentUpdatedAt: after?.updatedAt || after?.completedAt || null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    await batch.commit();
    return null;
  });

const unsafeWellTransRetry = (log = {}) => {
  const failure = String(log.errorMessage || "").toLowerCase();
  return failure.includes("expected exactly one of each")
    || failure.includes("does not match trip service date")
    || failure.includes("source trip")
    || failure.includes("rollback could not be proven");
};

exports.queueWellTransSync = functions
  .runWith({ timeoutSeconds: 540, memory: "512MB" })
  .https.onCall(async (data, context) => {
  await requireAdmin(context);
  const settingsSnap = await admin.firestore().doc("welltrans_settings/primary").get();
  const settings = settingsSnap.exists ? settingsSnap.data() : {};
  if (!settings.enabled) throw new functions.https.HttpsError("failed-precondition", "WellTrans automation is disabled.");
  if (!/^https:\/\//i.test(settings.portalUrl || "")) throw new functions.https.HttpsError("failed-precondition", "A secure WellTrans portal URL is required.");
  const requestedServiceDate = String(data?.serviceDate || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedServiceDate)) {
    throw new functions.https.HttpsError("invalid-argument", "A valid selected service date is required.");
  }
  const mode = String(data?.mode || "selected");
  const fullDateMode = mode === "full-date" || mode === "start-fill";
  const authoritativeTrips = fullDateMode
    ? await loadCompletedWellTransTrips(requestedServiceDate)
    : [];
  const authoritativeById = new Map(authoritativeTrips.map((trip) => [String(trip.id), trip]));
  const clientIds = [...new Set((Array.isArray(data?.tripIds) ? data.tripIds : []).map(String))];
  const requestedIds = fullDateMode ? [...authoritativeById.keys()] : clientIds;
  const wellTransShardSize = 250;
  const shardByTrip = new Map(requestedIds.map((tripId, index) => [
    tripId,
    `${requestedServiceDate}_${String(Math.floor(index / wellTransShardSize)).padStart(4, "0")}`,
  ]));
  if (!requestedIds.length && !fullDateMode) {
    throw new functions.https.HttpsError("invalid-argument", "Select at least one trip.");
  }
  if (requestedIds.length > 10000) {
    throw new functions.https.HttpsError(
      "resource-exhausted",
      `The selected date contains ${requestedIds.length} completed trips; the current guarded run limit is 10,000.`,
    );
  }
  const manifestRef = admin.firestore().doc(`welltrans_sync_manifests/${requestedServiceDate}`);
  if (fullDateMode) {
    const shardSize = wellTransShardSize;
    const shardCount = Math.ceil(requestedIds.length / shardSize);
    for (let offset = 0; offset < requestedIds.length; offset += shardSize * 400) {
      const batch = admin.firestore().batch();
      const firstShard = Math.floor(offset / shardSize);
      const finalShard = Math.min(shardCount, firstShard + 400);
      for (let shardIndex = firstShard; shardIndex < finalShard; shardIndex++) {
        const tripIds = requestedIds.slice(shardIndex * shardSize, (shardIndex + 1) * shardSize);
        const shardRef = admin.firestore().doc(
          `welltrans_sync_shards/${requestedServiceDate}_${String(shardIndex).padStart(4, "0")}`,
        );
        batch.set(shardRef, {
          provider: "welltrans",
          runId: requestedServiceDate,
          serviceDate: requestedServiceDate,
          shardIndex,
          shardCount,
          tripIds,
          tripCount: tripIds.length,
          state: "queued",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      }
      await batch.commit();
    }
    await manifestRef.set({
      provider: "welltrans",
      serviceDate: requestedServiceDate,
      state: "reconciling",
      expectedTripIds: requestedIds,
      expectedCount: requestedIds.length,
      shardSize,
      shardCount,
      clientTripCount: clientIds.length,
      source: "authoritative_firestore_completed_trip_scan",
      requestedBy: context.auth.uid,
      requestedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  }
  const [driversSnapshot, datedLogsSnapshot] = fullDateMode
    ? await Promise.all([
      admin.firestore().collection("drivers").get(),
      admin.firestore().collection("welltrans_sync_logs")
        .where("serviceDate", "==", requestedServiceDate)
        .get(),
    ])
    : [null, null];
  const driverNames = new Map((driversSnapshot?.docs || []).map(document => [
    document.id,
    document.data().name || "",
  ]));
  const latestLogByTrip = new Map();
  for (const document of datedLogsSnapshot?.docs || []) {
    const data = document.data();
    const key = String(data.tripId);
    const timestamp = data.updatedAt?.toMillis?.() || data.createdAt?.toMillis?.() || 0;
    const previous = latestLogByTrip.get(key);
    if (!previous || timestamp > previous.timestamp) {
      latestLogByTrip.set(key, { ref: document.ref, data, timestamp });
    }
  }
  let queued = 0;
  let covered = 0;
  let rejected = 0;
  const rejectionDetails = [];
  const processTrip = async (tripId) => {
    const tripSnap = authoritativeById.has(tripId)
      ? null
      : await admin.firestore().doc(`trips/${tripId}`).get();
    if (!authoritativeById.has(tripId) && !tripSnap.exists) {
      return { tripId, rejected: true, errors: ["Trip not found"] };
    }
    const trip = authoritativeById.get(tripId) || { id: tripSnap.id, ...tripSnap.data() };
    if (trip.driverId && (!trip.driverName || /medical transportation inc/i.test(trip.driverName))) {
      if (fullDateMode) {
        if (driverNames.get(trip.driverId)) trip.completedDriverName = driverNames.get(trip.driverId);
      } else {
        const driverSnap = await admin.firestore().doc(`drivers/${trip.driverId}`).get();
        if (driverSnap.exists && driverSnap.data().name) trip.completedDriverName = driverSnap.data().name;
      }
    }
    const { payload, errors } = buildWellTransJobPayload(trip);
    if (payload.serviceDate !== requestedServiceDate) {
      errors.push(`Trip belongs to ${payload.serviceDate || "an unknown date"}, not selected date ${requestedServiceDate}`);
    }
    if (errors.length) {
      return { tripId, bookingId: payload.bookingId, rejected: true, errors };
    }
    if (fullDateMode) {
      const latest = latestLogByTrip.get(tripId);
      if (latest && ["pending", "processing", "awaiting_review", "completed"].includes(latest.data.status)) {
        return { tripId, bookingId: payload.bookingId, covered: true, existingStatus: latest.data.status };
      }
      if (latest?.data.status === "failed" && unsafeWellTransRetry(latest.data)) {
        return {
          tripId,
          bookingId: payload.bookingId,
          rejected: true,
          errors: ["Unsafe failed attempt requires supervised correction before this date can be complete"],
        };
      }
      const ref = latest?.ref || admin.firestore().doc(
        `welltrans_sync_logs/${crypto.createHash("sha256").update(`welltrans:${requestedServiceDate}:${tripId}`).digest("hex")}`,
      );
      return {
        tripId,
        bookingId: payload.bookingId,
        queued: true,
        writeRef: ref,
        writeData: {
          tripId, bookingId: payload.bookingId, serviceDate: requestedServiceDate,
          status: "pending", stage: latest ? "requeued_by_authoritative_run" : "queued",
          startedAt: null, completedAt: admin.firestore.FieldValue.delete(),
          errorMessage: "", screenshot: "",
          syncedBy: context.auth.uid,
          createdAt: latest?.data.createdAt || admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          attempt: Number(latest?.data.attempt || 0) + 1,
          provider: "welltrans", automationMethod: "playwright", payload,
          manifestId: requestedServiceDate,
          runId: requestedServiceDate,
          shardId: shardByTrip.get(tripId),
          queuedSourceFingerprint: wellTransSourceFingerprint(payload),
        },
      };
    }
    const logsQuery = admin.firestore().collection("welltrans_sync_logs").where("tripId", "==", tripId);
    const newLogRef = admin.firestore().collection("welltrans_sync_logs").doc();
    const decision = await admin.firestore().runTransaction(async transaction => {
      const attempts = await transaction.get(logsQuery);
      const datedAttempts = attempts.docs
        .map(document => ({ id: document.id, ...document.data() }))
        .filter(log => String(log.serviceDate || log.payload?.serviceDate || requestedServiceDate).slice(0, 10) === requestedServiceDate)
        .sort((left, right) => {
          const leftTime = left.updatedAt?.toMillis?.() || left.createdAt?.toMillis?.() || 0;
          const rightTime = right.updatedAt?.toMillis?.() || right.createdAt?.toMillis?.() || 0;
          return rightTime - leftTime;
        });
      const latest = datedAttempts[0];
      if (mode === "retry") {
        if (!latest || latest.status !== "failed") {
          return { queued: false, error: latest ? `Latest status is ${latest.status}, not failed` : "No failed attempt exists for the selected date" };
        }
        if (unsafeWellTransRetry(latest)) {
          return { queued: false, error: "Failure requires Booking ID/date correction in WellTrans and is not safe for automatic retry" };
        }
      } else if (latest && ["pending", "processing", "awaiting_review", "completed"].includes(latest.status)) {
        return fullDateMode
          ? { queued: false, covered: true, existingStatus: latest.status }
          : { queued: false, error: `Already ${latest.status.replace("_", " ")} for the selected date` };
      } else if (fullDateMode && latest?.status === "failed" && unsafeWellTransRetry(latest)) {
        return { queued: false, error: "Unsafe failed attempt requires supervised correction before this date can be complete" };
      }
      transaction.create(newLogRef, {
        tripId, bookingId: payload.bookingId, serviceDate: requestedServiceDate,
        status: "pending", stage: "queued",
        startedAt: null, completedAt: null, errorMessage: "", screenshot: "",
        syncedBy: context.auth.uid, createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(), attempt: datedAttempts.length + 1,
        provider: "welltrans", automationMethod: "playwright", payload,
        manifestId: fullDateMode ? requestedServiceDate : null,
        queuedSourceFingerprint: wellTransSourceFingerprint(payload),
      });
      return { queued: true };
    });
    if (decision.queued) return { tripId, bookingId: payload.bookingId, queued: true };
    if (decision.covered) {
      return {
        tripId, bookingId: payload.bookingId, covered: true,
        existingStatus: decision.existingStatus,
      };
    }
    return { tripId, bookingId: payload.bookingId, rejected: true, errors: [decision.error] };
  };
  const processingChunkSize = fullDateMode ? 250 : 20;
  for (let offset = 0; offset < requestedIds.length; offset += processingChunkSize) {
    const results = await Promise.all(requestedIds.slice(offset, offset + processingChunkSize).map(processTrip));
    const writes = results.filter(result => result.writeRef);
    for (let writeOffset = 0; writeOffset < writes.length; writeOffset += 400) {
      const batch = admin.firestore().batch();
      for (const write of writes.slice(writeOffset, writeOffset + 400)) {
        batch.set(write.writeRef, write.writeData, { merge: true });
      }
      await batch.commit();
    }
    for (const result of results) {
      if (result.queued) queued++;
      else if (result.covered) covered++;
      else {
        rejected++;
        rejectionDetails.push({
          tripId: result.tripId,
          bookingId: result.bookingId || "",
          errors: result.errors || ["Unknown reconciliation failure"],
        });
      }
    }
  }
  if (fullDateMode) {
    await manifestRef.set({
      state: rejected > 0 ? "blocked" : (requestedIds.length ? "queued" : "empty"),
      expectedCount: requestedIds.length,
      eligibleCount: requestedIds.length - rejected,
      queuedCount: queued,
      coveredCount: covered,
      blockedCount: rejected,
      blockedTrips: rejectionDetails.slice(0, 200),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  }
  await admin.firestore().collection("audit_logs").add({
    action: "welltrans.sync.queued", entityType: "broker_sync", actorId: context.auth.uid,
    mode, serviceDate: requestedServiceDate,
    requested: requestedIds.length, queued, covered, rejected,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return {
    expected: requestedIds.length,
    queued,
    covered,
    rejected,
    reconciliationState: rejected > 0 ? "blocked" : "queued",
    rejectionDetails: rejectionDetails.slice(0, 200),
  };
});

exports.confirmWellTransReviewBatchApplied = functions
  .runWith({ timeoutSeconds: 120, memory: "256MB" })
  .https.onCall(async (data, context) => {
    await requireAdmin(context);
    const serviceDate = String(data?.serviceDate || "").trim();
    const reviewSessionId = String(data?.reviewSessionId || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(serviceDate) || !reviewSessionId) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "A valid service date and live review-session ID are required.",
      );
    }

    const workerSnapshot = await admin.firestore().doc("welltrans_worker_status/primary").get();
    const worker = workerSnapshot.exists ? workerSnapshot.data() || {} : {};
    if (worker.selectedDate !== serviceDate
      || worker.reviewSessionId !== reviewSessionId
      || !["review_batch_ready", "review_ready"].includes(worker.state)) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "The worker is not holding a review-ready batch for this date and browser session.",
      );
    }

    const snapshot = await admin.firestore().collection("welltrans_sync_logs")
      .where("serviceDate", "==", serviceDate)
      .where("status", "==", "awaiting_review")
      .get();
    const reviewDocuments = snapshot.docs.filter((document) =>
      document.data().reviewSessionId === reviewSessionId);
    if (!reviewDocuments.length) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "No staged trips belong to the current live review batch.",
      );
    }
    if (reviewDocuments.length > 500) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "The live review batch exceeds the 500-trip safety boundary.",
      );
    }

    for (let offset = 0; offset < reviewDocuments.length; offset += 400) {
      const batch = admin.firestore().batch();
      for (const document of reviewDocuments.slice(offset, offset + 400)) {
        batch.update(document.ref, {
          status: "completed",
          stage: "manual_batch_apply_pending_live_verification",
          appliedBy: context.auth.uid,
          appliedReviewSessionId: reviewSessionId,
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          portalVerifiedAt: admin.firestore.FieldValue.delete(),
          portalVerification: admin.firestore.FieldValue.delete(),
        });
      }
      await batch.commit();
    }

    await admin.firestore().doc("welltrans_worker_status/primary").set({
      state: "batch_apply_confirmed",
      selectedDate: serviceDate,
      reviewSessionId,
      lastAppliedBatchCount: reviewDocuments.length,
      lastAppliedBatchConfirmedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    await admin.firestore().collection("audit_logs").add({
      action: "welltrans.review_batch.applied",
      entityType: "broker_sync_batch",
      actorId: context.auth.uid,
      serviceDate,
      reviewSessionId,
      confirmed: reviewDocuments.length,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return {
      confirmed: reviewDocuments.length,
      serviceDate,
      reviewSessionId,
      verificationPending: true,
    };
  });

exports.confirmWellTransDateApplied = functions
  .runWith({ timeoutSeconds: 120, memory: "256MB" })
  .https.onCall(async (data, context) => {
    await requireAdmin(context);
    const serviceDate = String(data?.serviceDate || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(serviceDate)) {
      throw new functions.https.HttpsError("invalid-argument", "A valid service date is required.");
    }
    const manifestRef = admin.firestore().doc(`welltrans_sync_manifests/${serviceDate}`);
    const [manifestSnapshot, logsSnapshot] = await Promise.all([
      manifestRef.get(),
      admin.firestore().collection("welltrans_sync_logs")
        .where("serviceDate", "==", serviceDate).get(),
    ]);
    if (!manifestSnapshot.exists) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Run Reconcile & Fill Date before confirming Apply.",
      );
    }
    const manifest = manifestSnapshot.data() || {};
    const expectedTripIds = [...new Set((manifest.expectedTripIds || []).map(String))];
    if (!expectedTripIds.length) {
      throw new functions.https.HttpsError("failed-precondition", "The date manifest contains no completed trips.");
    }
    const latestByTrip = new Map();
    for (const document of logsSnapshot.docs) {
      const log = { id: document.id, ref: document.ref, ...document.data() };
      const current = latestByTrip.get(String(log.tripId));
      const updated = log.updatedAt?.toMillis?.() || log.createdAt?.toMillis?.() || 0;
      const currentUpdated = current?.updatedAt?.toMillis?.() || current?.createdAt?.toMillis?.() || 0;
      if (!current || updated > currentUpdated) latestByTrip.set(String(log.tripId), log);
    }
    const incomplete = expectedTripIds.filter((tripId) =>
      !["awaiting_review", "completed"].includes(latestByTrip.get(tripId)?.status));
    if (incomplete.length || Number(manifest.blockedCount || 0) > 0) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        `Apply confirmation is locked: ${incomplete.length} trips are not verified and ${manifest.blockedCount || 0} are blocked.`,
      );
    }
    const awaiting = expectedTripIds
      .map((tripId) => latestByTrip.get(tripId))
      .filter((log) => log?.status === "awaiting_review");
    for (let offset = 0; offset < awaiting.length; offset += 400) {
      const batch = admin.firestore().batch();
      for (const log of awaiting.slice(offset, offset + 400)) {
        batch.update(log.ref, {
          status: "completed",
          stage: "completed_after_manual_apply",
          appliedBy: context.auth.uid,
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      await batch.commit();
    }
    await Promise.all([
      manifestRef.set({
        state: "completed",
        confirmedCount: expectedTripIds.length,
        stagedCount: 0,
        completedCount: expectedTripIds.length,
        missingCount: 0,
        failedCount: 0,
        confirmedBy: context.auth.uid,
        confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true }),
      admin.firestore().doc("welltrans_settings/primary").set({
        lastSync: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true }),
      admin.firestore().collection("audit_logs").add({
        action: "welltrans.sync.date_manually_applied",
        entityType: "broker_sync_manifest",
        entityId: serviceDate,
        actorId: context.auth.uid,
        confirmed: expectedTripIds.length,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      }),
    ]);
    return { confirmed: expectedTripIds.length };
  });

exports.auditWellTransSettings = functions.firestore
  .document("welltrans_settings/{settingsId}")
  .onWrite(async (change, context) => {
    const before = change.before.exists ? change.before.data() : null;
    const after = change.after.exists ? change.after.data() : null;
    await admin.firestore().collection("audit_logs").add({
      action: "welltrans.settings.changed", entityType: "broker_sync_settings",
      entityId: context.params.settingsId, actorId: after?.updatedBy || "unknown",
      before: before ? { enabled: before.enabled, portalUrl: before.portalUrl, automationMethod: before.automationMethod, fieldMapping: before.fieldMapping } : null,
      after: after ? { enabled: after.enabled, portalUrl: after.portalUrl, automationMethod: after.automationMethod, fieldMapping: after.fieldMapping } : null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return null;
  });

exports.createUser = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Must be logged in");
  const ref = await admin.firestore().collection("users").add(data);
  return { id: ref.id };
});

exports.dayRollover = functions.pubsub.schedule("0 0 * * *").onRun(async (ctx) => {
  const today = new Date().toISOString().slice(0, 10);
  const snap = await admin.firestore().collection("assignments").where("date", "<", today).get();
  let cleaned = 0;
  snap.forEach(() => cleaned++);
  functions.logger.info(`dayRollover: ${today} — ${cleaned} past assignments found`);
});

exports.migrateTripDateKeys = functions.https.onCall(async (data, context) => {
  const tripsSnap = await admin.firestore().collection("trips").get();
  const batch = admin.firestore().batch();
  let updated = 0;
  tripsSnap.forEach((doc) => {
    const d = doc.data();
    if (!d.dateKey && d.date) {
      batch.update(doc.ref, { dateKey: d.date });
      updated++;
    }
  });
  if (updated > 0) await batch.commit();
  return { updated };
});

exports.sendPushNotification = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be signed in.');
  const { title, body, tokens, type } = data;
  if (!tokens || !tokens.length) return { success: false, message: 'No tokens' };
  const payload = {
    notification: { title: title || 'Agape Care', body: body || '' },
    data: { type: type || 'notification' },
  };
  try {
    const response = await admin.messaging().sendEachForMulticast({ tokens, ...payload });
    return { success: true, sent: response.successCount, failed: response.failureCount };
  } catch (e) {
    functions.logger.error('sendPushNotification failed', e);
    return { success: false, error: e.message };
  }
});


exports.systemHealthCheck = functions.https.onRequest(async (req, res) => {
  const checks = { firestore: false, auth: false };
  try {
    await admin.firestore().doc("_health/check").get();
    checks.firestore = true;
  } catch (e) { /* */ }
  try {
    await admin.auth().getUser("_nonexistent_");
  } catch (e) {
    if (e.code === "auth/user-not-found") checks.auth = true;
  }
  const healthy = checks.firestore && checks.auth;
  res.status(healthy ? 200 : 503).json({ status: healthy ? "healthy" : "degraded", checks });
});

exports.monitorWellTransOperations = functions.pubsub
  .schedule("every 5 minutes")
  .timeZone("America/Indiana/Indianapolis")
  .onRun(async () => {
    const db = admin.firestore();
    const now = Date.now();
    const activeCutoff = admin.firestore.Timestamp.fromMillis(now - 90_000);
    const [settingsSnapshot, workersSnapshot, processingSnapshot, blockedSnapshot, previousSnapshot] =
      await Promise.all([
        db.doc("welltrans_settings/primary").get(),
        db.collection("welltrans_workers").where("lastSeenAt", ">=", activeCutoff).get(),
        db.collection("welltrans_sync_logs").where("status", "==", "processing").limit(500).get(),
        db.collection("welltrans_sync_manifests").where("state", "==", "blocked").limit(50).get(),
        db.doc("welltrans_operations/health").get(),
      ]);

    const enabled = settingsSnapshot.exists && settingsSnapshot.data().enabled === true;
    const activeWorkers = workersSnapshot.docs.map(document => {
      const data = document.data();
      return {
        id: document.id,
        workerId: data.workerId || "",
        version: data.version || "",
        state: data.state || "unknown",
        selectedDate: data.selectedDate || null,
        lastSeenAt: data.lastSeenAt || null,
      };
    });
    const staleProcessing = processingSnapshot.docs.filter(document => {
      const expiresAt = document.data().leaseExpiresAt?.toMillis?.() || 0;
      return expiresAt > 0 && expiresAt < now;
    });
    const blockedDates = blockedSnapshot.docs.map(document => document.id);
    const state = !enabled
      ? "disabled"
      : activeWorkers.length === 0 || staleProcessing.length > 0
        ? "critical"
        : blockedDates.length > 0
          ? "degraded"
          : "healthy";
    const previous = previousSnapshot.exists ? previousSnapshot.data() : {};
    const stateChanged = previous.state !== state;
    const health = {
      provider: "welltrans",
      enabled,
      state,
      activeWorkerCount: activeWorkers.length,
      standbyWorkerCount: activeWorkers.filter(worker => worker.state === "lease_standby").length,
      activeWorkers,
      staleProcessingCount: staleProcessing.length,
      staleProcessingIds: staleProcessing.slice(0, 100).map(document => document.id),
      blockedDateCount: blockedDates.length,
      blockedDates,
      checkedAt: admin.firestore.FieldValue.serverTimestamp(),
      stateChangedAt: stateChanged
        ? admin.firestore.FieldValue.serverTimestamp()
        : previous.stateChangedAt || admin.firestore.FieldValue.serverTimestamp(),
    };
    await db.doc("welltrans_operations/health").set(health, { merge: true });

    if (stateChanged) {
      await db.collection("audit_logs").add({
        action: "welltrans.operations.health_changed",
        entityType: "broker_sync",
        entityId: "welltrans",
        previousState: previous.state || null,
        state,
        activeWorkerCount: activeWorkers.length,
        staleProcessingCount: staleProcessing.length,
        blockedDates,
        actorId: "system",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    if (enabled && stateChanged && (state === "critical" || state === "degraded")) {
      const administrators = await db.collection("users")
        .where("role", "in", ["admin", "superadmin", "owner"])
        .get();
      const tokens = [...new Set(administrators.docs
        .map(document => document.data().fcmToken)
        .filter(Boolean))];
      if (tokens.length) {
        const body = state === "critical"
          ? `WellTrans needs attention: ${activeWorkers.length} active agents, ${staleProcessing.length} stuck jobs.`
          : `WellTrans has ${blockedDates.length} blocked service date(s).`;
        await admin.messaging().sendEachForMulticast({
          tokens: tokens.slice(0, 500),
          notification: { title: "WellTrans Operations Alert", body },
          data: { type: "welltrans_operations", state },
          webpush: {
            headers: { Urgency: "high" },
            notification: {
              title: "WellTrans Operations Alert",
              body,
              icon: "/agape.png",
              badge: "/agape.png",
              tag: "welltrans-operations",
              renotify: true,
            },
            fcmOptions: { link: "/?view=welltrans" },
          },
        });
      }
    }
    return health;
  });
