const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateSmsRequestState } = require('./smsRequestState');

const request = { to: '+13175550100', tripId: 'trip-1', text: 'Hello' };

test('new SMS requests reserve one provider attempt', () => {
  assert.deepEqual(evaluateSmsRequestState(null, request), { action: 'reserve' });
});

test('accepted retries return the original provider result without resending', () => {
  assert.deepEqual(evaluateSmsRequestState({
    ...request,
    status: 'accepted',
    messageId: 'message-1',
    providerStatus: 'queued',
  }, request), {
    action: 'accepted',
    messageId: 'message-1',
    providerStatus: 'queued',
  });
});

test('failed requests can retry while processing and untracked requests cannot', () => {
  assert.equal(evaluateSmsRequestState({ ...request, status: 'failed' }, request).action, 'retry');
  assert.equal(evaluateSmsRequestState({ ...request, status: 'processing' }, request).action, 'processing');
  assert.equal(evaluateSmsRequestState({ ...request, status: 'provider_accepted_untracked' }, request).action, 'untracked');
});

test('a request ID cannot be reused with different recipient or content', () => {
  assert.equal(evaluateSmsRequestState({ ...request, status: 'failed' }, { ...request, text: 'Different' }).action, 'content_mismatch');
  assert.equal(evaluateSmsRequestState({ ...request, status: 'failed' }, { ...request, to: '+13175550101' }).action, 'content_mismatch');
});
