import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { ToastProvider } from './hooks/useToast';
import { AccessibilityProvider } from './contexts/AccessibilityContext';
import './index.css';

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
