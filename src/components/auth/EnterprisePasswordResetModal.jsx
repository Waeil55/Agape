import { useState, useId, useEffect } from 'react';
import {
  KeyRound,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  ArrowRight,
  Mail,
  User,
  X,
  Sparkles,
} from 'lucide-react';
import { auth, functions, httpsCallable, sendPasswordResetEmail } from '../../config/firebase';
import {
  validatePasswordStrength,
  resolveEnterpriseIdentifier,
  translateAuthError,
  TEMPORARY_AUTHORIZED_PASSWORD,
} from '../../utils/enterpriseAuth';

export default function EnterprisePasswordResetModal({
  isOpen,
  onClose,
  initialIdentifier = '',
  onPasswordResetSuccess,
}) {
  const [step, setStep] = useState('identify'); // 'identify' | 'email_sent' | 'set_new_password' | 'success'
  const [identifier, setIdentifier] = useState(initialIdentifier || '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [emailCooldown, setEmailCooldown] = useState(0);

  const titleId = useId();

  useEffect(() => {
    if (initialIdentifier) {
      setIdentifier(initialIdentifier);
    }
  }, [initialIdentifier]);

  useEffect(() => {
    if (emailCooldown <= 0) return;
    const timer = setInterval(() => {
      setEmailCooldown((c) => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [emailCooldown]);

  if (!isOpen) return null;

  const resolved = resolveEnterpriseIdentifier(identifier);
  const strength = validatePasswordStrength(newPassword);
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;

  const handleIdentifySubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!identifier.trim()) {
      setError('Please enter your username or corporate email.');
      return;
    }

    // If it's a real email address, send standard password reset email
    if (resolved.isEmail) {
      setLoading(true);
      try {
        await sendPasswordResetEmail(auth, resolved.authEmail);
        setStep('email_sent');
        setEmailCooldown(60);
      } catch (err) {
        setError(translateAuthError(err));
      } finally {
        setLoading(false);
      }
    } else {
      // For username accounts, transition to self-service password update
      setStep('set_new_password');
    }
  };

  const handleDirectPasswordReset = async (e) => {
    e.preventDefault();
    setError('');

    if (!strength.isValid) {
      setError('Password does not meet enterprise complexity requirements.');
      return;
    }

    if (!passwordsMatch) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const resetFn = httpsCallable(functions, 'enterpriseResetPassword');
      await resetFn({
        identifier: resolved.username || identifier.trim(),
        newPassword,
      });

      setStep('success');
      if (typeof onPasswordResetSuccess === 'function') {
        onPasswordResetSuccess(identifier.trim(), newPassword);
      }
    } catch (err) {
      // If Cloud Function is still initializing or unavailable, translate error gracefully
      setError(translateAuthError(err) || 'Password reset request could not be processed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleUseTemporaryPassword = () => {
    setNewPassword(TEMPORARY_AUTHORIZED_PASSWORD);
    setConfirmPassword(TEMPORARY_AUTHORIZED_PASSWORD);
    setError('');
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
    >
      <div className="relative w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-2xl">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close recovery dialog"
          className="absolute top-5 right-5 p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
        >
          <X size={18} />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3.5 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center shrink-0">
            <KeyRound size={24} />
          </div>
          <div>
            <h3 id={titleId} className="text-xl font-bold text-slate-900 leading-tight">
              Enterprise Password Recovery
            </h3>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-0.5">
              Secure Self-Service Identity Portal
            </p>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div
            role="alert"
            className="mb-5 p-3.5 rounded-xl border border-rose-200 bg-rose-50 flex items-start gap-2.5"
          >
            <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
            <p className="text-xs font-bold text-rose-700">{error}</p>
          </div>
        )}

        {/* STEP 1: IDENTIFY */}
        {step === 'identify' && (
          <form onSubmit={handleIdentifySubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5 ml-1">
                Account Username or Email
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  autoFocus
                  autoComplete="username"
                  placeholder="e.g. waeil.admin or you@agapecare.com"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-slate-50 rounded-xl font-semibold border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white transition outline-none text-sm"
                />
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  {identifier.includes('@') ? <Mail size={18} /> : <User size={18} />}
                </div>
              </div>
              <p className="text-[11px] font-medium text-slate-500 mt-1.5 ml-1">
                Enter your system username (e.g. <span className="font-bold">waeil</span> or <span className="font-bold">waeil.admin</span>) or corporate email address.
              </p>
            </div>

            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:text-slate-900 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !identifier.trim()}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold transition shadow-sm cursor-pointer"
              >
                {loading ? 'Verifying…' : 'Continue'}
                <ArrowRight size={14} />
              </button>
            </div>
          </form>
        )}

        {/* STEP: EMAIL SENT */}
        {step === 'email_sent' && (
          <div className="text-center py-4 space-y-4">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center">
              <Mail size={28} />
            </div>
            <div>
              <h4 className="text-lg font-bold text-slate-900">Reset Instructions Dispatched</h4>
              <p className="text-sm font-medium text-slate-600 mt-1 max-w-sm mx-auto">
                We sent a secure password reset link to{' '}
                <span className="font-bold text-slate-900">{resolved.authEmail}</span>.
              </p>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs font-medium text-slate-600 text-left">
              Follow the instructions in the email to set a new password, then return to log in.
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                disabled={emailCooldown > 0 || loading}
                onClick={handleIdentifySubmit}
                className="px-4 py-2 text-xs font-bold text-blue-600 hover:text-blue-700 disabled:text-slate-400 transition"
              >
                {emailCooldown > 0 ? `Resend email in ${emailCooldown}s` : 'Resend Email'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition"
              >
                Done
              </button>
            </div>
          </div>
        )}

        {/* STEP: SET NEW PASSWORD */}
        {step === 'set_new_password' && (
          <form onSubmit={handleDirectPasswordReset} className="space-y-4">
            <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-100 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider block">Target Identity</span>
                <span className="text-sm font-bold text-slate-900">{identifier}</span>
              </div>
              <button
                type="button"
                onClick={() => setStep('identify')}
                className="text-xs font-bold text-blue-600 hover:underline"
              >
                Change
              </button>
            </div>

            {/* Quick Fill Temporary Migration Password */}
            <div className="flex items-center justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-200/80">
              <span className="text-xs font-semibold text-slate-600">Quick set temporary passcode:</span>
              <button
                type="button"
                onClick={handleUseTemporaryPassword}
                className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-slate-200 hover:border-blue-400 text-blue-700 rounded-lg text-xs font-bold shadow-2xs transition active:scale-95"
              >
                <Sparkles size={13} className="text-amber-500" />
                Use 123412341234
              </button>
            </div>

            {/* New Password Input */}
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5 ml-1">
                New Enterprise Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoFocus
                  autoComplete="new-password"
                  placeholder="At least 8 characters…"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full pl-4 pr-11 py-3 bg-slate-50 rounded-xl font-semibold border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white transition outline-none text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 transition"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Strength Meter Bar */}
            {newPassword.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="text-slate-500">Security Score:</span>
                  <span
                    className={
                      strength.color === 'emerald'
                        ? 'text-emerald-600'
                        : strength.color === 'blue'
                        ? 'text-blue-600'
                        : strength.color === 'amber'
                        ? 'text-amber-600'
                        : 'text-rose-600'
                    }
                  >
                    {strength.label}
                  </span>
                </div>
                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden flex gap-1">
                  <div
                    className={`h-full transition-all duration-300 rounded-full ${
                      strength.color === 'emerald'
                        ? 'bg-emerald-500'
                        : strength.color === 'blue'
                        ? 'bg-blue-500'
                        : strength.color === 'amber'
                        ? 'bg-amber-500'
                        : 'bg-rose-500'
                    }`}
                    style={{ width: `${strength.percent}%` }}
                  />
                </div>
              </div>
            )}

            {/* Requirements Checklist */}
            <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200/60 space-y-1.5 text-xs font-semibold">
              {[
                { label: '8 or more characters', valid: strength.requirements.minLength },
                { label: 'Uppercase & lowercase letters', valid: strength.requirements.mixedCase },
                { label: 'Number or special character', valid: strength.requirements.numberOrSymbol },
                { label: 'Not a common weak pattern (or authorized temporary key)', valid: strength.requirements.notTrivial },
              ].map(({ label, valid }) => (
                <div key={label} className="flex items-center gap-2">
                  <CheckCircle2
                    size={14}
                    className={valid ? 'text-emerald-600 shrink-0' : 'text-slate-300 shrink-0'}
                  />
                  <span className={valid ? 'text-slate-800' : 'text-slate-400'}>{label}</span>
                </div>
              ))}
            </div>

            {/* Confirm Password Input */}
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5 ml-1">
                Confirm New Password
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  placeholder="Re-enter new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full pl-4 pr-11 py-3 bg-slate-50 rounded-xl font-semibold border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white transition outline-none text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 transition"
                >
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {confirmPassword.length > 0 && (
                <p
                  className={`text-[11px] font-bold mt-1 ml-1 flex items-center gap-1 ${
                    passwordsMatch ? 'text-emerald-600' : 'text-rose-600'
                  }`}
                >
                  {passwordsMatch ? '✓ Passwords match' : '✗ Passwords do not match'}
                </p>
              )}
            </div>

            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:text-slate-900 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !strength.isValid || !passwordsMatch}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold transition shadow-sm cursor-pointer"
              >
                {loading ? 'Securing…' : 'Save & Secure Account'}
                <ShieldCheck size={16} />
              </button>
            </div>
          </form>
        )}

        {/* STEP: SUCCESS */}
        {step === 'success' && (
          <div className="text-center py-6 space-y-4">
            <div className="w-16 h-16 mx-auto rounded-3xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 size={36} />
            </div>
            <div>
              <h4 className="text-xl font-bold text-slate-900">Password Updated</h4>
              <p className="text-sm font-medium text-slate-600 mt-1 max-w-sm mx-auto">
                Your credentials have been securely updated in the Agape Care identity authority.
              </p>
            </div>
            <div className="pt-3">
              <button
                type="button"
                onClick={onClose}
                className="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold transition shadow-sm cursor-pointer"
              >
                Return to Sign In
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
