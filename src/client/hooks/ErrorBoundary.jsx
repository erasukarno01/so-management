import { Component, createContext, useContext, useState, useCallback } from 'react';
import { AlertTriangle, RefreshCw, X } from 'lucide-react';

// Error Context for global error handling
const ErrorContext = createContext(null);

export function useErrorHandler() {
  const context = useContext(ErrorContext);
  if (!context) {
    throw new Error('useErrorHandler must be used within ErrorProvider');
  }
  return context;
}

export function ErrorProvider({ children }) {
  const [error, setError] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const showError = useCallback((error, options = {}) => {
    setError({ error, ...options });
    setIsModalOpen(true);
  }, []);

  const hideError = useCallback(() => {
    setIsModalOpen(false);
    setError(null);
  }, []);

  const value = { error, isModalOpen, showError, hideError };

  return (
    <ErrorContext.Provider value={value}>
      {children}
      <ErrorModal />
    </ErrorContext.Provider>
  );
}

function ErrorModal() {
  const { error, isModalOpen, hideError } = useErrorHandler();

  if (!isModalOpen || !error) return null;

  const handleRetry = () => {
    hideError();
    if (error.onRetry) {
      error.onRetry();
    }
    window.location.reload();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={hideError}
      />

      {/* Modal */}
      <div className="relative bg-slate-800 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl border border-red-500/30 animate-in fade-in zoom-in-95 duration-200">
        {/* Close button */}
        <button
          onClick={hideError}
          className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Icon */}
        <div className="w-14 h-14 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-7 h-7 text-red-400" />
        </div>

        {/* Title */}
        <h3 className="text-xl font-bold text-white text-center mb-2">
          {error.title || 'Terjadi Kesalahan'}
        </h3>

        {/* Message */}
        <p className="text-slate-400 text-sm text-center mb-2">
          {error.message || error.error?.message || 'Terjadi kesalahan yang tidak terduga'}
        </p>

        {/* Details (collapsible) */}
        {error.error?.stack && (
          <details className="mt-3 mb-4">
            <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-400">
              Lihat detail error
            </summary>
            <pre className="mt-2 p-3 bg-slate-900 rounded-lg text-xs text-slate-400 overflow-auto max-h-32">
              {error.error.stack}
            </pre>
          </details>
        )}

        {/* Actions */}
        <div className="flex gap-3 mt-6">
          <button
            onClick={hideError}
            className="flex-1 px-4 py-2.5 bg-slate-700 text-slate-300 rounded-xl font-medium hover:bg-slate-600 transition-colors"
          >
            Tutup
          </button>
          <button
            onClick={handleRetry}
            className="flex-1 px-4 py-2.5 bg-emerald-500 text-white rounded-xl font-medium hover:bg-emerald-400 transition-colors flex items-center justify-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Coba Lagi
          </button>
        </div>
      </div>
    </div>
  );
}

// Original ErrorBoundary for component-level error handling
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      const { fallback: Fallback, message = 'Terjadi kesalahan' } = this.props;

      if (Fallback) {
        return <Fallback error={this.state.error} onReset={this.handleReset} />;
      }

      // Use modal instead of full page
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm">
          <div className="bg-slate-800 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl border border-red-500/30">
            <div className="w-14 h-14 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-7 h-7 text-red-400" />
            </div>
            <h2 className="text-xl font-bold text-white text-center mb-2">{message}</h2>
            <p className="text-slate-400 text-sm text-center mb-6">
              {this.state.error?.message || 'Terjadi kesalahan yang tidak terduga'}
            </p>
            <button
              onClick={this.handleReset}
              className="w-full px-6 py-3 bg-emerald-500 text-white rounded-xl font-medium hover:bg-emerald-400 transition-colors flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Coba Lagi
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;