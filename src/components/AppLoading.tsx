import React from 'react';

/** Shown while the session check and app code load — instead of a blank
 *  white page. Delays itself briefly so fast loads don't flash it. */
export const AppLoading: React.FC = () => {
  const [visible, setVisible] = React.useState(false);
  React.useEffect(() => {
    const t = window.setTimeout(() => setVisible(true), 150);
    return () => window.clearTimeout(t);
  }, []);
  if (!visible) return null;
  return (
    <div className="app-loading" role="status" aria-live="polite">
      <div className="app-loading__mark">ToothOps</div>
      <div className="app-loading__spinner" aria-hidden="true" />
      <span className="visually-hidden">Loading…</span>
    </div>
  );
};
