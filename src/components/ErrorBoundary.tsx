import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * Last-resort crash screen. The chart's working copy lives in
 * localStorage (written on every edit), so a render crash never loses
 * data — but without this boundary the operator would see a blank white
 * page mid-procedure with no way to know that. Reloading restores the
 * chart from the local copy.
 */
export class ErrorBoundary extends React.Component<
  React.PropsWithChildren,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('[crash]', error, info.componentStack);
  }

  render(): React.ReactNode {
    if (!this.state.hasError) return this.props.children;
    return (
      <div
        role="alert"
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.75rem',
          padding: '2rem',
          textAlign: 'center',
          fontFamily: 'inherit',
          background: 'var(--bg-page, #f3f5f7)',
          color: 'var(--text, #0f172a)',
        }}
      >
        <h1 style={{ fontSize: '1.25rem' }}>Something went wrong</h1>
        <p style={{ maxWidth: '28rem', color: 'var(--text-muted, #55677a)' }}>
          Your chart is saved on this device — reloading brings it right
          back. If this keeps happening, email bazhip@gmail.com with what
          you were doing.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            padding: '0.6rem 1.4rem',
            borderRadius: '8px',
            border: 'none',
            background: 'var(--primary, #0c6b63)',
            color: '#fff',
            fontSize: '1rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Reload the app
        </button>
      </div>
    );
  }
}
