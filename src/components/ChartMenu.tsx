import React from 'react';
import { Trans, useTranslation } from 'react-i18next';
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
  scope?: 'all' | 'help' | 'account' | 'more';
  visit?: { name: string; onNewVisit: () => void; onHistory: () => void };
  onNewPatient?: () => void;
  onPreviewDocuments?: () => void;
  onRevert?: () => void;
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

/** Resolve personal identity before the account disclosure is opened. */
function useSignedInIdentity(enabled: boolean) {
  const [identity, setIdentity] = React.useState({ email: '' });
  React.useEffect(() => {
    if (!enabled || !supabase) return;
    let cancelled = false;
    const update = (user: { email?: string } | undefined) => {
      if (!cancelled) setIdentity({ email: user?.email ?? '' });
    };
    void supabase.auth.getSession().then(({ data }) => update(data.session?.user)).catch(() => { /* optional identity */ });
    const subscription = supabase.auth.onAuthStateChange?.((_event, session) => update(session?.user));
    return () => { cancelled = true; subscription?.data.subscription.unsubscribe(); };
  }, [enabled]);
  return identity;
}

/**
 * Top-of-app Settings menu: practice identity + reminders, this account,
 * admin (when applicable), and app-level bits (AI settings, homepage,
 * sign out). Lives in the topbar.
 */
export const ChartMenu: React.FC<ChartMenuProps> = ({ scope = 'all', visit, onNewPatient, onPreviewDocuments, onRevert, onOpenWalkthrough, onGoHome, onOpenAdmin, onOpenFeedback, onOpenChartSettings, onOpenWhatsNew, cloud, email }) => {
  const { t } = useTranslation('app');
  const showHelp = scope !== 'account';
  const showAccount = scope !== 'help';
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const identity = useSignedInIdentity(!!cloud && (scope === 'account' || scope === 'more' || open));
  const signedInAs = email ?? identity.email;
  const accountName = signedInAs;
  const triggerLabel = scope === 'account' ? accountName || t('menu.heads.account') : t(scope === 'all' ? 'menu.trigger' : `workspace.${scope}`);

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
    <div className={`chart-menu chart-menu--${scope}${open ? ' chart-menu--open' : ''}`} ref={containerRef} onBlur={onBlur}>
      {/* Disclosure semantics (button + aria-expanded) over plain buttons,
          with arrow keys as a convenience for moving between them. */}
      <button
        ref={triggerRef}
        type="button"
        className="chart-menu__trigger"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onTriggerKeyDown}
        aria-expanded={open}
        title={scope === 'account' ? signedInAs || undefined : undefined}
        aria-label={scope === 'account' ? triggerLabel : t(scope === 'all' ? 'menu.open' : `workspace.${scope}`)}
      >
        {scope === 'all' && <svg className="topbar-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>}
        <span className="chart-menu__trigger-label">{triggerLabel}</span>
        {scope === 'account' && <span aria-hidden="true">⌃</span>}
      </button>

      {open && (
        <div className="chart-menu__panel" ref={panelRef} onKeyDown={onPanelKeyDown}>
          {showAccount && cloud && signedInAs && (
            <div className="chart-menu__account" title={signedInAs}>
              <Trans t={t} i18nKey="menu.signedInAs" values={{ email: signedInAs }} components={{ strong: <strong /> }} />
            </div>
          )}

          {scope === 'more' && (visit || onNewPatient || onRevert || onPreviewDocuments) && (
            <section className="chart-menu__section">
              <header className="chart-menu__section-head">{visit?.name || t('chartsMenu.thisPatient')}</header>
              {visit && item(t('chartsMenu.newVisit'), t('chartsMenu.newVisitHint'), visit.onNewVisit)}
              {visit && item(t('chartsMenu.history'), t('chartsMenu.historyHint'), visit.onHistory)}
              {onPreviewDocuments && item(t('fab.review'), t('fab.reviewHint'), onPreviewDocuments)}
              {onNewPatient && item(t('topbar.newPatient'), t('topbar.newPatientTitle'), onNewPatient)}
              {onRevert && item(t('topbar.undo'), t('topbar.undoTitle'), onRevert)}
            </section>
          )}

          {(scope === 'all' || scope === 'more') && cloud && (
            <section className="chart-menu__section">
              <header className="chart-menu__section-head">{t('menu.heads.practice')}</header>
              {item(t('menu.practiceSettings.label'), isNativeApp() ? t('menu.practiceSettingsHintApp', { ns: 'chart' }) : t('menu.practiceSettings.sub'), cloud.onPracticeSettings)}
              {item(t('menu.reminders.label'), t('menu.reminders.sub'), cloud.onOpenReminders)}
            </section>
          )}

          {showAccount && cloud && (
            <section className="chart-menu__section">
              <header className="chart-menu__section-head">{t('menu.heads.account')}</header>
              {item(scope === 'more' && accountName ? accountName : t('menu.account.label'), t('menu.account.sub'), cloud.onOpenAccount)}
            </section>
          )}

          {showAccount && onOpenAdmin && (
            <section className="chart-menu__section">
              <header className="chart-menu__section-head">{t('menu.heads.admin')}</header>
              {item(t('menu.admin.label'), t('menu.admin.sub'), onOpenAdmin)}
            </section>
          )}

          <section className="chart-menu__section">
            {scope === 'all' && <header className="chart-menu__section-head">{t('menu.heads.app')}</header>}
            {(scope === 'all' || scope === 'more') && onOpenChartSettings && item(t('menu.chartSettings.label'), t('menu.chartSettings.sub'), onOpenChartSettings)}
            {showHelp && onOpenFeedback && item(t('menu.feedback.label'), t('menu.feedback.sub'), onOpenFeedback)}
            {showHelp && onOpenWhatsNew && item(t('menu.whatsNew.label'), t('menu.whatsNew.sub'), onOpenWhatsNew)}
            {showHelp && item(t('menu.gettingStarted.label'), t('menu.gettingStarted.sub'), onOpenWalkthrough)}
            {showHelp && onGoHome && item(t('menu.homepage.label'), t('menu.homepage.sub'), onGoHome)}
            {showAccount && cloud && item(t('menu.signOut.label'), t('menu.signOut.sub'), cloud.onSignOut)}
          </section>
        </div>
      )}
    </div>
  );
};
