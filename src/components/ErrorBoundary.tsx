import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
  stack: string;
}

const FEEDBACK_EMAIL = 'bazhip@gmail.com';

/**
 * Last-resort crash screen. The chart's working copy lives in
 * localStorage (written on every edit), so a render crash never loses
 * data — but without this boundary the operator would see a blank white
 * page mid-procedure with no way to know that. Reloading restores the
 * chart from the local copy; the crash report can be emailed in one tap.
 */
export class ErrorBoundary extends React.Component<
  React.PropsWithChildren,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, message: '', stack: '' };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || String(error),
      stack: error.stack || '',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('[crash]', error, info.componentStack);
    this.setState({ stack: (error.stack || '') + '\n\nComponent stack:' + (info.componentStack || '') });
  }

  private mailto(): string {
    const body = [
      'A crash happened in ToothOps. Details below — feel free to add what you were doing.',
      '',
      'What I was doing:',
      '',
      '--- crash report (please keep) ---',
      `Error: ${this.state.message}`,
      `Page: ${window.location.href}`,
      `When: ${new Date().toISOString()}`,
      `Browser: ${navigator.userAgent}`,
      '',
      (this.state.stack || '(no stack)').slice(0, 4000),
    ].join('\n');
    return `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent('ToothOps crash report')}&body=${encodeURIComponent(body)}`;
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
          gap: '0.85rem',
          padding: '2rem',
          textAlign: 'center',
          fontFamily: 'inherit',
          background: 'var(--bg-page, #f3f5f7)',
          color: 'var(--text, #0f172a)',
        }}
      >
        <h1 style={{ fontSize: '1.25rem' }}>Something went wrong</h1>
        <p style={{ maxWidth: '30rem', color: 'var(--text-muted, #55677a)' }}>
          Your chart is saved on this device — reloading brings it right
          back. If this keeps happening, email the crash report so it can be
          fixed.
        </p>
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', justifyContent: 'center' }}>
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
          <a
            href={this.mailto()}
            style={{
              padding: '0.6rem 1.4rem',
              borderRadius: '8px',
              border: '1px solid var(--primary, #0c6b63)',
              background: 'transparent',
              color: 'var(--primary, #0c6b63)',
              fontSize: '1rem',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Email crash report
          </a>
        </div>
        {this.state.message && (
          <details style={{ maxWidth: '40rem', marginTop: '0.5rem', textAlign: 'left' }}>
            <summary style={{ cursor: 'pointer', color: 'var(--text-muted, #55677a)', fontSize: '0.85rem' }}>
              Technical details
            </summary>
            <pre
              style={{
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontSize: '0.72rem',
                color: 'var(--text-muted, #55677a)',
                background: 'var(--surface, #fff)',
                border: '1px solid var(--border, #e2e8f0)',
                borderRadius: '8px',
                padding: '0.75rem',
                marginTop: '0.5rem',
                maxHeight: '12rem',
                overflow: 'auto',
              }}
            >
              {this.state.message}
              {'\n'}
              {this.state.stack}
            </pre>
          </details>
        )}
      </div>
    );
  }
}
