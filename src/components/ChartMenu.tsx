import React from 'react';

interface ChartMenuProps {
  /** Triggered when the user confirms "New Chart" — caller is responsible
   *  for resetting state + persistence. */
  onNewChart: () => void;
  /** Triggered when the user picks a PDF to load back into the app. */
  onLoadPdf: (file: File) => void;
  /** Open the AI settings dialog (BYOK API key, model preferences). */
  onOpenAiSettings: () => void;
}

/**
 * Top-of-app menu that bundles the actions a clinician needs at chart
 * boundaries: starting fresh, loading a saved chart back in, and the AI
 * settings. Lives in the topbar where app-level actions are expected.
 */
export const ChartMenu: React.FC<ChartMenuProps> = ({ onNewChart, onLoadPdf, onOpenAiSettings }) => {
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
      'Start a new chart? This will clear all current chart data — patient info, ' +
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
        aria-label="Open chart menu"
      >
        <span className="chart-menu__trigger-icon" aria-hidden="true">⋯</span>
        <span className="chart-menu__trigger-label">Chart</span>
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
            <button type="button" className="chart-menu__item" role="menuitem" onClick={handleLoadClick}>
              <span className="chart-menu__item-body">
                <strong>Load chart PDF</strong>
                <span>Pick a previously generated PDF to rehydrate the form.</span>
              </span>
            </button>
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
          </section>
        </div>
      )}
    </div>
  );
};
