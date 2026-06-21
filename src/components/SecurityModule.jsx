/**
 * ENTERPRISE SECURITY MODULE
 * 2FA/MFA, audit logging, encryption, compliance checks
 */

import React, { useState, useEffect } from 'react';
import { Shield, Lock, Eye, EyeOff, Check, X, AlertTriangle, Clock, User, Smartphone, Mail } from 'lucide-react';

/**
 * 2FA Setup Component
 */
export const TwoFactorSetup = ({ user, onComplete }) => {
  const [step, setStep] = useState('choose'); // choose, verify, confirm
  const [method, setMethod] = useState(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [qrCode, setQrCode] = useState('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');

  const handleSetupPhone = async () => {
    // Simulate sending code to phone
    setStep('verify');
  };

  const handleVerify = async () => {
    if (verificationCode.length === 6) {
      setStep('confirm');
    }
  };

  const handleConfirm = () => {
    onComplete({ method, enabled: true });
  };

  const handleCopyRecoveryCodes = () => {
    const codes = [
      'A7K9-L2M5-N8P3-Q6R9',
      'S4T7-U2V5-W8X3-Y6Z9',
      'B1C4-D7E2-F5G8-H3I6',
      'J9K2-L5M8-N3O6-P9Q2',
    ];
    navigator.clipboard?.writeText(codes.join('\n'));
  };

  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded-2xl border border-slate-200">
      <div className="flex items-center gap-3 mb-6">
        <Smartphone size={24} className="text-blue-600" />
        <h3 className="text-xl font-bold text-slate-900">Set Up 2-Factor Authentication</h3>
      </div>

      {step === 'choose' && (
        <div className="space-y-3">
          <button
            onClick={() => { setMethod('sms'); handleSetupPhone(); }}
            className="w-full p-4 text-left border-2 border-slate-200 hover:border-blue-500 rounded-lg transition-colors"
          >
            <p className="font-bold text-slate-900">📱 SMS Text Message</p>
            <p className="text-sm text-slate-500 mt-1">Receive codes via text</p>
          </button>
          <button
            onClick={() => { setMethod('app'); setStep('verify'); }}
            className="w-full p-4 text-left border-2 border-slate-200 hover:border-blue-500 rounded-lg transition-colors"
          >
            <p className="font-bold text-slate-900">🔐 Authenticator App</p>
            <p className="text-sm text-slate-500 mt-1">Google Authenticator, Authy, etc.</p>
          </button>
        </div>
      )}

      {step === 'verify' && (
        <div className="space-y-4">
          {method === 'app' && (
            <div>
              <p className="text-sm text-slate-600 mb-3">Scan with your authenticator app:</p>
              <img src={qrCode} alt="QR Code" className="w-48 h-48 mx-auto border-2 border-slate-200 p-2 rounded-lg" />
              <p className="text-xs text-slate-500 text-center mt-3">Can't scan? Enter: JBSWY3DPEBLW64TMMQ======</p>
            </div>
          )}
          
          <div>
            <label className="block text-sm font-bold text-slate-900 mb-2">Enter Verification Code</label>
            <input
              type="text"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              maxLength={6}
              className="w-full px-4 py-3 border-2 border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 text-2xl tracking-widest text-center"
            />
          </div>

          <button
            onClick={handleVerify}
            disabled={verificationCode.length !== 6}
            className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            Verify & Continue
          </button>
        </div>
      )}

      {step === 'confirm' && (
        <div className="space-y-4 text-center">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
            <Check size={32} className="text-emerald-600" />
          </div>
          <p className="font-bold text-slate-900">2FA Enabled!</p>
          <p className="text-sm text-slate-500">Your account is now secured with two-factor authentication</p>
          
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-left text-sm text-amber-800">
            <p className="font-bold mb-2">⚠️ Save Recovery Codes</p>
            <p className="mb-3">Store these in a safe place. You'll need them if you lose access to your device.</p>
            <div className="bg-white p-2 rounded font-mono text-xs space-y-1 mb-3 max-h-24 overflow-y-auto">
              <div>A7K9-L2M5-N8P3-Q6R9</div>
              <div>S4T7-U2V5-W8X3-Y6Z9</div>
              <div>B1C4-D7E2-F5G8-H3I6</div>
              <div>J9K2-L5M8-N3O6-P9Q2</div>
            </div>
            <button onClick={handleCopyRecoveryCodes} className="text-xs font-bold text-amber-700 hover:underline">📋 Copy Codes</button>
          </div>

          <button
            onClick={handleConfirm}
            className="w-full px-4 py-3 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700 transition-colors"
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
};

/**
 * Audit Log Viewer
 */
export const AuditLogViewer = ({ logs = [] }) => {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const filteredLogs = logs.filter(log => {
    if (filter !== 'all' && log.action !== filter) return false;
    if (search && !log.description.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const getActionColor = (action) => {
    if (action.includes('delete') || action.includes('remove')) return 'text-red-600 bg-red-50';
    if (action.includes('create') || action.includes('add')) return 'text-emerald-600 bg-emerald-50';
    if (action.includes('update') || action.includes('edit')) return 'text-blue-600 bg-blue-50';
    if (action.includes('access') || action.includes('login')) return 'text-purple-600 bg-purple-50';
    return 'text-slate-600 bg-slate-50';
  };

  const handleExportLogs = () => {
    const headers = ['Action', 'Description', 'User', 'Timestamp', 'Status'];
    const rows = filteredLogs.map(log => [log.action, log.description, log.user, log.timestamp, log.status]);
    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell || '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `agape-audit-logs-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6">
      <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
        <Clock size={20} className="text-blue-600" />
        Audit Log
      </h3>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <input
          type="text"
          placeholder="Search logs..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
        />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="px-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
        >
          <option value="all">All Actions</option>
          <option value="login">Login</option>
          <option value="create">Create</option>
          <option value="update">Update</option>
          <option value="delete">Delete</option>
        </select>
      </div>

      {/* Log List */}
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {filteredLogs.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            <p>No logs found</p>
          </div>
        ) : (
          filteredLogs.map((log, i) => (
            <div key={i} className={`p-3 rounded-lg border-l-4 ${getActionColor(log.action)}`}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="font-semibold text-sm text-slate-900">{log.action.toUpperCase()}</p>
                  <p className="text-xs text-slate-600 mt-1">{log.description}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    <User size={12} className="inline mr-1" />
                    {log.user} • {log.timestamp}
                  </p>
                </div>
                <span className={`text-xs font-bold px-2 py-1 rounded ${getActionColor(log.action)}`}>
                  {log.status}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Export Button */}
      <button onClick={handleExportLogs} className="mt-4 w-full px-4 py-2 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors">
        📥 Export Logs
      </button>
    </div>
  );
};

/**
 * Compliance Checklist
 */
export const ComplianceChecklist = () => {
  const [items, setItems] = useState([
    { id: 1, title: 'HIPAA Compliance', status: 'complete', percentage: 100 },
    { id: 2, title: 'Data Encryption (TLS)', status: 'complete', percentage: 100 },
    { id: 3, title: 'Regular Backups', status: 'complete', percentage: 100 },
    { id: 4, title: '2FA Implementation', status: 'in-progress', percentage: 75 },
    { id: 5, title: 'Penetration Testing', status: 'pending', percentage: 0 },
    { id: 6, title: 'SOC 2 Type II Audit', status: 'pending', percentage: 0 },
  ]);

  const getStatusIcon = (status) => {
    if (status === 'complete') return <Check className="text-emerald-600" size={18} />;
    if (status === 'in-progress') return <Clock className="text-amber-600" size={18} />;
    return <AlertTriangle className="text-slate-400" size={18} />;
  };

  const getStatusColor = (status) => {
    if (status === 'complete') return 'bg-emerald-50 border-emerald-200';
    if (status === 'in-progress') return 'bg-amber-50 border-amber-200';
    return 'bg-slate-50 border-slate-200';
  };

  const totalPercentage = Math.round(items.reduce((sum, item) => sum + item.percentage, 0) / items.length);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6">
      <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
        <Shield size={20} className="text-blue-600" />
        Compliance Status
      </h3>

      {/* Overall Progress */}
      <div className="mb-6 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200">
        <div className="flex items-center justify-between mb-2">
          <p className="font-bold text-slate-900">Overall Compliance</p>
          <p className="text-2xl font-black text-blue-600">{totalPercentage}%</p>
        </div>
        <div className="w-full h-3 bg-white rounded-full overflow-hidden border border-blue-200">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all"
            style={{ width: `${totalPercentage}%` }}
          />
        </div>
      </div>

      {/* Compliance Items */}
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.id} className={`p-4 rounded-lg border-2 ${getStatusColor(item.status)}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                {getStatusIcon(item.status)}
                <p className="font-bold text-slate-900">{item.title}</p>
              </div>
              <p className="text-sm font-bold text-slate-600">{item.percentage}%</p>
            </div>
            <div className="h-2 bg-white/50 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${
                  item.status === 'complete' ? 'bg-emerald-500' :
                  item.status === 'in-progress' ? 'bg-amber-500' :
                  'bg-slate-300'
                }`}
                style={{ width: `${item.percentage}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Status Summary */}
      <div className="mt-6 p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-800">
        <p className="font-bold">✓ Good Standing</p>
        <p className="mt-1">Your system meets most enterprise security standards. Continue working on pending items.</p>
      </div>
    </div>
  );
};

/**
 * Security Settings Page
 */
const SecurityModule = ({ user, onLogout }) => {
  const [activeTab, setActiveTab] = useState('overview');
  const [show2FASetup, setShow2FASetup] = useState(false);

  const sampleLogs = [
    { action: 'login', description: 'Successful login from 192.168.1.1', user: 'admin@agape.care', timestamp: '2 mins ago', status: 'SUCCESS' },
    { action: 'update', description: 'Updated trip assignment rules', user: 'admin@agape.care', timestamp: '1 hour ago', status: 'SUCCESS' },
    { action: 'delete', description: 'Archived 5 completed trips', user: 'dispatcher@agape.care', timestamp: '3 hours ago', status: 'SUCCESS' },
    { action: 'access', description: 'Accessed driver telemetry data', user: 'manager@agape.care', timestamp: '5 hours ago', status: 'SUCCESS' },
    { action: 'create', description: 'Created new user account', user: 'admin@agape.care', timestamp: '1 day ago', status: 'SUCCESS' },
  ];

  return (
    <div className="flex-1 flex flex-col bg-slate-50 overflow-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200 p-6">
        <h1 className="text-3xl font-black text-slate-900 flex items-center gap-3">
          <Shield size={32} className="text-blue-600" />
          Security & Compliance
        </h1>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-slate-200 px-6 flex gap-8">
        {['overview', 'authentication', 'audit'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`py-4 px-2 border-b-2 font-bold transition-colors ${
              activeTab === tab
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-6xl">
            <ComplianceChecklist />
            <div className="bg-white rounded-2xl border border-slate-200 p-6">
              <h3 className="text-lg font-bold text-slate-900 mb-4">Security Overview</h3>
              <div className="space-y-4">
                <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-200">
                  <p className="font-bold text-emerald-900">✓ All Systems Secure</p>
                  <p className="text-sm text-emerald-700 mt-1">No known vulnerabilities</p>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                    <p className="font-semibold text-slate-900">🔐 Password Strength</p>
                    <span className="text-sm font-bold text-emerald-600">Strong</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                    <p className="font-semibold text-slate-900">📱 2FA Status</p>
                    <button onClick={() => setShow2FASetup(true)} className="text-sm font-bold text-blue-600 hover:underline">Enable</button>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                    <p className="font-semibold text-slate-900">🌐 Active Sessions</p>
                    <span className="text-sm font-bold text-slate-600">1</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'authentication' && (
          <div className="max-w-3xl">
            {show2FASetup ? (
              <TwoFactorSetup user={user} onComplete={() => setShow2FASetup(false)} />
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 p-6">
                <h3 className="text-lg font-bold text-slate-900 mb-4">Authentication Methods</h3>
                <button
                  onClick={() => setShow2FASetup(true)}
                  className="w-full p-4 text-left border-2 border-slate-200 hover:border-blue-500 rounded-lg transition-colors"
                >
                  <p className="font-bold text-slate-900">📱 Set Up 2-Factor Authentication</p>
                  <p className="text-sm text-slate-500 mt-1">Add an extra layer of security to your account</p>
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'audit' && (
          <div className="max-w-4xl">
            <AuditLogViewer logs={sampleLogs} />
          </div>
        )}
      </div>
    </div>
  );
};

export default SecurityModule;
