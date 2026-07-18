import React from 'react';

interface ChartMenuCloud {
  onOpenLibrary: () => void;
  onPracticeSettings: () => void;
  onSignOut: () => void;
}

/*
 * Menu structure:
 *   Chart    — actions on the working chart (new / save / load PDF)
 *   Practice — the practice's records & identity (cloud only)
 *   Settings — app-level configuration and session
 */

interface ChartMenuProps {
  /** Triggered when the user confirms "New patient" — caller is
   *  responsible for resetting state + persistence. */
  onNewChart: () => void;
  /** Start a fresh visit for the same patient (present when a patient is
   *  loaded). Keeps identity, blanks clinical data. */
  onNewVisit?: () => void;
  /** Triggered when the user picks a PDF to load back into the app. */
  onLoadPdf: (file: File) => void;
  /** Open the AI settings dialog (BYOK API key, model preferences). */
  onOpenAiSettings: () => void;
  /** View the landing page without ending the session. */
  onGoHome?: () => void;
  /** Admin panel — present only for the admin account. */
  onOpenAdmin?: () => void;
  /** Cloud account actions — present only when Supabase is configured. */
  cloud?: ChartMenuCloud;
}

/**
 * Top-of-app menu that bundles the actions a clinician needs at chart
 * boundaries: starting fresh, loading a saved chart back in, and the AI
 * settings. Lives in the topbar where app-level actions are expected.
 */
export const ChartMenu: React.FC<ChartMenuProps> = ({ onNewChart, onNewVisit, onLoadPdf, onOpenAiSettings, onGoHome, onOpenAdmin, cloud }) => {
  const [open, setOpen] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
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

  const handleNewChart = () => {
    const confirmed = window.confirm(
      'Start a new patient? This clears the current chart. Save it first ' +
      '(top of the screen) if you want to keep any unsaved changes.'
    );
    if (!confirmed) return;
    setOpen(false);
    onNewChart();
  };

  const handleNewVisit = () => {
    if (!onNewVisit) return;
    const confirmed = window.confirm(
      'Start a new visit for this patient? Keeps the name and number, ' +
      'blanks the clinical chart, and saves as a separate dated visit.'
    );
    if (!confirmed) return;
    setOpen(false);
    onNewVisit();
  };

  const handleLoadClick = () => fileInputRef.current?.click();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onLoadPdf(file);
      setOpen(false);
    }
    e.target.value = '';
  };

  return (
    <div className={`chart-menu${open ? ' chart-menu--open' : ''}`} ref={containerRef}>
      <button
        type="button"
        className="chart-menu__trigger"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Open menu"
      >
        <span className="chart-menu__trigger-icon" aria-hidden="true">⋯</span>
        <span className="chart-menu__trigger-label">Menu</span>
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        onChange={handleFileSelect}
        className="chart-menu__file-input"
      />

      {open && (
        <div className="chart-menu__panel" role="menu">
          <section className="chart-menu__section">
            <header className="chart-menu__section-head">Chart</header>
            <button type="button" className="chart-menu__item" role="menuitem" onClick={handleNewChart}>
              <span className="chart-menu__item-body">
                <strong>New patient</strong>
                <span>Clear everything and start a brand-new patient.</span>
              </span>
            </button>
            {onNewVisit && (
              <button type="button" className="chart-menu__item" role="menuitem" onClick={handleNewVisit}>
                <span className="chart-menu__item-body">
                  <strong>New visit (same patient)</strong>
                  <span>Keep the patient, start a fresh dated chart.</span>
                </span>
              </button>
            )}
            <button type="button" className="chart-menu__item" role="menuitem" onClick={handleLoadClick}>
              <span className="chart-menu__item-body">
                <strong>Load chart PDF</strong>
                <span>Open a chart PDF made with this app to continue editing it.</span>
              </span>
            </button>
          </section>

          {cloud && (
            <section className="chart-menu__section">
              <header className="chart-menu__section-head">Practice</header>
              <button
                type="button"
                className="chart-menu__item"
                role="menuitem"
                onClick={() => { setOpen(false); cloud.onOpenLibrary(); }}
              >
                <span className="chart-menu__item-body">
                  <strong>My charts</strong>
                  <span>Browse and open your practice's saved charts.</span>
                </span>
              </button>
              <button
                type="button"
                className="chart-menu__item"
                role="menuitem"
                onClick={() => { setOpen(false); cloud.onPracticeSettings(); }}
              >
                <span className="chart-menu__item-body">
                  <strong>Practice</strong>
                  <span>Name, doctor line, logo, team, and password.</span>
                </span>
              </button>
            </section>
          )}

          {onOpenAdmin && (
            <section className="chart-menu__section">
              <header className="chart-menu__section-head">Admin</header>
              <button
                type="button"
                className="chart-menu__item"
                role="menuitem"
                onClick={() => { setOpen(false); onOpenAdmin(); }}
              >
                <span className="chart-menu__item-body">
                  <strong>Admin panel</strong>
                  <span>Manage practice accounts — passwords, profiles, deletion.</span>
                </span>
              </button>
            </section>
          )}

          <section className="chart-menu__section">
            <header className="chart-menu__section-head">Settings</header>
            <button
              type="button"
              className="chart-menu__item"
              role="menuitem"
              onClick={() => { setOpen(false); onOpenAiSettings(); }}
            >
              <span className="chart-menu__item-body">
                <strong>AI settings</strong>
                <span>Set the Anthropic API key and model for voice autofill.</span>
              </span>
            </button>
            {onGoHome && (
              <button
                type="button"
                className="chart-menu__item"
                role="menuitem"
                onClick={() => { setOpen(false); onGoHome(); }}
              >
                <span className="chart-menu__item-body">
                  <strong>Homepage</strong>
                  <span>View the product page — your chart stays right here.</span>
                </span>
              </button>
            )}
            {cloud && (
              <button
                type="button"
                className="chart-menu__item"
                role="menuitem"
                onClick={() => { setOpen(false); cloud.onSignOut(); }}
              >
                <span className="chart-menu__item-body">
                  <strong>Sign out</strong>
                  <span>Return to the homepage.</span>
                </span>
              </button>
            )}
          </section>
        </div>
      )}
    </div>
  );
};
