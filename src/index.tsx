import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import * as serviceWorker from './serviceWorker';

// Suppress benign ResizeObserver loop warning from data-grid resize observers.
// This message is non-actionable and only surfaces because CRA's dev overlay
// promotes any window 'error' event into a runtime error banner.
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
  </React.StrictMode>
);

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://bit.ly/CRA-PWA
serviceWorker.unregister();
