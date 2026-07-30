import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error boundary component that catches JavaScript errors anywhere in the
 * child component tree and displays a fallback UI instead of crashing.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error to console in development
    if (import.meta.env.DEV) {
      console.error('Error caught by boundary:', error, errorInfo);
    }
    // In production, this would send to Sentry (already initialized in main.tsx)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-viewport bg-gradient-main flex flex-col items-center justify-center p-4">
          <div className="text-center max-w-md">
            <span className="text-6xl block mb-4">😵</span>
            <h2 className="text-xl font-bold text-white mb-2">Something went wrong</h2>
            <p className="text-text-secondary mb-6">
              An unexpected error occurred. Please try again.
            </p>
            {import.meta.env.DEV && this.state.error && (
              <div className="mb-6 p-4 bg-red-900/30 rounded-lg text-left">
                <p className="text-red-400 text-sm font-mono break-all">
                  {this.state.error.message}
                </p>
              </div>
            )}
            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleRetry}
                className="px-6 py-2.5 bg-accent-teal text-white rounded-lg font-medium hover:bg-accent-teal/90 transition-colors"
              >
                Try Again
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-6 py-2.5 bg-white/10 text-white rounded-lg font-medium hover:bg-white/20 transition-colors"
              >
                Refresh Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
