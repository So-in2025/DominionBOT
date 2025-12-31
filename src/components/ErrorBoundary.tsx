
import React, { ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  // FIX: Using a public class field for state initialization. This is a common and
  // idiomatic pattern in modern React with TypeScript, which can help TypeScript
  // correctly infer the `state` property and resolve related type errors.
  public state: ErrorBoundaryState = {
    hasError: false
  };

  static getDerivedStateFromError(_: Error): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center bg-brand-black text-center p-8">
            <div className="w-24 h-24 bg-red-500/10 text-red-400 rounded-full flex items-center justify-center mx-auto border-4 border-red-500/20 mb-6">
                <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            </div>
            <h1 className="text-2xl font-black text-white uppercase tracking-widest">Error de Sistema</h1>
            <p className="text-sm text-gray-400 mt-2 max-w-sm">
                Hubo un problema al cargar un componente crítico. Esto puede ser temporal.
            </p>
            <button
                onClick={() => window.location.reload()}
                className="mt-8 px-8 py-4 bg-brand-gold text-black rounded-xl font-black text-xs uppercase tracking-[0.2em] shadow-lg shadow-brand-gold/20 hover:scale-105 transition-transform"
            >
                Recargar Sistema
            </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
