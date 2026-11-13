import React from 'react';
import { supabase } from '../utils/supabaseClient';
import { isNativeApp } from '../native/platform';
import './AccountSurfaces.css';

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
  /** Send feedback — present for signed-in accounts. */
  onOpenFeedback?: () => void;
  /** Chart settings (pockets per root, grid columns, beside-teeth values…). */
  onOpenChartSettings?: () => void;
  /** Reopen the "What's new" announcement. */
  onOpenWhatsNew?: () => void;
  /** Cloud account actions — present only when Supabase is configured. */
  cloud?: ChartMenuCloud;
  /** Signed-in email for the menu header. Optional — when omitted (and
   *  cloud is on) the menu reads it from the current session. */
  email?: string;
}

const ITEM_SELECTOR = '.chart-menu__item';

/** The signed-in email, from the prop or (failing that) the session. */
function useSignedInEmail(enabled: boolean, override?: string): string {
  const [email, setEmail] = React.useState('');
  React.useEffect(() => {
    if (!enabled || override !== undefined || !supabase) return;
    let cancelled = false;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!cancelled) setEmail(data.session?.user.email ?? '');
      })
      .catch(() => { /* header is optional */ });
    return () => {
      cancelled = true;
    };
  }, [enabled, override]);
  return override ?? email;
}

/**
 * Top-of-app Settings menu: practice identity + reminders, this account,
 * admin (when applicable), and app-level bits (AI settings, homepage,
 * sign out). Lives in the topbar.
 */
export const ChartMenu: React.FC<ChartMenuProps> = ({ onOpenWalkthrough, onGoHome, onOpenAdmin, onOpenFeedback, onOpenChartSettings, onOpenWhatsNew, cloud, email }) => {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const signedInAs = useSignedInEmail(!!cloud && open, email);

  /** Close; return focus to the trigger if it was inside the menu (so
   *  keyboard users don't land on <body>). */
  const close = React.useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  // Click-outside / Esc to close.
  React.useEffect(() => {
    if (!open) return;
    const focusInside = () => !!containerRef.current?.contains(document.activeElement);
    const onDocPointer = (e: PointerEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) close(focusInside());
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(true);
    };
    document.addEventListener('pointerdown', onDocPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDocPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  const items = () =>
    Array.from(panelRef.current?.querySelectorAll<HTMLButtonElement>(ITEM_SELECTOR) ?? []);

  const focusItem = (which: 'first' | 'last' | number) => {
    const list = items();
    if (list.length === 0) return;
    const i = which === 'first' ? 0 : which === 'last' ? list.length - 1 : (which + list.length) % list.length;
    list[i].focus();
  };

  // Opening from the keyboard (ArrowDown/ArrowUp on the trigger) moves
  // focus into the panel; a mouse open leaves focus on the trigger.
  const pendingFocus = React.useRef<'first' | 'last' | null>(null);
  React.useEffect(() => {
    if (open && pendingFocus.current) {
      focusItem(pendingFocus.current);
      pendingFocus.current = null;
    }
  }, [open]);

  const onTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const target = e.key === 'ArrowDown' ? 'first' : 'last';
      if (open) focusItem(target);
      else {
        pendingFocus.current = target;
        setOpen(true);
      }
    }
  };

  const onPanelKeyDown = (e: React.KeyboardEvent) => {
    const list = items();
    const idx = list.indexOf(document.activeElement as HTMLButtonElement);
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        focusItem(idx < 0 ? 0 : idx + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        focusItem(idx < 0 ? -1 : idx - 1);
        break;
      case 'Home':
        e.preventDefault();
        focusItem('first');
        break;
      case 'End':
        e.preventDefault();
        focusItem('last');
        break;
      default:
    }
  };

  // Tabbing out of the menu closes it (focus has already moved on).
  const onBlur = (e: React.FocusEvent) => {
    if (open && e.relatedTarget && !containerRef.current?.contains(e.relatedTarget as Node)) setOpen(false);
  };

  const item = (label: string, sub: string, onClick: () => void) => (
    <button
      type="button"
      className="chart-menu__item"
      onClick={() => { setOpen(false); onClick(); }}
    >
      <span className="chart-menu__item-body">
        <strong>{label}</strong>
        <span>{sub}</span>
      </span>
    </button>
  );

  return (
    <div className={`chart-menu${open ? ' chart-menu--open' : ''}`} ref={containerRef} onBlur={onBlur}>
      {/* Disclosure semantics (button + aria-expanded) over plain buttons,
          with arrow keys as a convenience for moving between them. */}
      <button
        ref={triggerRef}
        type="button"
        className="chart-menu__trigger"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onTriggerKeyDown}
        aria-expanded={open}
        aria-label="Open settings menu"
      >
        <span className="chart-menu__trigger-label">Settings</span>
      </button>

      {open && (
        <div className="chart-menu__panel" ref={panelRef} onKeyDown={onPanelKeyDown}>
          {cloud && signedInAs && (
            <div className="chart-menu__account" title={signedInAs}>
              Signed in as <strong>{signedInAs}</strong>
            </div>
          )}

          {cloud && (
            <section className="chart-menu__section">
              <header className="chart-menu__section-head">Practice</header>
              {item('Practice settings', isNativeApp() ? 'Name, logo, and team.' : 'Name, logo, team, and billing.', cloud.onPracticeSettings)}
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
              {item('Admin panel', 'Manage users, practices, and plans.', onOpenAdmin)}
            </section>
          )}

          <section className="chart-menu__section">
            <header className="chart-menu__section-head">App</header>
            {onOpenChartSettings && item('Chart settings', 'Pockets per root, grid columns, what shows beside the teeth.', onOpenChartSettings)}
            {onOpenFeedback && item('Send feedback', 'Report a problem or suggest an idea — it comes straight to us.', onOpenFeedback)}
            {onOpenWhatsNew && item('What’s new', 'The latest features and improvements.', onOpenWhatsNew)}
            {item('Getting started', 'Replay the walkthrough of every part of the app.', onOpenWalkthrough)}
            {onGoHome && item('Homepage', 'View the product page — your chart stays right here.', onGoHome)}
            {cloud && item('Sign out', 'End your session and return to the homepage.', cloud.onSignOut)}
          </section>
        </div>
      )}
    </div>
  );
};
