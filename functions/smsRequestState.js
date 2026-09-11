function evaluateSmsRequestState(existing, request) {
  if (!existing) return { action: 'reserve' };
  const sameRequest = existing.to === request.to
    && existing.tripId === request.tripId
    && existing.text === request.text;
  if (!sameRequest) return { action: 'content_mismatch' };
  if (existing.status === 'accepted') {
    return {
      action: 'accepted',
      messageId: existing.messageId || '',
      providerStatus: existing.providerStatus || 'queued',
    };
  }
  if (existing.status === 'provider_accepted_untracked') return { action: 'untracked' };
  if (existing.status === 'failed') return { action: 'retry' };
  return { action: 'processing' };
}

module.exports = { evaluateSmsRequestState };
