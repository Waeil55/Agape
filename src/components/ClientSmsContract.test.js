import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path) => readFileSync(path, 'utf8');

describe('client SMS safety contract', () => {
  it('uses one in-app business conversation and never silently falls back to native SMS', () => {
    const driverPage = read('src/components/DriverPage.jsx');
    const conversation = read('src/components/SmsConversationModal.jsx');
    expect(driverPage).toContain("import SmsConversationModal from './SmsConversationModal'");
    expect(driverPage).not.toContain('sendSMSWithBody');
    expect(driverPage).not.toContain('Opening SMS app instead');
    expect(conversation).toContain("httpsCallable(getFunctions(), 'sendClientSms')");
    expect(conversation).toContain('No personal-SMS fallback was opened.');
    expect(conversation).toContain("onSnapshot(source");
  });

  it('keeps SMS records server-authored and driver reads participant-scoped', () => {
    const rules = read('firestore.rules');
    const functions = read('functions/index.js');
    expect(rules).toMatch(/match \/smsLogs\/\{messageId\}[\s\S]*participantUserIds[\s\S]*allow create, update, delete: if false/);
    expect(rules).toContain('match /smsOptOuts/{conversationId}');
    expect(functions).toContain('async function checkTelnyxSenderReadiness');
    expect(functions).toContain("exports.sendClientSms = functions");
    expect(functions).toContain("exports.markClientSmsRead = functions");
    expect(functions).not.toContain('telnyx.from || "+18552223330"');
  });
});
