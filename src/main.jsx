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

// Global table row selection logic for desktop view. Keep one direct reference
// instead of rescanning every table after every pointer interaction.
let selectedTableRow = null;
document.addEventListener('click', (e) => {
  const tr = e.target.closest('table tbody tr');
  if (tr) {
    if (selectedTableRow && selectedTableRow !== tr) selectedTableRow.removeAttribute('data-agape-selected');
    selectedTableRow = tr;
    tr.setAttribute('data-agape-selected', 'true');
  } else if (!e.target.closest('table')) {
    selectedTableRow?.removeAttribute('data-agape-selected');
    selectedTableRow = null;
  }
}, true);

document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    // Do not interfere if user is typing in an input field
    const activeTagName = document.activeElement ? document.activeElement.tagName : '';
    if (activeTagName === 'INPUT' || activeTagName === 'TEXTAREA' || activeTagName === 'SELECT') {
      return;
    }

    if (selectedTableRow?.isConnected) {
      const current = selectedTableRow;
      let target = null;
      
      if (e.key === 'ArrowUp') {
        target = current.previousElementSibling;
      } else if (e.key === 'ArrowDown') {
        target = current.nextElementSibling;
      }
      
      if (target && target.tagName === 'TR') {
        e.preventDefault(); // Prevent page scrolling
        current.removeAttribute('data-agape-selected');
        target.setAttribute('data-agape-selected', 'true');
        selectedTableRow = target;
        target.scrollIntoView({ block: 'nearest' });
      }
    }
  }
});

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
