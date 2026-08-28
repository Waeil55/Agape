import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { ToastProvider } from './hooks/useToast';
import { AccessibilityProvider } from './contexts/AccessibilityContext';
import './index.css';

// Runtime safety net: unhandled failures must never die silently. They are
// logged with enough context to diagnose, without leaking user data.
const reportUnhandled = (kind) => (event) => {
  const reason = event?.reason || event?.error || event;
  const message = reason?.message || String(reason || 'Unknown error');
  console.error(`[agape:${kind}]`, message, reason?.stack || '');
  try {
    window.dispatchEvent(new CustomEvent('agape-runtime-warning', { detail: { kind, message } }));
  } catch { /* noop */ }
};
window.addEventListener('unhandledrejection', reportUnhandled('unhandled-rejection'));
window.addEventListener('error', reportUnhandled('unhandled-error'));

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AccessibilityProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AccessibilityProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
