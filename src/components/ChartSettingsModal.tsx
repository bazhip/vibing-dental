import React from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useModalFocus } from '../hooks/useModalFocus';
import { useBackdropDismiss } from '../hooks/useBackdropDismiss';
import { AnesthesiaCustomEditor } from './AnesthesiaCustomEditor';
import { QuickCodesEditor } from './QuickCodesEditor';
import { ExamAreasEditor } from './ExamAreasEditor';
import { BLOCK_ROW_OPTIONS, ChartPrefs, PERIO_FIELDS } from '../utils/chartSettings';
import { isNativeApp } from '../native/platform';
import { Sheet } from '../ios/Sheet';
import { ChartSettingsList } from './ChartSettingsList';
import { USUAL_ADJUNCTS, USUAL_DRUGS, toggleField, useChartSettingsModel } from './useChartSettingsModel';
import { ADJUNCT_DRUGS, drugUnit, strengthHasUnit } from '../types';

/**
 * Chart settings — per person: they follow your account to every device.
 * Each change applies (and saves) right away. Every default matches the
 * app's original layout.
 *
 * In the iOS app the same settings render as an inset-grouped list
 * (ChartSettingsList): in a sheet here (a chart page's Customize), and as
 * a pushed screen from the Settings tab.
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

export type SettingsSection = 'patient' | 'exam' | 'anesthesia' | 'charting' | 'diagnosis' | 'images';


export const ChartSettingsModal: React.FC<ChartSettingsModalProps> = (props) =>
  isNativeApp() ? <ChartSettingsSheet {...props} /> : <ChartSettingsDialog {...props} />;

/** The app: an iOS sheet holding the settings list. */
function ChartSettingsSheet({ onClose, prefs, followsAccount, onChange, section }: ChartSettingsModalProps) {
  const { t } = useTranslation('settings');
  const [only, setOnly] = React.useState<SettingsSection | null>(section ?? null);
  return (
    <Sheet
      open
      onClose={onClose}
      title={only ? t(`chart.sections.${only}`) : t('chart.title')}
      doneLabel={t('actions.done', { ns: 'common' })}
      onDone={onClose}
      className="ios-chart-settings-sheet"
    >
      <ChartSettingsList prefs={prefs} followsAccount={followsAccount} onChange={onChange} only={only} onShowAll={() => setOnly(null)} />
    </Sheet>
  );
}

