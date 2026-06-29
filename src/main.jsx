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
    document.querySelectorAll('table tbody tr.row-selected').forEach(el => {
      if (el !== tr) el.classList.remove('row-selected');
    });
    tr.classList.add('row-selected');
  } else if (!e.target.closest('table')) {
    document.querySelectorAll('table tbody tr.row-selected').forEach(el => {
      el.classList.remove('row-selected');
    });
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
