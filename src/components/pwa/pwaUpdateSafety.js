const ACTIVE_TRIP_PREFIX = 'agape_drvActiveTrip_';
const CHAT_DRAFT_PREFIX = 'agape_chat_draft_';
const CHAT_OUTBOX_KEY = 'agape_chat_outbox';

const isVerifiedCount = (value) => Number.isInteger(value) && value >= 0;

const pluralize = (count, singular, plural = `${singular}s`) => (
  count === 1 ? singular : plural
);

const inspectPersistedWork = (storage) => {
  const findings = {
    activeTrip: false,
    chatDraft: false,
    chatOutboxCount: 0,
    chatOutboxInvalid: false,
  };

  if (!storage || typeof storage.getItem !== 'function' || typeof storage.key !== 'function') {
    throw new Error('storage_unavailable');
  }

  const keyCount = Number(storage.length);
  if (!Number.isInteger(keyCount) || keyCount < 0) throw new Error('storage_unavailable');

  for (let index = 0; index < keyCount; index += 1) {
    const key = storage.key(index);
    if (typeof key !== 'string') continue;
    const value = storage.getItem(key);
    if (key.startsWith(ACTIVE_TRIP_PREFIX) && String(value || '').trim()) {
      findings.activeTrip = true;
    }
    if (key.startsWith(CHAT_DRAFT_PREFIX) && String(value || '').trim()) {
      findings.chatDraft = true;
    }
  }

  const outboxValue = storage.getItem(CHAT_OUTBOX_KEY);
  if (String(outboxValue || '').trim()) {
    try {
      const parsedOutbox = JSON.parse(outboxValue);
      if (!Array.isArray(parsedOutbox)) {
        findings.chatOutboxInvalid = true;
      } else {
        findings.chatOutboxCount = parsedOutbox.length;
      }
    } catch {
      findings.chatOutboxInvalid = true;
    }
  }

  return findings;
};

export const getUnsafeUpdateReasons = ({ queueStatus, storage }) => {
  const reasons = [];
  const queueIsUnavailable = !queueStatus
    || queueStatus.state === 'blocked'
    || queueStatus.state === 'unavailable'
    || !isVerifiedCount(queueStatus.pending)
    || !isVerifiedCount(queueStatus.deadLetter);

  if (queueIsUnavailable) {
    reasons.push('Local sync status could not be verified for this signed-in account.');
  } else {
    if (queueStatus.pending > 0) {
      reasons.push(`${queueStatus.pending} saved ${pluralize(queueStatus.pending, 'change')} ${queueStatus.pending === 1 ? 'is' : 'are'} still waiting to sync.`);
    }
    if (queueStatus.deadLetter > 0) {
      reasons.push(`${queueStatus.deadLetter} saved ${pluralize(queueStatus.deadLetter, 'change')} ${queueStatus.deadLetter === 1 ? 'needs' : 'need'} attention before restarting.`);
    }
  }

  try {
    const persistedWork = inspectPersistedWork(storage);
    if (persistedWork.activeTrip) {
      reasons.push('An active trip is open on this device. Finish or close it before restarting.');
    }
    if (persistedWork.chatDraft) {
      reasons.push('An unsent message draft is saved on this device. Send or clear it before restarting.');
    }
    if (persistedWork.chatOutboxInvalid) {
      reasons.push('Saved chat work could not be verified. Open Chat and review the outbox before restarting.');
    } else if (persistedWork.chatOutboxCount > 0) {
      reasons.push(`${persistedWork.chatOutboxCount} chat ${pluralize(persistedWork.chatOutboxCount, 'message')} ${persistedWork.chatOutboxCount === 1 ? 'is' : 'are'} waiting to send.`);
    }
  } catch {
    reasons.push('Local draft and active-trip state could not be verified on this device.');
  }

  return [...new Set(reasons)];
};
