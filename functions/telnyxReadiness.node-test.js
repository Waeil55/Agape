'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { parseTollFreeVerification } = require('./telnyxReadiness');

test('parses Telnyx toll-free snake_case status, request id, and required customer action', () => {
  const parsed = parseTollFreeVerification({
    data: {
      records: [{
        id: 'request-1',
        verification_status: 'Waiting For Customer',
        business_name: 'AGAPE CARE',
        reason: 'Official domain email and consent screenshot required. ',
        phone_numbers: [{ phone_number: '+18552223330' }],
      }],
    },
  }, '+18552223330');

  assert.deepEqual(parsed, {
    id: 'request-1',
    status: 'Waiting For Customer',
    normalizedStatus: 'waiting for customer',
    reason: 'Official domain email and consent screenshot required.',
    businessName: 'AGAPE CARE',
  });
});

test('does not select a verification belonging to another phone number', () => {
  const parsed = parseTollFreeVerification({
    data: {
      records: [{
        id: 'other-request',
        verification_status: 'Verified',
        phone_numbers: [{ phone_number: '+18005550100' }],
      }],
    },
  }, '+18552223330');

  assert.equal(parsed, null);
});
