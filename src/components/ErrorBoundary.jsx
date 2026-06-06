import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

const TDZ_RE = /Cannot access.*before initialization/;

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, componentStack: '' };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    const stack = info?.componentStack || '';
    console.error('[ErrorBoundary] CRASH:', error.message);
    console.error('[ErrorBoundary] Stack:', error.stack);
    console.error('[ErrorBoundary] Component Stack:', stack);
    this.setState({ componentStack: stack });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, componentStack: '' });
  };

  handleClearCache = () => {
    sessionStorage.removeItem('agape_reload_count');
    const doReload = () => location.reload(true);
    const promises = [];
    if ('caches' in window) {
      promises.push(caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))));
    }
    if ('serviceWorker' in navigator) {
      promises.push(navigator.serviceWorker.getRegistrations().then(regs =>
        Promise.all(regs.map(r => r.unregister()))
      ));
    }
    Promise.all(promises).then(doReload).catch(doReload);
  };

  render() {
    if (this.state.hasError) {
      const isTDZ = this.state.error && TDZ_RE.test(this.state.error.message);
      return (
        <div className="flex-1 bg-slate-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8 sm:p-12 max-w-md w-full text-center">
            <div className="w-16 h-16 bg-rose-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <AlertTriangle size={32} className="text-rose-600" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Something went wrong</h2>
            <p className="text-sm text-slate-500 mb-6">{this.state.error?.message || 'An unexpected error occurred.'}</p>
            {this.state.componentStack && (
              <pre className="text-[10px] text-left text-rose-600 bg-rose-50 rounded-xl p-3 mb-4 max-h-40 overflow-auto font-mono border border-rose-200">{this.state.componentStack}</pre>
            )}
            {isTDZ && (
              <p className="text-xs text-amber-600 mb-4">Module initialization conflict detected. Clearing cache may resolve this.</p>
            )}
            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleRetry}
                className="px-6 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 flex items-center gap-2 transition"
              >
                <RefreshCw size={18} /> Retry
              </button>
              {isTDZ && (
                <button
                  onClick={this.handleClearCache}
                  className="px-6 py-3 bg-amber-500 text-white rounded-xl font-bold hover:bg-amber-600 flex items-center gap-2 transition"
                >
                  Clear Cache & Reload
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
