import React, { useState, useEffect, useCallback } from 'react';
import { Download, X, Smartphone, Shield, Zap, Wifi } from 'lucide-react';

const PWAInstallPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem('agape_pwa_install_dismissed');
    if (dismissed) {
      const dismissedTime = parseInt(dismissed, 10);
      if (Date.now() - dismissedTime < 7 * 24 * 60 * 60 * 1000) {
        setIsDismissed(true);
        return;
      }
    }

    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setTimeout(() => setShowPrompt(true), 2000);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    if (window.matchMedia('(display-mode: standalone)').matches) {
      return;
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    setIsInstalling(true);
    try {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setShowPrompt(false);
      }
    } catch (err) {
      console.error('[PWA] Install prompt failed:', err);
    } finally {
      setDeferredPrompt(null);
      setIsInstalling(false);
    }
  }, [deferredPrompt]);

  const handleDismiss = useCallback(() => {
    setShowPrompt(false);
    setIsDismissed(true);
    localStorage.setItem('agape_pwa_install_dismissed', Date.now().toString());
  }, []);

  if (isDismissed || !showPrompt || !deferredPrompt) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden animate-slide-up">
        <div className="relative bg-gradient-to-br from-blue-600 to-blue-800 px-6 py-8 text-center">
          <button
            onClick={handleDismiss}
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30 transition-colors"
          >
            <X size={16} />
          </button>
          <div className="w-16 h-16 mx-auto mb-4 bg-white/20 rounded-2xl flex items-center justify-center">
            <Smartphone size={32} className="text-white" />
          </div>
          <h2 className="text-xl font-semibold text-white">Install Agape Care</h2>
          <p className="text-blue-100 text-sm mt-2">Add to your home screen for the best experience</p>
        </div>

        <div className="px-6 py-5 space-y-3">
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
              <Zap size={18} className="text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">Lightning Fast</p>
              <p className="text-xs text-slate-500">Opens instantly from your home screen</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl">
            <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center shrink-0">
              <Wifi size={18} className="text-green-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">Works Offline</p>
              <p className="text-xs text-slate-500">Access your data even without internet</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl">
            <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center shrink-0">
              <Shield size={18} className="text-purple-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">Secure & Private</p>
              <p className="text-xs text-slate-500">Your data stays on your device</p>
            </div>
          </div>
        </div>

        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={handleDismiss}
            className="flex-1 h-12 rounded-2xl border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 active:scale-95 transition-all"
          >
            Not Now
          </button>
          <button
            onClick={handleInstall}
            disabled={isInstalling}
            className="flex-1 h-12 rounded-2xl bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {isInstalling ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <Download size={16} />
                Install
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PWAInstallPrompt;
