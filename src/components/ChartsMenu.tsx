import React from 'react';
import { useTranslation } from 'react-i18next';

interface ChartsMenuProps {
  /** Open the My charts library (search / open any patient). */
  onOpenLibrary: () => void;
  /** Actions for the patient on screen — shown once the chart is saved. */
  thisPatient?: {
    name: string;
    onNewVisit: () => void;
    onHistory: () => void;
  };
}

const ITEM_SELECTOR = '.chart-menu__item';

/**
 * "My charts ▾" in the topbar: the library, plus actions for the patient
 * on screen (new visit, version history) — kept behind one menu so the
 * header shows a single, consistent set of buttons. Same keyboard model
 * as the Settings menu: Esc / click outside closes, arrows move.
 */
export function ChartsMenu({ onOpenLibrary, thisPatient }: ChartsMenuProps) {
  const { t } = useTranslation('app');
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);

  const close = React.useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const onDocPointer = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        close(!!containerRef.current.contains(document.activeElement));
      }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(true); };
    document.addEventListener('pointerdown', onDocPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDocPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  const items = () => Array.from(panelRef.current?.querySelectorAll<HTMLButtonElement>(ITEM_SELECTOR) ?? []);
  const focusItem = (i: number) => {
    const list = items();
    if (list.length) list[(i + list.length) % list.length].focus();
  };
  const pendingFocus = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (open && pendingFocus.current !== null) {
      focusItem(pendingFocus.current);
      pendingFocus.current = null;
    }
  }, [open]);

  const onTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const target = e.key === 'ArrowDown' ? 0 : -1;
    if (open) focusItem(target);
    else { pendingFocus.current = target; setOpen(true); }
  };
  const onPanelKeyDown = (e: React.KeyboardEvent) => {
    const list = items();
    const idx = list.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); focusItem(idx + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); focusItem(idx < 0 ? -1 : idx - 1); }
    else if (e.key === 'Home') { e.preventDefault(); focusItem(0); }
    else if (e.key === 'End') { e.preventDefault(); focusItem(-1); }
  };
  const onBlur = (e: React.FocusEvent) => {
    if (open && e.relatedTarget && !containerRef.current?.contains(e.relatedTarget as Node)) setOpen(false);
  };

  const item = (label: string, sub: string, onClick: () => void) => (
    <button type="button" className="chart-menu__item" onClick={() => { setOpen(false); onClick(); }}>
      <span className="chart-menu__item-body">
        <strong>{label}</strong>
        <span>{sub}</span>
      </span>
    </button>
  );

  return (
    <div className={`chart-menu charts-menu${open ? ' chart-menu--open' : ''}`} ref={containerRef} onBlur={onBlur}>
      <button
        ref={triggerRef}
        type="button"
        className="chart-menu__trigger topbar-library-btn"
        data-tour="library"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onTriggerKeyDown}
      >
        <span className="topbar-label-long">{t('topbar.myCharts')}</span>
        <span className="topbar-label-short">{t('topbar.myChartsShort')}</span>
        <svg className="charts-menu__caret" viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
          <path d="M2.5 4.5L6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="chart-menu__panel" ref={panelRef} onKeyDown={onPanelKeyDown}>
          {thisPatient && (
            <section className="chart-menu__section">
              <header className="chart-menu__section-head">{thisPatient.name || t('chartsMenu.thisPatient')}</header>
              {item(t('chartsMenu.newVisit'), t('chartsMenu.newVisitHint'), thisPatient.onNewVisit)}
              {item(t('chartsMenu.history'), t('chartsMenu.historyHint'), thisPatient.onHistory)}
            </section>
          )}
          <section className="chart-menu__section">
            <header className="chart-menu__section-head">{t('chartsMenu.allPatients')}</header>
            {item(t('chartsMenu.openLibrary'), t('chartsMenu.openLibraryHint'), onOpenLibrary)}
          </section>
        </div>
      )}
    </div>
  );
}
