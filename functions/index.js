const functions = require("firebase-functions/v1");
const { onTaskDispatched } = require("firebase-functions/tasks");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const { getAuth } = require("firebase-admin/auth");
const { FieldValue, Timestamp, getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
const { getStorage } = require("firebase-admin/storage");
const { getFunctions } = require("firebase-admin/functions");
const axios = require("axios");
const crypto = require("crypto");

function resolveRuntimeProjectId() {
  if (process.env.GCLOUD_PROJECT) return process.env.GCLOUD_PROJECT;
  if (process.env.GOOGLE_CLOUD_PROJECT) return process.env.GOOGLE_CLOUD_PROJECT;
  try {
    return JSON.parse(process.env.FIREBASE_CONFIG || "{}").projectId || null;
  } catch (_error) {
    return null;
  }
}

const runtimeProjectId = resolveRuntimeProjectId();
admin.initializeApp(runtimeProjectId ? { projectId: runtimeProjectId } : undefined);

// firebase-admin v14 is modular. Keep the established implementation stable
// while routing every legacy namespace call through supported modular APIs.
admin.auth = getAuth;
admin.firestore = getFirestore;
admin.firestore.FieldValue = FieldValue;
admin.firestore.Timestamp = Timestamp;
admin.messaging = getMessaging;
admin.storage = getStorage;

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
  const profile = userDoc.data();
  const accessStatus = String(profile.accessStatus || profile.employmentStatus || "active").toLowerCase();
  if (profile.disabled === true || profile.active === false || ["disabled", "inactive", "revoked", "suspended", "terminated", "separated"].includes(accessStatus)) {
    throw new functions.https.HttpsError("permission-denied", "This account is not active.");
  }
  const role = profile.role;
  if (!allowedRoles.includes(role)) {
    throw new functions.https.HttpsError("permission-denied", `This action requires one of these roles: ${allowedRoles.join(", ")}.`);
  }
  return { id: userDoc.id, ...userDoc.data(), tenantId: userDoc.data().tenantId || "agape-care" };
}

