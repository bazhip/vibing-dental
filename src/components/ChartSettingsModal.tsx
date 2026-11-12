import React from 'react';
import ReactDOM from 'react-dom';
import { useModalFocus } from '../hooks/useModalFocus';
import { useBackdropDismiss } from '../hooks/useBackdropDismiss';
import { AnesthesiaCustomEditor } from './AnesthesiaCustomEditor';
import { DentalField } from '../types';
import { BLOCK_ROW_OPTIONS, BlockRowId, ChartPrefs, PERIO_FIELDS } from '../utils/chartSettings';

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
  /** Open on one page's settings only (that page's Customize button);
   *  "All chart settings" switches to everything. */
  section?: SettingsSection;
}

export type SettingsSection = 'patient' | 'anesthesia' | 'charting' | 'diagnosis' | 'images';

const SECTION_TITLES: Record<SettingsSection, string> = {
  patient: 'Patient page settings',
  anesthesia: 'Anesthesia settings',
  charting: 'Charting settings',
  diagnosis: 'Diagnosis settings',
  images: 'Images settings',
};

const toggle = (list: DentalField[], key: DentalField, on: boolean): DentalField[] =>
  on ? Array.from(new Set([...list, key])) : list.filter((k) => k !== key);

export const ChartSettingsModal: React.FC<ChartSettingsModalProps> = ({ onClose, prefs, followsAccount, onChange, section }) => {
  const [only, setOnly] = React.useState<SettingsSection | null>(section ?? null);
  const showAll = only === null;
  // Which groups a page's Customize shows (everything from the menu).
  const show = {
    charting: showAll || only === 'charting',
    beside: showAll || only === 'charting' || only === 'diagnosis',
    anesthesia: showAll || only === 'anesthesia',
    patient: showAll || only === 'patient',
    pdfGrid: showAll || only === 'charting',
    pdfImages: showAll || only === 'images',
  };
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

  // Usual anesthetic: typed locally, saved when a field loses focus (not
  // on every keystroke).
  const [drugName, setDrugName] = React.useState(prefs.usualDrug?.name ?? '');
  const [drugStrength, setDrugStrength] = React.useState(prefs.usualDrug?.concentration ?? '');
  const saveUsualDrug = () => {
    const name = drugName.trim();
    const next = name ? { name, concentration: drugStrength.replace(/%/g, '').trim() } : null;
    if (JSON.stringify(next) !== JSON.stringify(prefs.usualDrug)) onChange({ usualDrug: next });
  };
  const toggleBlock = (id: BlockRowId, shown: boolean) =>
    onChange({ hiddenBlocks: shown ? prefs.hiddenBlocks.filter((b) => b !== id) : Array.from(new Set([...prefs.hiddenBlocks, id])) });

  return ReactDOM.createPortal(
    <div className="ai-settings-overlay" {...backdrop} role="dialog" aria-modal="true" aria-label="Chart settings">
      <div className="ai-settings-modal chart-settings" ref={modalRef} tabIndex={-1}>
        <header className="ai-settings-header">
          <h2>{only ? SECTION_TITLES[only] : 'Chart settings'}</h2>
          <button type="button" className="pdf-preview-close" onClick={onClose} aria-label="Close">×</button>
        </header>

        <div className="ai-settings-body chart-settings__body">
          <p className="chart-settings__note">
            {followsAccount
              ? 'Just for you — these follow your account on every device. Changes save right away.'
              : 'Saved in this browser. Changes apply right away.'}
          </p>
          {!showAll && (
            <button type="button" className="diagram-view__action chart-settings__all" onClick={() => setOnly(null)}>
              All chart settings
            </button>
          )}

          {show.charting && (
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
              <legend>Space key in the grid</legend>
              <label className="chart-settings__choice">
                <input type="radio" name="spaceKey" checked={prefs.spaceMovesDown} onChange={() => onChange({ spaceMovesDown: true })} />
                Moves down to the next tooth <span className="chart-settings__hint">fast for calling out a run of depths</span>
              </label>
              <label className="chart-settings__choice">
                <input type="radio" name="spaceKey" checked={!prefs.spaceMovesDown} onChange={() => onChange({ spaceMovesDown: false })} />
                Types a space
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
          )}

          {show.beside && (
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
          )}

          {show.anesthesia && (
          <section className="chart-settings__group">
            <h3 className="ai-settings-subhead">Anesthesia</h3>
            <fieldset className="chart-settings__field">
              <legend>Nerve blocks shown</legend>
              <p className="chart-settings__note">A hidden block still shows on a chart where it has a dose.</p>
              <div className="chart-settings__grid">
                {BLOCK_ROW_OPTIONS.map((b) => (
                  <label key={b.id} className="chart-settings__choice">
                    <input
                      type="checkbox"
                      checked={!prefs.hiddenBlocks.includes(b.id)}
                      onChange={(e) => toggleBlock(b.id, e.target.checked)}
                    />
                    {b.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <AnesthesiaCustomEditor
              blocks={prefs.customBlocks}
              fields={prefs.customFields}
              onBlocksChange={(customBlocks) => onChange({ customBlocks })}
              onFieldsChange={(customFields) => onChange({ customFields })}
            />
            <fieldset className="chart-settings__field">
              <legend>Your usual anesthetic</legend>
              <p className="chart-settings__note">Offered as one tap on a chart with no anesthetic set.</p>
              <div className="chart-settings__drug">
                <input
                  type="text"
                  list="chart-settings-drugs"
                  className="patient-form__input"
                  placeholder="e.g. Bupivacaine"
                  aria-label="Usual anesthetic"
                  value={drugName}
                  onChange={(e) => setDrugName(e.target.value)}
                  onBlur={saveUsualDrug}
                />
                <span className="anesthesia-unit">
                  <input
                    type="text"
                    inputMode="decimal"
                    className="patient-form__input"
                    placeholder="0.5"
                    aria-label="Usual anesthetic strength (%)"
                    value={drugStrength}
                    onChange={(e) => setDrugStrength(e.target.value.replace(/%/g, ''))}
                    onBlur={saveUsualDrug}
                  />
                  <span className="anesthesia-unit__suffix" aria-hidden="true">%</span>
                </span>
                <datalist id="chart-settings-drugs">
                  {['Bupivacaine', 'Ropivacaine', 'Lidocaine', 'Mepivacaine'].map((d) => <option key={d} value={d} />)}
                </datalist>
              </div>
            </fieldset>
          </section>
          )}

          {show.patient && (
          <section className="chart-settings__group">
            <h3 className="ai-settings-subhead">Patient page</h3>
            <label className="chart-settings__choice">
              <input type="checkbox" checked={prefs.hideRecheck} onChange={(e) => onChange({ hideRecheck: e.target.checked })} />
              Hide the Recheck due field
            </label>
          </section>
          )}

          {(show.pdfGrid || show.pdfImages) && (
          <section className="chart-settings__group">
            <h3 className="ai-settings-subhead">PDF</h3>
            {show.pdfGrid && (
            <label className="chart-settings__choice">
              <input
                type="checkbox"
                checked={!prefs.mirrorToDiagnosis || prefs.pdfIncludeGrid}
                disabled={!prefs.mirrorToDiagnosis}
                onChange={(e) => onChange({ pdfIncludeGrid: e.target.checked })}
              />
              Include the charting grid <span className="chart-settings__hint">(optional while findings are on the diagram)</span>
            </label>
            )}
            {show.pdfImages && (
            <label className="chart-settings__choice">
              <input type="checkbox" checked={prefs.pdfIncludeImages} onChange={(e) => onChange({ pdfIncludeImages: e.target.checked })} />
              Include images <span className="chart-settings__hint">(4 per page, after the chart)</span>
            </label>
            )}
          </section>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};
