const RULES = [
  { id: 'portal_contract', pattern: /contract|column|selector|grid/i, severity: 'critical', action: 'Stop writes and re-index the portal contract.' },
  { id: 'exact_match', pattern: /booking|pickup row|dropoff row|ambiguous/i, severity: 'critical', action: 'Block the trip; require exact Booking ID and one row per activity.' },
  { id: 'session', pattern: /browser|session|closed|disconnected/i, severity: 'high', action: 'Preserve evidence and start a clean isolated session.' },
  { id: 'editor', pattern: /editor|dropdown|field|option/i, severity: 'high', action: 'Re-index the exact cell editor and retry only after rollback proof.' },
  { id: 'source', pattern: /source|fingerprint|changed/i, severity: 'high', action: 'Reload authoritative Agape data and rebuild the trip.' },
];

export function analyzeLocally(error, context = {}) {
  const message = String(error?.message || error || 'Unknown Agent failure');
  const matched = RULES.find(rule => rule.pattern.test(message)) || {
    id: 'unclassified', severity: 'medium', action: 'Retain evidence and require deterministic review.',
  };
  return Object.freeze({
    engine: 'agape_local_rules_v1', networkUsed: false, modelAuthority: 'diagnostic_only',
    category: matched.id, severity: matched.severity, recommendedAction: matched.action,
    bookingId: context.bookingId || null, serviceDate: context.serviceDate || null,
    message: message.slice(0, 500),
  });
}
