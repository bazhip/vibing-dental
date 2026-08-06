import React from 'react';
import { createRoot } from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';
import './index.css';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { installIteratorHelpers } from './utils/iteratorHelpers';

// react-data-grid chains ES2025 iterator helpers onto generators; browsers
// older than Chrome 122 / Firefox 131 / Safari 18.4 crash the grid without
// them. Install before anything renders.
installIteratorHelpers();

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

const container = document.getElementById('root');
if (!container) throw new Error('Failed to find the root element');

const root = createRoot(container);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
    {/* Vercel Web Analytics — page views + custom events, alongside the
        cookieless Cloudflare beacon in index.html. No-op outside Vercel. */}
    <Analytics />
  </React.StrictMode>
);
