import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error Boundary component that catches JavaScript errors in its child
 * component tree and renders a fallback UI instead of crashing the page.
 *
 * Use this to isolate non-critical features like narration so that
 * a failure in one component doesn't bring down the entire page.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.warn('[ErrorBoundary] Caught error:', error.message, errorInfo.componentStack);
    this.props.onError?.(error, errorInfo);
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
        <div
          className="p-5 rounded-2xl"
          style={{
            background: 'var(--warning-soft)',
            border: '1px solid color-mix(in srgb, var(--warning) 40%, transparent)',
          }}
        >
          <div className="flex items-start gap-3">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              className="flex-shrink-0 mt-0.5" style={{ color: 'var(--warning)' }} aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4M12 16h.01" />
            </svg>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                Đã xảy ra lỗi hiển thị
              </div>
              <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                Tính năng này hiện không khả dụng. Các nội dung khác vẫn hoạt động bình thường.
              </p>
              <button
                onClick={this.handleRetry}
                className="mt-3 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200"
                style={{
                  background: 'var(--warning-soft)',
                  border: '1px solid color-mix(in srgb, var(--warning) 50%, transparent)',
                  color: 'var(--warning)',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.filter = 'brightness(1.05)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.filter = 'none'; }}
              >
                Thử lại
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
