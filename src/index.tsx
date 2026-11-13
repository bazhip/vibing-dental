import React from 'react';
import { createRoot } from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';
import './index.css';
import './styles/native-ios.css';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { DialogHost } from './components/ui/dialogs';
import { installIteratorHelpers } from './utils/iteratorHelpers';
import { installScopeSelectorFallback } from './utils/scopeSelector';
import { initNativeShell } from './native/platform';
import { initAuthReturn } from './native/authReturn';
import { initIosFeel, hideSplashAfterFirstRender } from './native/iosFeel';

// react-data-grid leans on two features older browsers lack: ES2025 iterator
// helpers (Chrome 122 / Firefox 131 / Safari 18.4) for rendering, and the `&`
// nesting selector in querySelector (Chrome 120 / Firefox 117 / Safari 17.2)
// for cell focus. Install both before anything renders.
installIteratorHelpers();
installScopeSelectorFallback();
initNativeShell();
// App only: finish sign-ins that come back through toothops://auth-callback.
initAuthReturn();
initIosFeel();

// Suppress the benign "ResizeObserver loop" message the data grid's
// resize observers can trigger — non-actionable, and dev-overlay tooling
// otherwise promotes it into a runtime error banner.
const RESIZE_OBSERVER_MSGS = [
  'ResizeObserver loop completed with undelivered notifications.',
  'ResizeObserver loop limit exceeded',
];
window.addEventListener('error', (e) => {
  if (e.message && RESIZE_OBSERVER_MSGS.some((m) => e.message.includes(m))) {
    e.stopImmediatePropagation();
  }
});

// The native splash stays up (launchAutoHide: false) until React has
// committed its first frame, so the app never flashes a blank webview.
function SplashHandoff() {
  React.useEffect(() => {
    hideSplashAfterFirstRender();
  }, []);
  return null;
}

const container = document.getElementById('root');
if (!container) throw new Error('Failed to find the root element');

const root = createRoot(container);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
      {/* App-wide confirm/prompt dialogs and toasts. */}
      <DialogHost />
    </ErrorBoundary>
    <SplashHandoff />
    {/* Vercel Web Analytics — page views + custom events, alongside the
        cookieless Cloudflare beacon in index.html. No-op outside Vercel. */}
    <Analytics />
  </React.StrictMode>
);
