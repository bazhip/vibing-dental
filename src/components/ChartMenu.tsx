import React from 'react';

interface ChartMenuCloud {
  onPracticeSettings: () => void;
  onOpenReminders: () => void;
  onOpenAccount: () => void;
  onSignOut: () => void;
}

/*
 * Settings menu — app/practice/account configuration and the session.
 * Chart actions (new patient, new visit, open, load PDF) live on the
 * "My charts" button, not here.
 */

interface ChartMenuProps {
  /** Relaunch the getting-started walkthrough. */
  onOpenWalkthrough: () => void;
  /** View the landing page without ending the session. */
  onGoHome?: () => void;
  /** Admin panel — present only for the admin account. */
  onOpenAdmin?: () => void;
  /** Cloud account actions — present only when Supabase is configured. */
  cloud?: ChartMenuCloud;
}

/**
 * Top-of-app Settings menu: practice identity + reminders, this account,
 * admin (when applicable), and app-level bits (AI settings, homepage,
 * sign out). Lives in the topbar.
 */
export const ChartMenu: React.FC<ChartMenuProps> = ({ onOpenWalkthrough, onGoHome, onOpenAdmin, cloud }) => {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Click-outside / Esc to close.
  React.useEffect(() => {
    if (!open) return;
    const onDocPointer = (e: PointerEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onDocPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDocPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const item = (label: string, sub: string, onClick: () => void) => (
    <button
      type="button"
      className="chart-menu__item"
      role="menuitem"
      onClick={() => { setOpen(false); onClick(); }}
    >
      <span className="chart-menu__item-body">
        <strong>{label}</strong>
        <span>{sub}</span>
      </span>
    </button>
  );

  return (
    <div className={`chart-menu${open ? ' chart-menu--open' : ''}`} ref={containerRef}>
      <button
        type="button"
        className="chart-menu__trigger"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Open settings menu"
      >
        <span className="chart-menu__trigger-label">Settings</span>
      </button>

      {open && (
        <div className="chart-menu__panel" role="menu">
          {cloud && (
            <section className="chart-menu__section">
              <header className="chart-menu__section-head">Practice</header>
              {item('Practice', 'Name, logo, and team.', cloud.onPracticeSettings)}
              {item('Recheck reminders', 'Owner email template and auto-send schedule.', cloud.onOpenReminders)}
            </section>
          )}

          {cloud && (
            <section className="chart-menu__section">
              <header className="chart-menu__section-head">Account</header>
              {item('Account settings', 'Your doctor name, email, and password.', cloud.onOpenAccount)}
            </section>
          )}

          {onOpenAdmin && (
            <section className="chart-menu__section">
              <header className="chart-menu__section-head">Admin</header>
              {item('Admin panel', 'Manage accounts, practices, and plans.', onOpenAdmin)}
            </section>
          )}

          <section className="chart-menu__section">
            <header className="chart-menu__section-head">App</header>
            {item('Getting started', 'Replay the walkthrough of every part of the app.', onOpenWalkthrough)}
            {onGoHome && item('Homepage', 'View the product page — your chart stays right here.', onGoHome)}
            {cloud && item('Sign out', 'End your session and return to the homepage.', cloud.onSignOut)}
          </section>
        </div>
      )}
    </div>
  );
};
