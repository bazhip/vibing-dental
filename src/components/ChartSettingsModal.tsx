import React from 'react';
import ReactDOM from 'react-dom';
import { useModalFocus } from '../hooks/useModalFocus';
import { useBackdropDismiss } from '../hooks/useBackdropDismiss';
import { DentalField } from '../types';
import { ChartPrefs, PERIO_FIELDS } from '../utils/chartSettings';

/**
 * Chart settings — per person: they follow your account to every device.
 * Each change applies (and saves) right away. Every default matches the
 * app's original layout.
 */

export interface ChartSettingsModalProps {
  onClose: () => void;
  prefs: ChartPrefs;
  /** Saved to the account (vs. only this browser, without one). */
  followsAccount: boolean;
  onChange: (patch: Partial<ChartPrefs>) => void;
}

const toggle = (list: DentalField[], key: DentalField, on: boolean): DentalField[] =>
  on ? Array.from(new Set([...list, key])) : list.filter((k) => k !== key);

export const ChartSettingsModal: React.FC<ChartSettingsModalProps> = ({ onClose, prefs, followsAccount, onChange }) => {
  const modalRef = useModalFocus<HTMLDivElement>(true);
  const backdrop = useBackdropDismiss(onClose);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      onClose();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const shownColumns = PERIO_FIELDS.filter((f) => !prefs.hiddenColumns.includes(f.key));

  return ReactDOM.createPortal(
    <div className="ai-settings-overlay" {...backdrop} role="dialog" aria-modal="true" aria-label="Chart settings">
      <div className="ai-settings-modal chart-settings" ref={modalRef} tabIndex={-1}>
        <header className="ai-settings-header">
          <h2>Chart settings</h2>
          <button type="button" className="pdf-preview-close" onClick={onClose} aria-label="Close">×</button>
        </header>

        <div className="ai-settings-body chart-settings__body">
          <p className="chart-settings__note">
            {followsAccount
              ? 'Just for you — these follow your account on every device. Changes save right away.'
              : 'Saved in this browser. Changes apply right away.'}
          </p>

          <section className="chart-settings__group">
            <h3 className="ai-settings-subhead">Charting</h3>
            <fieldset className="chart-settings__field">
              <legend>View</legend>
              <label className="chart-settings__choice">
                <input type="radio" name="chartingView" checked={prefs.chartingView === 'grid'} onChange={() => onChange({ chartingView: 'grid' })} />
                Grid
              </label>
              <label className="chart-settings__choice">
                <input type="radio" name="chartingView" checked={prefs.chartingView === 'tooth'} onChange={() => onChange({ chartingView: 'tooth' })} />
                By tooth
              </label>
            </fieldset>

            <fieldset className="chart-settings__field">
              <legend>Pocket depths</legend>
              <label className="chart-settings__choice">
                <input type="radio" name="pocketMode" checked={prefs.pocketMode === 'tooth'} onChange={() => onChange({ pocketMode: 'tooth' })} />
                One per tooth
              </label>
              <label className="chart-settings__choice">
                <input type="radio" name="pocketMode" checked={prefs.pocketMode === 'root'} onChange={() => onChange({ pocketMode: 'root' })} />
                One per root <span className="chart-settings__hint">M / D, or MB / MP / D on three-rooted teeth</span>
              </label>
            </fieldset>

            <fieldset className="chart-settings__field">
              <legend>Columns</legend>
              <div className="chart-settings__grid">
                {PERIO_FIELDS.map((f) => {
                  const shown = !prefs.hiddenColumns.includes(f.key);
                  return (
                    <label key={f.key} className="chart-settings__choice">
                      <input
                        type="checkbox"
                        checked={shown}
                        // Keep at least one column.
                        disabled={shown && shownColumns.length === 1}
                        onChange={(e) => onChange({ hiddenColumns: toggle(prefs.hiddenColumns, f.key, !e.target.checked) })}
                      />
                      {f.label}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          </section>

          <section className="chart-settings__group">
            <h3 className="ai-settings-subhead">Beside the teeth</h3>
            <label className="chart-settings__choice">
              <input type="checkbox" checked={prefs.mirrorToDiagnosis} onChange={(e) => onChange({ mirrorToDiagnosis: e.target.checked })} />
              Show findings on the Diagnosis diagram <span className="chart-settings__hint">(and in the PDF)</span>
            </label>
            <fieldset className="chart-settings__field" disabled={!prefs.mirrorToDiagnosis}>
              <legend>Include</legend>
              <div className="chart-settings__grid">
                {shownColumns.map((f) => (
                  <label key={f.key} className="chart-settings__choice">
                    <input
                      type="checkbox"
                      checked={prefs.besideTeeth.includes(f.key)}
                      onChange={(e) => onChange({ besideTeeth: toggle(prefs.besideTeeth, f.key, e.target.checked) })}
                    />
                    {f.label}
                  </label>
                ))}
              </div>
            </fieldset>
          </section>

          <section className="chart-settings__group">
            <h3 className="ai-settings-subhead">Patient page</h3>
            <label className="chart-settings__choice">
              <input type="checkbox" checked={prefs.hideRecheck} onChange={(e) => onChange({ hideRecheck: e.target.checked })} />
              Hide the Recheck due field
            </label>
          </section>

          <section className="chart-settings__group">
            <h3 className="ai-settings-subhead">PDF</h3>
            <label className="chart-settings__choice">
              <input
                type="checkbox"
                checked={!prefs.mirrorToDiagnosis || prefs.pdfIncludeGrid}
                disabled={!prefs.mirrorToDiagnosis}
                onChange={(e) => onChange({ pdfIncludeGrid: e.target.checked })}
              />
              Include the charting grid <span className="chart-settings__hint">(optional while findings are on the diagram)</span>
            </label>
            <label className="chart-settings__choice">
              <input type="checkbox" checked={prefs.pdfIncludeImages} onChange={(e) => onChange({ pdfIncludeImages: e.target.checked })} />
              Include images
            </label>
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
};