async function invalidateUserSessions(uid, reason, actorUid) {
  const sessions = await admin.firestore().collection("sessions").where("userId", "==", uid).get();
  if (sessions.empty) return 0;
  const batches = [];
  let batch = admin.firestore().batch();
  let operations = 0;
  sessions.docs.forEach((sessionDoc) => {
    batch.set(sessionDoc.ref, {
      status: "revoked",
      invalidatedReason: reason,
      invalidatedBy: actorUid,
      invalidatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    operations += 1;
    if (operations % 450 === 0) {
      batches.push(batch.commit());
      batch = admin.firestore().batch();
    }
  });
  if (operations % 450 !== 0) batches.push(batch.commit());
  await Promise.all(batches);
  return operations;
}

async function requireAdmin(context) {
  return requireRole(context, ["admin"]);
}

async function requireAdminOrDispatcher(context) {
  return requireRole(context, ["admin", "dispatcher"]);
}

exports.deleteUser = functions.https.onCall(async (data, context) => {
  const actor = await requireAdmin(context);
  const { uid } = data;
  if (!uid) {
    throw new functions.https.HttpsError("invalid-argument", "The function must be called with a valid 'uid' property.");
  }
  if (uid === context.auth.uid) {
    throw new functions.https.HttpsError("failed-precondition", "Administrators cannot remove their own active account.");
  }
  try {
    const targetRef = admin.firestore().doc(`users/${uid}`);
    const targetSnapshot = await targetRef.get();
    if (!targetSnapshot.exists || (targetSnapshot.data().tenantId || "agape-care") !== actor.tenantId) {
      throw new functions.https.HttpsError("not-found", "User was not found in this organization.");
    }
    await targetRef.set({
      accessStatus: "revoked",
      disabled: true,
      accessRevokedAt: admin.firestore.FieldValue.serverTimestamp(),
      accessRevokedBy: context.auth.uid,
    }, { merge: true });
    await admin.auth().updateUser(uid, { disabled: true });
    await admin.auth().revokeRefreshTokens(uid);
    await invalidateUserSessions(uid, "account_removed", context.auth.uid);
    await admin.firestore().collection("audit_logs").add({
      action: "security.user_removed",
      entityType: "user",
      entityId: uid,
      actorId: context.auth.uid,
      tenantId: actor.tenantId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await admin.auth().deleteUser(uid);
    return { success: true, message: "User deleted successfully." };
  } catch (error) {
    if (error instanceof functions.https.HttpsError) throw error;
    throw new functions.https.HttpsError("internal", error.message || "Failed to delete user.");
  }
});

exports.setUserAccess = functions.https.onCall(async (data, context) => {
  const actor = await requireAdmin(context);
  const uid = String(data?.uid || "").trim();
  const enabled = data?.enabled === true;
  const reason = String(data?.reason || (enabled ? "access_restored" : "employment_access_disabled")).slice(0, 300);
  if (!uid) throw new functions.https.HttpsError("invalid-argument", "A user uid is required.");
  if (uid === context.auth.uid && !enabled) {
    throw new functions.https.HttpsError("failed-precondition", "Administrators cannot disable their own active account.");
  }

  const targetRef = admin.firestore().doc(`users/${uid}`);
  const targetSnapshot = await targetRef.get();
  if (!targetSnapshot.exists || (targetSnapshot.data().tenantId || "agape-care") !== actor.tenantId) {
    throw new functions.https.HttpsError("not-found", "User was not found in this organization.");
  }

  await admin.auth().updateUser(uid, { disabled: !enabled });
  await admin.auth().revokeRefreshTokens(uid);
  await targetRef.set({
    accessStatus: enabled ? "active" : "suspended",
    disabled: !enabled,
    accessChangedAt: admin.firestore.FieldValue.serverTimestamp(),
    accessChangedBy: context.auth.uid,
    accessChangeReason: reason,
  }, { merge: true });
  const invalidatedSessions = await invalidateUserSessions(uid, enabled ? "access_reset" : "access_disabled", context.auth.uid);
  await admin.firestore().collection("audit_logs").add({
    action: enabled ? "security.user_access_restored" : "security.user_access_disabled",
    entityType: "user",
    entityId: uid,
    actorId: context.auth.uid,
    tenantId: actor.tenantId,
    reason,
    invalidatedSessions,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return { success: true, enabled, invalidatedSessions };
});

exports.enterpriseAiGenerate = functions
  .runWith({ secrets: [runtimeConfigSecret], timeoutSeconds: 120, memory: "512MB" })
  .https.onCall(async (data, context) => {
    const actor = await requireRole(context, ["admin", "dispatcher", "driver"]);
    const prompt = String(data?.prompt || "").trim();
    if (!prompt || prompt.length > 30000) {
      throw new functions.https.HttpsError("invalid-argument", "AI input must contain between 1 and 30,000 characters.");
    }

    const now = Date.now();
    const rateRef = admin.firestore().doc(`security_rate_limits/ai_${context.auth.uid}`);
    const rateLimit = actor.role === "driver" ? 10 : 30;
    await admin.firestore().runTransaction(async (transaction) => {
      const snapshot = await transaction.get(rateRef);
      const current = snapshot.exists ? snapshot.data() : {};
      const windowStartedAt = Number(current.windowStartedAt || 0);
      const sameWindow = now - windowStartedAt < 60000;
      const count = sameWindow ? Number(current.count || 0) : 0;
      if (count >= rateLimit) {
        throw new functions.https.HttpsError("resource-exhausted", "AI request limit reached. Wait one minute and retry.");
      }
      transaction.set(rateRef, {
        userId: context.auth.uid,
        tenantId: actor.tenantId,
        windowStartedAt: sameWindow ? windowStartedAt : now,
        count: count + 1,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    });

    const gemini = getRuntimeConfig().gemini || {};
    if (!gemini.api_key || gemini.enabled !== true) {
      throw new functions.https.HttpsError("failed-precondition", "The secure AI service is not configured.");
    }
    const model = String(gemini.model || "gemini-2.5-flash").replace(/[^A-Za-z0-9._-]/g, "");
    const temperature = Math.max(0, Math.min(1, Number(data?.temperature ?? 0.1)));
    const maxOutputTokens = Math.max(64, Math.min(8192, Number(data?.maxOutputTokens || 4096)));
    try {
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature, maxOutputTokens },
        },
        {
          params: { key: gemini.api_key },
          timeout: 90000,
          headers: { "Content-Type": "application/json" },
        }
      );
      const text = String(response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
      if (!text) throw new Error("AI provider returned no content.");
      return { text, model, serverProcessed: true };
    } catch (error) {
      functions.logger.warn("Secure enterprise AI request failed.", {
        uid: context.auth.uid,
        role: actor.role,
        status: error?.response?.status || null,
        message: error.message,
      });
      throw new functions.https.HttpsError("unavailable", "The secure AI service is temporarily unavailable.");
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
  const actor = await requireAdminOrDispatcher(context);
  const { assignments } = data;
  if (!assignments || !Array.isArray(assignments) || assignments.length === 0) {
    throw new functions.https.HttpsError("invalid-argument", "'assignments' must be a non-empty array.");
  }
  if (assignments.length > 450) {
    throw new functions.https.HttpsError("invalid-argument", "A maximum of 450 assignments is allowed per request.");
  }
  const batch = admin.firestore().batch();
  let count = 0;
  for (const a of assignments) {
    if (!a.id || !a.tripId) continue;
    batch.set(admin.firestore().doc("assignments", a.id), {
      ...a,
      tenantId: actor.tenantId,
      updatedBy: context.auth.uid,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
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
  else if (!isWellTransCompletedTrip(trip)) errors.push("Trip is not completed");
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
  const states = [
    trip.status, trip.operationalStatus, trip.lifecycleStatus, trip.lifecycleStep,
  ].map((value) => String(value || "").trim().toLowerCase()).filter(Boolean);
  const disallowed = new Set([
    "cancelled", "canceled", "no show", "no-show", "noshow", "rerouted",
    "assigned", "accepted", "en route", "at pickup", "at dropoff", "arrived", "pending",
  ]);
  if (states.some((state) => disallowed.has(state))) return false;
  return states.some((state) => ["completed", "complete", "done"].includes(state));
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

const wellTransDriverRunId = (serviceDate, driverId) => crypto
  .createHash("sha256")
  .update(`welltrans-driver:${serviceDate}:${driverId}`)
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

const WELLTRANS_SHARD_SIZE = 250;

const refreshWellTransManifestFromShards = async (serviceDate, orchestrationId) => {
  const snapshot = await admin.firestore().collection("welltrans_sync_shards")
    .where("serviceDate", "==", serviceDate)
    .get();
  const shards = snapshot.docs
    .map((document) => document.data())
    .filter((shard) => shard.orchestrationId === orchestrationId);
  if (!shards.length) return;
  const finished = shards.filter((shard) => ["ready", "blocked"].includes(shard.state)).length;
  const blocked = shards.reduce((total, shard) => total + Number(shard.blockedCount || 0), 0);
  const queued = shards.reduce((total, shard) => total + Number(shard.queuedCount || 0), 0);
  const covered = shards.reduce((total, shard) => total + Number(shard.coveredCount || 0), 0);
  await admin.firestore().doc(`welltrans_sync_manifests/${serviceDate}`).set({
    orchestrationId,
    orchestrationState: finished === shards.length
      ? (blocked ? "blocked" : "ready")
      : "processing",
    state: finished === shards.length
      ? (blocked ? "blocked" : "queued")
      : "reconciling",
    processedShardCount: finished,
    shardCount: shards.length,
    queuedCount: queued,
    coveredCount: covered,
    blockedCount: blocked,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
};

const reconcileWellTransShard = async ({ serviceDate, shardId, orchestrationId, actorId }) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(serviceDate || ""))) {
    throw new Error("WellTrans task received an invalid service date");
  }
  const shardRef = admin.firestore().doc(`welltrans_sync_shards/${shardId}`);
  const shardSnapshot = await shardRef.get();
  if (!shardSnapshot.exists) return { stale: true, reason: "shard_missing" };
  const shard = shardSnapshot.data() || {};
  if (shard.serviceDate !== serviceDate || shard.orchestrationId !== orchestrationId) {
    return { stale: true, reason: "superseded_orchestration" };
  }
  if (["ready", "blocked"].includes(shard.state)) {
    return { idempotent: true, state: shard.state };
  }

  await shardRef.set({
    state: "processing",
    processingStartedAt: admin.firestore.FieldValue.serverTimestamp(),
    taskAttempt: admin.firestore.FieldValue.increment(1),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  const tripIds = [...new Set((shard.tripIds || []).map(String))].slice(0, WELLTRANS_SHARD_SIZE);
  const tripRefs = tripIds.map((tripId) => admin.firestore().doc(`trips/${tripId}`));
  const tripSnapshots = tripRefs.length ? await admin.firestore().getAll(...tripRefs) : [];
  const driversSnapshot = await admin.firestore().collection("drivers").get();
  const driverNames = new Map(driversSnapshot.docs.map((document) => [
    document.id,
    document.data().name || "",
  ]));
  const logRefs = tripIds.map((tripId) => admin.firestore().doc(
    `welltrans_sync_logs/${wellTransOutboxId(serviceDate, tripId)}`,
  ));
  const logSnapshots = logRefs.length ? await admin.firestore().getAll(...logRefs) : [];

  let queued = 0;
  let covered = 0;
  let blocked = 0;
  const blockedTrips = [];
  const writes = [];
  for (let index = 0; index < tripIds.length; index++) {
    const tripId = tripIds[index];
    const tripSnapshot = tripSnapshots[index];
    const existingSnapshot = logSnapshots[index];
    if (!tripSnapshot?.exists) {
      blocked++;
      blockedTrips.push({ tripId, errors: ["Trip not found"] });
      continue;
    }
    const trip = { id: tripSnapshot.id, ...tripSnapshot.data() };
    if (trip.driverId && (!trip.driverName || /medical transportation inc/i.test(trip.driverName))) {
      if (driverNames.get(trip.driverId)) trip.completedDriverName = driverNames.get(trip.driverId);
    }
    const { payload, errors } = buildWellTransJobPayload(trip);
    if (payload.serviceDate !== serviceDate) {
      errors.push(`Trip belongs to ${payload.serviceDate || "an unknown date"}, not selected date ${serviceDate}`);
    }
    const existing = existingSnapshot?.exists ? existingSnapshot.data() : null;
    if (errors.length) {
      blocked++;
      blockedTrips.push({ tripId, bookingId: payload.bookingId, errors });
      continue;
    }
    if (existing && ["pending", "processing", "awaiting_review", "completed"].includes(existing.status)) {
      covered++;
      continue;
    }
    if (existing?.status === "failed" && unsafeWellTransRetry(existing)) {
      blocked++;
      blockedTrips.push({
        tripId,
        bookingId: payload.bookingId,
        errors: ["Unsafe failed attempt requires supervised correction before this date can be complete"],
      });
      continue;
    }
    queued++;
    writes.push({
      ref: logRefs[index],
      data: {
        tripId,
        bookingId: payload.bookingId,
        serviceDate,
        status: "pending",
        stage: existing ? "requeued_by_cloud_task_reconciliation" : "queued_by_cloud_task_reconciliation",
        startedAt: null,
        completedAt: admin.firestore.FieldValue.delete(),
        errorMessage: "",
        screenshot: "",
        syncedBy: actorId || "cloud-task",
        createdAt: existing?.createdAt || admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        attempt: Number(existing?.attempt || 0) + 1,
        provider: "welltrans",
        automationMethod: "playwright",
        payload,
        manifestId: serviceDate,
        runId: serviceDate,
        scopeType: shard.scopeType || "all",
        scopeDriverId: shard.scopeDriverId || null,
        scopeDriverName: shard.scopeDriverName || null,
        shardId,
        orchestrationId,
        queuedSourceFingerprint: wellTransSourceFingerprint(payload),
      },
    });
  }

  for (let offset = 0; offset < writes.length; offset += 400) {
    const batch = admin.firestore().batch();
    for (const write of writes.slice(offset, offset + 400)) {
      batch.set(write.ref, write.data, { merge: true });
    }
    await batch.commit();
  }
  await shardRef.set({
    state: blocked ? "blocked" : "ready",
    queuedCount: queued,
    coveredCount: covered,
    blockedCount: blocked,
    blockedTrips: blockedTrips.slice(0, WELLTRANS_SHARD_SIZE),
    completedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  await refreshWellTransManifestFromShards(serviceDate, orchestrationId);
  return { queued, covered, blocked };
};

exports.wellTransReconcileShard = onTaskDispatched({
  region: "us-central1",
  retryConfig: {
    maxAttempts: 5,
    minBackoffSeconds: 15,
    maxBackoffSeconds: 300,
    maxDoublings: 4,
  },
  rateLimits: {
    maxConcurrentDispatches: 4,
    maxDispatchesPerSecond: 4,
  },
  timeoutSeconds: 540,
  memory: "512MiB",
}, async (request) => reconcileWellTransShard(request.data || {}));

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
  const requestedScope = data?.scope && typeof data.scope === "object" ? data.scope : {};
  const scopeType = requestedScope.type === "driver" ? "driver" : "all";
  const scopeDriverId = scopeType === "driver" ? String(requestedScope.driverId || "").trim() : "";
  if (scopeType === "driver" && !scopeDriverId) {
    throw new functions.https.HttpsError("invalid-argument", "Choose an authoritative driver before starting a driver-only run.");
  }
  let scopeDriverName = "";
  if (scopeDriverId) {
    const scopeDriverSnapshot = await admin.firestore().doc(`drivers/${scopeDriverId}`).get();
    if (!scopeDriverSnapshot.exists) {
      throw new functions.https.HttpsError("failed-precondition", "The selected driver no longer exists in the driver directory.");
    }
    scopeDriverName = String(scopeDriverSnapshot.data().name || "").trim();
    if (!scopeDriverName) {
      throw new functions.https.HttpsError("failed-precondition", "The selected driver has no authoritative directory name.");
    }
  }
  const allAuthoritativeTrips = fullDateMode
    ? await loadCompletedWellTransTrips(requestedServiceDate)
    : [];
  const authoritativeTrips = scopeType === "driver"
    ? allAuthoritativeTrips.filter((trip) => String(trip.driverId || "") === scopeDriverId)
    : allAuthoritativeTrips;
  const authoritativeById = new Map(authoritativeTrips.map((trip) => [String(trip.id), trip]));
  const clientIds = [...new Set((Array.isArray(data?.tripIds) ? data.tripIds : []).map(String))];
  const requestedIds = fullDateMode ? [...authoritativeById.keys()] : clientIds;
  const wellTransShardSize = WELLTRANS_SHARD_SIZE;
  const orchestrationId = fullDateMode ? crypto.randomUUID() : "";
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
          orchestrationId,
          scopeType,
          scopeDriverId: scopeDriverId || null,
          scopeDriverName: scopeDriverName || null,
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
      scopeType,
      scopeDriverId: scopeDriverId || null,
      scopeDriverName: scopeDriverName || null,
      orchestrationId,
      orchestrationState: "dispatching",
      requestedBy: context.auth.uid,
      requestedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    if (scopeType === "driver") {
      await admin.firestore().doc(
        `welltrans_driver_sync_status/${wellTransDriverRunId(requestedServiceDate, scopeDriverId)}`,
      ).set({
        provider: "welltrans",
        serviceDate: requestedServiceDate,
        driverId: scopeDriverId,
        driverName: scopeDriverName,
        state: requestedIds.length ? "reconciling" : "empty",
        expectedCount: requestedIds.length,
        verifiedCount: 0,
        requestedBy: context.auth.uid,
        orchestrationId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    const taskQueue = getFunctions().taskQueue("wellTransReconcileShard");
    for (let shardOffset = 0; shardOffset < shardCount; shardOffset += 50) {
      const enqueues = [];
      for (
        let shardIndex = shardOffset;
        shardIndex < Math.min(shardCount, shardOffset + 50);
        shardIndex++
      ) {
        const shardId = `${requestedServiceDate}_${String(shardIndex).padStart(4, "0")}`;
        const taskId = crypto.createHash("sha256")
          .update(`${orchestrationId}:${shardId}`)
          .digest("hex");
        enqueues.push(taskQueue.enqueue({
          serviceDate: requestedServiceDate,
          shardId,
          orchestrationId,
          actorId: context.auth.uid,
        }, {
          id: taskId,
          dispatchDeadlineSeconds: 540,
        }));
      }
      await Promise.all(enqueues);
    }
    await manifestRef.set({
      orchestrationState: requestedIds.length ? "dispatched" : "empty",
      state: requestedIds.length ? "reconciling" : "empty",
      dispatchedShardCount: shardCount,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    await admin.firestore().collection("audit_logs").add({
      action: "welltrans.sync.orchestrated",
      entityType: "broker_sync",
      actorId: context.auth.uid,
      mode,
      serviceDate: requestedServiceDate,
      orchestrationId,
      scopeType,
      scopeDriverId: scopeDriverId || null,
      scopeDriverName: scopeDriverName || null,
      requested: requestedIds.length,
      shardCount,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return {
      expected: requestedIds.length,
      queued: 0,
      covered: 0,
      rejected: 0,
      orchestrated: requestedIds.length,
      shardCount,
      orchestrationId,
      scopeType,
      scopeDriverId: scopeDriverId || null,
      scopeDriverName: scopeDriverName || null,
      reconciliationState: requestedIds.length ? "dispatching" : "empty",
    };
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
    if (scopeType === "driver" && String(trip.driverId || "") !== scopeDriverId) {
      return {
        tripId,
        bookingId: String(trip.bookingId || tripId),
        rejected: true,
        errors: ["Trip does not belong to the selected authoritative driver"],
      };
    }
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
          scopeType,
          scopeDriverId: scopeDriverId || null,
          scopeDriverName: scopeDriverName || null,
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
        scopeType,
        scopeDriverId: scopeDriverId || null,
        scopeDriverName: scopeDriverName || null,
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
    scopeType, scopeDriverId: scopeDriverId || null, scopeDriverName: scopeDriverName || null,
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
  const actor = await requireAdmin(context);
  const allowedRoles = new Set(["admin", "dispatcher", "driver"]);
  const role = String(data?.role || "").toLowerCase();
  if (!allowedRoles.has(role)) {
    throw new functions.https.HttpsError("invalid-argument", "A valid role is required.");
  }
  const ref = await admin.firestore().collection("users").add({
    email: String(data?.email || "").trim().toLowerCase(),
    name: String(data?.name || "").trim(),
    username: String(data?.username || "").trim(),
    role,
    tenantId: actor.tenantId,
    accessStatus: "active",
    employmentStatus: "active",
    disabled: false,
    createdBy: context.auth.uid,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
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
  const actor = await requireAdmin(context);
  const tripsSnap = await admin.firestore().collection("trips").limit(450).get();
  const batch = admin.firestore().batch();
  let updated = 0;
  tripsSnap.forEach((doc) => {
    const d = doc.data();
    if (!d.dateKey && d.date) {
      batch.update(doc.ref, { dateKey: d.date, tenantId: d.tenantId || actor.tenantId });
      updated++;
    }
  });
  if (updated > 0) await batch.commit();
  return { updated };
});

exports.sendPushNotification = functions.https.onCall(async (data, context) => {
  await requireAdminOrDispatcher(context);
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
  const diagnostics = {};
  try {
    await admin.firestore().collection("systemConfig").limit(1).get();
    checks.firestore = true;
  } catch (e) {
    diagnostics.firestore = e.code || "unknown";
    functions.logger.error("Health check Firestore probe failed", { code: e.code || "unknown", errorMessage: String(e.message || e).slice(0, 500) });
  }
  try {
    await admin.auth().listUsers(1);
    checks.auth = true;
  } catch (e) {
    diagnostics.auth = e.code || "unknown";
    functions.logger.error("Health check Auth probe failed", { code: e.code || "unknown", errorMessage: String(e.message || e).slice(0, 500) });
  }
  const healthy = checks.firestore && checks.auth;
  res.status(healthy ? 200 : 503).json({ status: healthy ? "healthy" : "degraded", checks, diagnostics });
});

exports.monitorWellTransOperations = functions.pubsub
  .schedule("every 5 minutes")
  .timeZone("America/Indiana/Indianapolis")
  .onRun(async () => {
    const db = admin.firestore();
    const now = Date.now();
    const activeCutoff = admin.firestore.Timestamp.fromMillis(now - 90_000);
    const [settingsSnapshot, workersSnapshot, processingSnapshot, blockedSnapshot, previousSnapshot, canarySnapshot] =
      await Promise.all([
        db.doc("welltrans_settings/primary").get(),
        db.collection("welltrans_workers").where("lastSeenAt", ">=", activeCutoff).get(),
        db.collection("welltrans_sync_logs").where("status", "==", "processing").limit(500).get(),
        db.collection("welltrans_sync_manifests").where("state", "==", "blocked").limit(50).get(),
        db.doc("welltrans_operations/health").get(),
        db.doc("welltrans_canary/latest").get(),
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
    const canary = canarySnapshot.exists ? canarySnapshot.data() : null;
    const canaryCheckedAt = canary?.checkedAt?.toMillis?.()
      || Number(canary?.checkedAtMs || 0);
    const canaryStale = enabled && activeWorkers.length > 0
      && (!canaryCheckedAt || now - canaryCheckedAt > 15 * 60_000);
    const canaryFailed = enabled && activeWorkers.length > 0
      && (canary?.passed === false || canaryStale);
    const state = !enabled
      ? "disabled"
      : activeWorkers.length === 0 || staleProcessing.length > 0 || canaryFailed
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
      canaryPassed: canary?.passed === true && !canaryStale,
      canaryStale,
      canaryServiceDate: canary?.serviceDate || null,
      canaryContractFingerprint: canary?.contractFingerprint || null,
      canaryError: canaryFailed
        ? String(canary?.errorMessage || (canaryStale ? "Portal contract canary is stale." : "Portal contract canary failed.")).slice(0, 500)
        : null,
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
        canaryPassed: health.canaryPassed,
        canaryStale,
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
          ? `WellTrans needs attention: ${activeWorkers.length} active agents, ${staleProcessing.length} stuck jobs${canaryFailed ? ", portal contract not verified" : ""}.`
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

function classifyWellTransFailure(message) {
  const value = String(message || "").toLowerCase();
  if (value.includes("mileage") || value.includes("odometer")) {
    return {
      category: "Mileage or odometer",
      explanation: "The source mileage was incomplete or the portal mileage field could not be verified.",
      recommendedAction: "Verify both source odometer readings and the portal mileage column, then retry the trip.",
    };
  }
  if (value.includes("booking") || value.includes("pickup") || value.includes("dropoff")) {
    return {
      category: "Booking-row match",
      explanation: "The exact Booking ID did not resolve to one unambiguous Pickup row and one unambiguous Dropoff row.",
      recommendedAction: "Confirm the selected service date and exact Booking ID in WellTrans. Never match using a passenger name.",
    };
  }
  if (value.includes("session") || value.includes("login") || value.includes("auth")) {
    return {
      category: "Portal session",
      explanation: "The local WellTrans session was unavailable or expired.",
      recommendedAction: "Open the enrolled Agent, sign in to WellTrans, and reopen TRIPS - ASSIGNED for the requested date.",
    };
  }
  if (value.includes("selector") || value.includes("field") || value.includes("contract")) {
    return {
      category: "Portal contract",
      explanation: "The WellTrans page did not expose the verified fields expected by the production adapter.",
      recommendedAction: "Do not Apply. Reindex the date and review the portal canary before retrying.",
    };
  }
  return {
    category: "Automation safety stop",
    explanation: "The Agent stopped this trip because it could not prove that every required value would be written to the correct portal rows.",
    recommendedAction: "Review the source validation, screenshot, and selected service date before retrying.",
  };
}

exports.explainWellTransFailureAI = functions
  .runWith({ secrets: [runtimeConfigSecret], timeoutSeconds: 30, memory: "256MB" })
  .https.onCall(async (data, context) => {
    await requireAdmin(context);
    const logId = String(data?.logId || "").trim();
    if (!/^[A-Za-z0-9_-]{1,160}$/.test(logId)) {
      throw new functions.https.HttpsError("invalid-argument", "A valid synchronization log ID is required.");
    }
    const snapshot = await admin.firestore().doc(`welltrans_sync_logs/${logId}`).get();
    if (!snapshot.exists) {
      throw new functions.https.HttpsError("not-found", "The synchronization log no longer exists.");
    }
    const log = snapshot.data();
    const safeFailure = String(log.errorMessage || "No detailed worker error was recorded.")
      .replace(/[\r\n\t]+/g, " ")
      .replace(/\s+/g, " ")
      .slice(0, 600);
    const deterministic = classifyWellTransFailure(safeFailure);
    const gemini = getRuntimeConfig().gemini || {};
    if (!gemini.api_key || gemini.enabled !== true) {
      return { ...deterministic, aiEnhanced: false, readOnly: true };
    }

    try {
      const model = String(gemini.model || "gemini-2.5-flash").replace(/[^A-Za-z0-9._-]/g, "");
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          contents: [{
            role: "user",
            parts: [{
              text: [
                "Explain this broker-portal automation failure to an operations administrator.",
                "Do not infer or invent trip facts. Do not suggest changing transportation records.",
                `Deterministic category: ${deterministic.category}`,
                `Sanitized technical failure: ${safeFailure}`,
              ].join("\n"),
            }],
          }],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 300,
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                explanation: { type: "STRING" },
                recommendedAction: { type: "STRING" },
              },
              required: ["explanation", "recommendedAction"],
            },
          },
        },
        {
          params: { key: gemini.api_key },
          timeout: 15_000,
          headers: { "Content-Type": "application/json" },
        },
      );
      const raw = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      const parsed = JSON.parse(raw || "{}");
      if (!parsed.explanation || !parsed.recommendedAction) throw new Error("Gemini returned an incomplete explanation.");
      return {
        category: deterministic.category,
        explanation: String(parsed.explanation).slice(0, 800),
        recommendedAction: String(parsed.recommendedAction).slice(0, 500),
        aiEnhanced: true,
        readOnly: true,
      };
    } catch (error) {
      functions.logger.warn("Gemini WellTrans explanation fell back to deterministic output.", {
        logId,
        error: error.message,
      });
      return { ...deterministic, aiEnhanced: false, readOnly: true };
    }
  });
