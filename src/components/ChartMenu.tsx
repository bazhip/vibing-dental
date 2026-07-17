import React from 'react';

interface ChartMenuCloud {
  onSaveChart: () => void;
  autosaveEnabled: boolean;
  onToggleAutosave: () => void;
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
  /** Triggered when the user confirms "New Chart" — caller is responsible
   *  for resetting state + persistence. */
  onNewChart: () => void;
  /** Triggered when the user picks a PDF to load back into the app. */
  onLoadPdf: (file: File) => void;
  /** Open the AI settings dialog (BYOK API key, model preferences). */
  onOpenAiSettings: () => void;
  /** View the landing page without ending the session. */
  onGoHome?: () => void;
  /** Cloud account actions — present only when Supabase is configured. */
  cloud?: ChartMenuCloud;
}

/**
 * Top-of-app menu that bundles the actions a clinician needs at chart
 * boundaries: starting fresh, loading a saved chart back in, and the AI
 * settings. Lives in the topbar where app-level actions are expected.
 */
export const ChartMenu: React.FC<ChartMenuProps> = ({ onNewChart, onLoadPdf, onOpenAiSettings, onGoHome, cloud }) => {
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
    // With autosave on, the outgoing chart already lives in My charts —
    // saying "cannot be undone" there would be scary and wrong, and
    // wrong warnings teach people to ignore dialogs.
    const confirmed = window.confirm(
      cloud && cloud.autosaveEnabled
        ? 'Start a new chart? Your current chart stays saved in My charts.'
        : 'Start a new chart? This will clear all current chart data — patient info, ' +
          'tooth grid, exam, anesthesia, diagrams, and treatment report. ' +
          'This cannot be undone.'
    );
    if (!confirmed) return;
    setOpen(false);
    onNewChart();
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
                <strong>New chart</strong>
                <span>Clear all data and start fresh.</span>
              </span>
            </button>
            {cloud && (
              <button
                type="button"
                className="chart-menu__item"
                role="menuitem"
                onClick={() => { setOpen(false); cloud.onSaveChart(); }}
              >
                <span className="chart-menu__item-body">
                  <strong>Save chart</strong>
                  <span>Charts autosave — this forces a save right now.</span>
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
                  <strong>Practice settings</strong>
                  <span>Name, doctor line, logo, and password.</span>
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
            {cloud && (
              <button
                type="button"
                className="chart-menu__item"
                role="menuitemcheckbox"
                aria-checked={cloud.autosaveEnabled}
                onClick={cloud.onToggleAutosave}
              >
                <span className="chart-menu__item-body">
                  <strong>Autosave — {cloud.autosaveEnabled ? 'On' : 'Off'}</strong>
                  <span>Save to the cloud automatically as you edit.</span>
                </span>
              </button>
            )}
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
