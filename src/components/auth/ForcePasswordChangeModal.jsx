import { useState, useId } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  LogOut,
  Lock,
} from 'lucide-react';
import { functions, httpsCallable } from '../../config/firebase';
import {
  validatePasswordStrength,
  translateAuthError,
  TEMPORARY_AUTHORIZED_PASSWORD,
} from '../../utils/enterpriseAuth';

export default function ForcePasswordChangeModal({
  user, // { uid, email, username, role }
  onComplete,
  onSignOut,
}) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const titleId = useId();

  const strength = validatePasswordStrength(newPassword);
  const isTemporaryKey = newPassword === TEMPORARY_AUTHORIZED_PASSWORD;
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;
  const isEligible = strength.isValid && !isTemporaryKey && passwordsMatch;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (isTemporaryKey) {
      setError('You must choose a new secure password. You cannot keep the temporary password.');
      return;
    }

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
      const identifier = user?.username || user?.email || '';
      await resetFn({
        identifier,
        newPassword,
        isFirstTimeSetup: true,
      });

      if (typeof onComplete === 'function') {
        onComplete(newPassword);
      }
    } catch (err) {
      setError(translateAuthError(err) || 'Failed to update password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto"
    >
      <div className="relative w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-2xl my-auto">
        {/* Header Icon */}
        <div className="flex items-center gap-3.5 mb-5">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center shrink-0 shadow-xs">
            <ShieldAlert size={26} />
          </div>
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-100/80 text-amber-800 text-[10px] font-extrabold uppercase tracking-wider mb-0.5">
              <Lock size={11} /> First-Time Setup Required
            </div>
            <h3 id={titleId} className="text-xl font-bold text-slate-900 leading-tight">
              Create Your New Password
            </h3>
            <p className="text-xs font-semibold text-slate-500 mt-0.5">
              Account: <span className="text-slate-800 font-bold">{user?.username || user?.email}</span> ({user?.role || 'team'})
            </p>
          </div>
        </div>

        <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 mb-5 text-xs font-medium text-slate-600 leading-relaxed">
          An administrator assigned a temporary password to your account. To protect company data and ensure account security, please create a new permanent password now.
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

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* New Password Input */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 ml-1">
              New Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                autoFocus
                autoComplete="new-password"
                placeholder="Enter 8+ characters…"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full pl-4 pr-11 py-3 bg-slate-50 rounded-xl font-semibold border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white transition outline-none text-base"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 transition cursor-pointer"
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
                    isTemporaryKey
                      ? 'text-amber-600'
                      : strength.color === 'emerald'
                      ? 'text-emerald-600'
                      : strength.color === 'blue'
                      ? 'text-blue-600'
                      : strength.color === 'amber'
                      ? 'text-amber-600'
                      : 'text-rose-600'
                  }
                >
                  {isTemporaryKey ? 'Temporary (Must Change)' : strength.label}
                </span>
              </div>
              <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden flex gap-1">
                <div
                  className={`h-full transition-all duration-300 rounded-full ${
                    isTemporaryKey
                      ? 'bg-amber-400'
                      : strength.color === 'emerald'
                      ? 'bg-emerald-500'
                      : strength.color === 'blue'
                      ? 'bg-blue-500'
                      : strength.color === 'amber'
                      ? 'bg-amber-500'
                      : 'bg-rose-500'
                  }`}
                  style={{ width: isTemporaryKey ? '40%' : `${strength.percent}%` }}
                />
              </div>
              {isTemporaryKey && (
                <p className="text-[11px] font-bold text-amber-700">
                  ⚠️ You cannot keep the temporary passcode. Please type your personal password.
                </p>
              )}
            </div>
          )}

          {/* Requirements Checklist */}
          <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200/60 space-y-1.5 text-xs font-semibold">
            {[
              { label: '8 or more characters', valid: strength.requirements.minLength },
              { label: 'Uppercase & lowercase letters', valid: strength.requirements.mixedCase },
              { label: 'Number or special character', valid: strength.requirements.numberOrSymbol },
              { label: 'Different from temporary passcode', valid: newPassword.length > 0 && !isTemporaryKey },
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
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 ml-1">
              Confirm New Password
            </label>
            <div className="relative">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                required
                autoComplete="new-password"
                placeholder="Re-enter your new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full pl-4 pr-11 py-3 bg-slate-50 rounded-xl font-semibold border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white transition outline-none text-base"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 transition cursor-pointer"
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

          <div className="pt-2 flex items-center justify-between gap-3">
            {typeof onSignOut === 'function' ? (
              <button
                type="button"
                onClick={onSignOut}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-500 hover:text-slate-800 transition cursor-pointer"
              >
                <LogOut size={14} />
                Sign Out
              </button>
            ) : <div />}

            <button
              type="submit"
              disabled={loading || !isEligible}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold transition shadow-sm cursor-pointer"
            >
              {loading ? 'Updating Password…' : 'Set Password & Enter Portal'}
              <ShieldCheck size={16} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