/** The website's dialog. */
const ChartSettingsDialog: React.FC<ChartSettingsModalProps> = ({ onClose, prefs, followsAccount, onChange, section }) => {
  const { t } = useTranslation('settings');
  const [only, setOnly] = React.useState<SettingsSection | null>(section ?? null);
  const {
    showAll, show, shownColumns, toggleBlock,
    drugName, setDrugName, drugStrength, setDrugStrength, saveUsualDrug,
    adjunctName, setAdjunctName, adjunctStrength, setAdjunctStrength, saveUsualAdjunct,
  } = useChartSettingsModel(prefs, onChange, only);
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

  return ReactDOM.createPortal(
    <div className="ai-settings-overlay" {...backdrop} role="dialog" aria-modal="true" aria-label={t('chart.title')}>
      <div className="ai-settings-modal chart-settings" ref={modalRef} tabIndex={-1}>
        <header className="ai-settings-header">
          <h2>{only ? t(`chart.sections.${only}`) : t('chart.title')}</h2>
          <button type="button" className="pdf-preview-close" onClick={onClose} aria-label={t('actions.close', { ns: 'common' })}>×</button>
        </header>

        <div className="ai-settings-body chart-settings__body">
          <p className="chart-settings__note">
            {followsAccount ? t('chart.noteAccount') : t('chart.noteBrowser')}
          </p>
          {!showAll && (
            <button type="button" className="diagram-view__action chart-settings__all" onClick={() => setOnly(null)}>
              {t('chart.all')}
            </button>
          )}

          {show.charting && (
          <section className="chart-settings__group">
            <h3 className="ai-settings-subhead">{t('chart.charting.title')}</h3>
            <fieldset className="chart-settings__field">
              <legend>{t('chart.charting.view')}</legend>
              <label className="chart-settings__choice">
                <input type="radio" name="chartingView" checked={prefs.chartingView === 'grid'} onChange={() => onChange({ chartingView: 'grid' })} />
                {t('chart.charting.grid')}
              </label>
              <label className="chart-settings__choice">
                <input type="radio" name="chartingView" checked={prefs.chartingView === 'tooth'} onChange={() => onChange({ chartingView: 'tooth' })} />
                {t('chart.charting.byTooth')}
              </label>
            </fieldset>

            <fieldset className="chart-settings__field">
              <legend>{t('chart.charting.pocket')}</legend>
              <label className="chart-settings__choice">
                <input type="radio" name="pocketMode" checked={prefs.pocketMode === 'tooth'} onChange={() => onChange({ pocketMode: 'tooth' })} />
                {t('chart.charting.pocketTooth')}
              </label>
              <label className="chart-settings__choice">
                <input type="radio" name="pocketMode" checked={prefs.pocketMode === 'root'} onChange={() => onChange({ pocketMode: 'root' })} />
                {t('chart.charting.pocketRoot')} <span className="chart-settings__hint">{t('chart.charting.pocketRootHint')}</span>
              </label>
            </fieldset>

            <fieldset className="chart-settings__field">
              <legend>{t('chart.charting.space')}</legend>
              <label className="chart-settings__choice">
                <input type="radio" name="spaceKey" checked={prefs.spaceMovesDown} onChange={() => onChange({ spaceMovesDown: true })} />
                {t('chart.charting.spaceDown')} <span className="chart-settings__hint">{t('chart.charting.spaceDownHint')}</span>
              </label>
              <label className="chart-settings__choice">
                <input type="radio" name="spaceKey" checked={!prefs.spaceMovesDown} onChange={() => onChange({ spaceMovesDown: false })} />
                {t('chart.charting.spaceType')}
              </label>
            </fieldset>

            <fieldset className="chart-settings__field">
              <legend>{t('chart.charting.scoreTap')}</legend>
              <label className="chart-settings__choice">
                <input type="radio" name="scoreTapMoves" checked={prefs.scoreTapMoves === 'finding'} onChange={() => onChange({ scoreTapMoves: 'finding' })} />
                {t('chart.charting.scoreFinding')} <span className="chart-settings__hint">{t('chart.charting.scoreFindingHint')}</span>
              </label>
              <label className="chart-settings__choice">
                <input type="radio" name="scoreTapMoves" checked={prefs.scoreTapMoves === 'tooth'} onChange={() => onChange({ scoreTapMoves: 'tooth' })} />
                {t('chart.charting.scoreTooth')} <span className="chart-settings__hint">{t('chart.charting.scoreToothHint')}</span>
              </label>
              <label className="chart-settings__choice">
                <input type="radio" name="scoreTapMoves" checked={prefs.scoreTapMoves === 'stay'} onChange={() => onChange({ scoreTapMoves: 'stay' })} />
                {t('chart.charting.scoreStay')}
              </label>
            </fieldset>

            <fieldset className="chart-settings__field">
              <legend>{t('chart.charting.columns')}</legend>
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
                        onChange={(e) => onChange({ hiddenColumns: toggleField(prefs.hiddenColumns, f.key, !e.target.checked) })}
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
            <h3 className="ai-settings-subhead">{t('chart.beside.title')}</h3>
            <label className="chart-settings__choice">
              <input type="checkbox" checked={prefs.mirrorToDiagnosis} onChange={(e) => onChange({ mirrorToDiagnosis: e.target.checked })} />
              {t('chart.beside.show')} <span className="chart-settings__hint">{t('chart.beside.showHint')}</span>
            </label>
            <fieldset className="chart-settings__field" disabled={!prefs.mirrorToDiagnosis}>
              <legend>{t('chart.beside.include')}</legend>
              <div className="chart-settings__grid">
                {shownColumns.map((f) => (
                  <label key={f.key} className="chart-settings__choice">
                    <input
                      type="checkbox"
                      checked={prefs.besideTeeth.includes(f.key)}
                      onChange={(e) => onChange({ besideTeeth: toggleField(prefs.besideTeeth, f.key, e.target.checked) })}
                    />
                    {f.label}
                  </label>
                ))}
              </div>
            </fieldset>
          </section>
          )}

          {show.quickCodes && (
          <section className="chart-settings__group">
            <QuickCodesEditor codes={prefs.quickCodes} onChange={(quickCodes) => onChange({ quickCodes })} />
          </section>
          )}

          {show.exam && (
          <section className="chart-settings__group">
            <h3 className="ai-settings-subhead">{t('chart.exam.title')}</h3>
            <ExamAreasEditor areas={prefs.customExamAreas} onChange={(customExamAreas) => onChange({ customExamAreas })} />
          </section>
          )}

          {show.anesthesia && (
          <section className="chart-settings__group">
            <h3 className="ai-settings-subhead">{t('chart.anesthesia.title')}</h3>
            <fieldset className="chart-settings__field">
              <legend>{t('chart.anesthesia.blocks')}</legend>
              <p className="chart-settings__note">{t('chart.anesthesia.blocksNote')}</p>
              <div className="chart-settings__grid">
                {BLOCK_ROW_OPTIONS.map((b) => (
                  <label key={b.id} className="chart-settings__choice">
                    <input
                      type="checkbox"
                      checked={!prefs.hiddenBlocks.includes(b.id)}
                      onChange={(e) => toggleBlock(b.id, e.target.checked)}
                    />
                    {t(`chart.anesthesia.blockNames.${b.id}`)}
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
              <legend>{t('chart.anesthesia.usual')}</legend>
              <p className="chart-settings__note">{t('chart.anesthesia.usualNote')}</p>
              <div className="chart-settings__drug">
                <input
                  type="text"
                  list="chart-settings-drugs"
                  className="patient-form__input"
                  placeholder={t('chart.anesthesia.drugPlaceholder')}
                  aria-label={t('chart.anesthesia.drugAria')}
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
                    aria-label={t('chart.anesthesia.strengthAria')}
                    value={drugStrength}
                    onChange={(e) => setDrugStrength(e.target.value.replace(/%/g, ''))}
                    onBlur={saveUsualDrug}
                  />
                  <span className="anesthesia-unit__suffix" aria-hidden="true">%</span>
                </span>
                <datalist id="chart-settings-drugs">
                  {USUAL_DRUGS.map((d) => <option key={d} value={d} />)}
                </datalist>
              </div>
              <p className="chart-settings__note">{t('chart.anesthesia.adjunctNote')}</p>
              <div className="chart-settings__drug">
                <input
                  type="text"
                  list="chart-settings-adjuncts"
                  className="patient-form__input"
                  placeholder={t('chart.anesthesia.adjunctPlaceholder')}
                  aria-label={t('chart.anesthesia.adjunctAria')}
                  value={adjunctName}
                  onChange={(e) => setAdjunctName(e.target.value)}
                  onBlur={saveUsualAdjunct}
                />
                <span className="anesthesia-unit">
                  <input
                    type="text"
                    inputMode="decimal"
                    className="patient-form__input"
                    placeholder="0.3"
                    aria-label={t('chart.anesthesia.adjunctStrengthAria')}
                    value={adjunctStrength}
                    onChange={(e) => setAdjunctStrength(e.target.value.replace(/%/g, ''))}
                    onBlur={saveUsualAdjunct}
                  />
                  {!strengthHasUnit(adjunctStrength) && <span className="anesthesia-unit__suffix" aria-hidden="true">{adjunctName.trim() ? drugUnit(adjunctName) : drugUnit(ADJUNCT_DRUGS[0])}</span>}
                </span>
                <datalist id="chart-settings-adjuncts">
                  {USUAL_ADJUNCTS.map((d) => <option key={d} value={d} />)}
                </datalist>
              </div>
            </fieldset>
          </section>
          )}

          {show.patient && (
          <section className="chart-settings__group">
            <h3 className="ai-settings-subhead">{t('chart.patient.title')}</h3>
            <label className="chart-settings__choice">
              <input type="checkbox" checked={prefs.hideRecheck} onChange={(e) => onChange({ hideRecheck: e.target.checked })} />
              {t('chart.patient.hideRecheck')}
            </label>
          </section>
          )}

          {(show.pdfGrid || show.pdfImages) && (
          <section className="chart-settings__group">
            <h3 className="ai-settings-subhead">{t('chart.pdf.title')}</h3>
            {show.pdfGrid && (
            <label className="chart-settings__choice">
              <input
                type="checkbox"
                checked={!prefs.mirrorToDiagnosis || prefs.pdfIncludeGrid}
                disabled={!prefs.mirrorToDiagnosis}
                onChange={(e) => onChange({ pdfIncludeGrid: e.target.checked })}
              />
              {t('chart.pdf.grid')} <span className="chart-settings__hint">{t('chart.pdf.gridHint')}</span>
            </label>
            )}
            {show.pdfImages && (
            <label className="chart-settings__choice">
              <input type="checkbox" checked={prefs.pdfIncludeImages} onChange={(e) => onChange({ pdfIncludeImages: e.target.checked })} />
              {t('chart.pdf.images')} <span className="chart-settings__hint">{t('chart.pdf.imagesHint')}</span>
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
