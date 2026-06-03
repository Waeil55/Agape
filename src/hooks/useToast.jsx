import React, { createContext, useContext, useState, useCallback } from 'react';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';

const ToastContext = createContext(null);

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'info', duration = 3000) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);

    if (duration) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, duration);
    }
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
        {toasts.map(toast => (
          <div 
            key={toast.id}
            className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border animate-slide-up bg-white max-w-sm w-full ${
              toast.type === 'success' ? 'border-emerald-200' : 
              toast.type === 'error' ? 'border-rose-200' : 'border-blue-200'
            }`}
          >
            {toast.type === 'success' && <CheckCircle size={20} className="text-emerald-500 flex-shrink-0" />}
            {toast.type === 'error' && <AlertCircle size={20} className="text-rose-500 flex-shrink-0" />}
            {toast.type === 'info' && <Info size={20} className="text-blue-500 flex-shrink-0" />}
            
            <p className="text-sm font-medium text-slate-800 flex-1">{toast.message}</p>
            
            <button 
              onClick={() => removeToast(toast.id)}
              className="p-1 hover:bg-slate-100 rounded-md transition-colors"
            >
              <X size={16} className="text-slate-400" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
