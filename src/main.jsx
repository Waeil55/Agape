import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { ToastProvider } from './hooks/useToast';
import { AccessibilityProvider } from './contexts/AccessibilityContext';
import './index.css';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

// Global table row selection logic for desktop view
document.addEventListener('click', (e) => {
  const tr = e.target.closest('table tbody tr');
  if (tr) {
    document.querySelectorAll('table tbody tr[data-agape-selected="true"]').forEach(el => {
      if (el !== tr) el.removeAttribute('data-agape-selected');
    });
    tr.setAttribute('data-agape-selected', 'true');
  } else if (!e.target.closest('table')) {
    document.querySelectorAll('table tbody tr[data-agape-selected="true"]').forEach(el => {
      el.removeAttribute('data-agape-selected');
    });
  }
}, true);

document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    // Do not interfere if user is typing in an input field
    const activeTagName = document.activeElement ? document.activeElement.tagName : '';
    if (activeTagName === 'INPUT' || activeTagName === 'TEXTAREA' || activeTagName === 'SELECT') {
      return;
    }

    const selectedRows = document.querySelectorAll('table tbody tr[data-agape-selected="true"]');
    if (selectedRows.length > 0) {
      const current = selectedRows[0];
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
