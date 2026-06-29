import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { ToastProvider } from './hooks/useToast';
import { AccessibilityProvider } from './contexts/AccessibilityContext';
import './index.css';

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
