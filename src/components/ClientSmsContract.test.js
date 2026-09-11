import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path) => readFileSync(path, 'utf8');

describe('client SMS safety contract', () => {
  it('keeps driver quick messages in the native phone composer without Telnyx history', () => {
    const driverPage = read('src/components/DriverPage.jsx');
    const driverQuickSms = read('src/components/DriverQuickSmsSheet.jsx');
    const conversation = read('src/components/SmsConversationModal.jsx');

    expect(driverPage).toContain("import DriverQuickSmsSheet from './DriverQuickSmsSheet'");
    expect(driverPage).not.toContain("import SmsConversationModal from './SmsConversationModal'");
    expect(driverPage).not.toContain('clientSmsUnreadFor');
    expect(driverQuickSms).toContain('sendSMSWithBody(phone, body');
    expect(driverQuickSms).toContain("Messages open in your phone's Messages app");
    expect(driverQuickSms).toContain('openClientContactCard(clientName, phone)');
    expect(driverQuickSms).toContain('Save client contact first');
    expect(driverQuickSms).not.toContain('smsLogs');
    expect(driverQuickSms).not.toContain('sendClientSms');
    expect(conversation).toContain("httpsCallable(getFunctions(), 'sendClientSms')");
    expect(conversation).toContain("['admin', 'dispatcher'].includes");
    expect(conversation).toContain('if (!canUseBusinessSms) return null;');
  });

  it('allows only admins and dispatchers to use or read Telnyx records', () => {
    const rules = read('firestore.rules');
    const functions = read('functions/index.js');
    const conversation = read('src/components/SmsConversationModal.jsx');
    const bulkModal = read('src/components/SendSmsModal.jsx');
    const smsRules = rules.match(/match \/smsLogs\/\{messageId\} \{([\s\S]*?)\n {4}\}/)?.[1] || '';

    expect(smsRules).toContain('allow read: if signedIn() && isDispatcher();');
    expect(smsRules).not.toContain('participantUserIds');
    expect(smsRules).toContain('allow create, update, delete: if false;');
    expect(rules).toContain('match /smsOptOuts/{conversationId}');
    expect(functions).toContain('async function checkTelnyxSenderReadiness');
    expect(functions).toContain("verificationStatuses.includes('waiting for customer')");
    expect(functions).toContain("Unexpected business SMS failure.");
    expect(functions).toContain("exports.sendClientSms = functions");
    expect(functions).toContain("exports.markClientSmsRead = functions");
    expect(functions).toContain('const actor = await requireAdminOrDispatcher(context);');
    expect(functions).toContain('const AGAPE_BUSINESS_SMS_NUMBER = "+18552223330";');
    expect(conversation).not.toContain('No personal-SMS fallback was opened.');
    expect(conversation).toContain('Retry same message');
    expect(bulkModal).toContain('Retry ${retryMessages.length} safely');
    expect(bulkModal).toContain('setRetryMessages(messages)');
    expect(functions).not.toContain("requireRole(context, ['admin', 'dispatcher', 'driver'])");
  });
});
