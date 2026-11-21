import React from 'react';
import ReactDOM from 'react-dom';
import './ChartCustomization.css';
import { useTranslation } from 'react-i18next';
import { APP_LANGUAGES, LANGUAGE_NAMES, isAppLanguage } from '../i18n/config';
import { useModalFocus } from '../hooks/useModalFocus';
import { useBackdropDismiss } from '../hooks/useBackdropDismiss';
import { AnesthesiaCustomEditor } from './AnesthesiaCustomEditor';
import { QuickCodesEditor } from './QuickCodesEditor';
import { ExamAreasEditor } from './ExamAreasEditor';
import { ExamLayoutEditor, type ExamLayoutDismiss, type ExamLayoutSettings } from './ExamLayoutEditor';
import { SCORE_PICKER_OPTIONS, BLOCK_ROW_OPTIONS, ChartPrefs, PERIO_FIELDS } from '../utils/chartSettings';
import { isNativeApp } from '../native/platform';
import { Sheet } from '../ios/Sheet';
import { ChartSettingsList } from './ChartSettingsList';
import { PATIENT_SETTINGS_GROUPS, USUAL_ADJUNCTS, USUAL_DRUGS, toggleField, useChartSettingsModel } from './useChartSettingsModel';
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
  examLayout?: ExamLayoutSettings;
  /** Open the matching category from a page's Customize button. Native
   *  retains its scoped list and All chart settings action. */
  section?: SettingsSection;
}

export type SettingsSection = 'patient' | 'exam' | 'anesthesia' | 'charting' | 'diagnosis' | 'procedure' | 'images';


export const ChartSettingsModal: React.FC<ChartSettingsModalProps> = (props) =>
  isNativeApp() ? <ChartSettingsSheet {...props} /> : <ChartSettingsDialog {...props} />;

/** The app: an iOS sheet holding the settings list. */
function ChartSettingsSheet({ onClose, prefs, followsAccount, onChange, examLayout, section }: ChartSettingsModalProps) {
  const { t } = useTranslation(['settings', 'app']);
  const examDismiss = React.useRef<ExamLayoutDismiss | null>(null);
  const [only, setOnly] = React.useState<SettingsSection | null>(section ?? null);
  return (
    <Sheet
      open
      onClose={onClose}
      confirmDismiss={() => examDismiss.current?.() ?? true}
      title={only ? t(`chart.sections.${only}`) : t('chart.title')}
      doneLabel={t('actions.done', { ns: 'common' })}
      onDone={async () => { if (await (examDismiss.current?.() ?? true)) onClose(); }}
      className="ios-chart-settings-sheet"
    >
      <ChartSettingsList prefs={prefs} followsAccount={followsAccount} onChange={onChange} only={only} onShowAll={() => setOnly(null)}
        examEditor={examLayout && <ExamLayoutEditor key={examLayout.scope} {...examLayout} dismissGuard={examDismiss} />} />
    </Sheet>
  );
}

/** The website's dialog. */
const ChartSettingsDialog: React.FC<ChartSettingsModalProps> = ({ onClose, prefs, followsAccount, onChange, examLayout, section }) => {
  const { t } = useTranslation(['settings', 'app']);
  const settingsId = React.useId();
  const [only, setOnly] = React.useState<SettingsSection>(section ?? 'charting');
  const examDismiss = React.useRef<ExamLayoutDismiss | null>(null);
  const [examSaveTarget, setExamSaveTarget] = React.useState<HTMLDivElement | null>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const categories: SettingsSection[] = ['patient', 'exam', 'anesthesia', 'charting', 'diagnosis', 'procedure', 'images'];
  const categoryLabel = (category: SettingsSection) => category === 'charting' || category === 'anesthesia'
    ? t(`chart.${category}.title`) : t(`chart.customization.categories.${category}`);
  const {
    shownColumns, toggleBlock, flushPendingDrafts,
    drugName, setDrugName, drugStrength, setDrugStrength, saveUsualDrug,
    adjunctName, setAdjunctName, adjunctStrength, setAdjunctStrength, saveUsualAdjunct,
  } = useChartSettingsModel(prefs, onChange, only, { saveDrugOnUnmount: true });
  const show = {
    charting: only === 'charting', beside: only === 'diagnosis', quickCodes: only === 'charting' || only === 'diagnosis',
    procedureQuickCodes: only === 'procedure',
    exam: only === 'exam', anesthesia: only === 'anesthesia', patient: only === 'patient',
    pdfGrid: only === 'images', pdfImages: only === 'images',
  };
  const close = React.useCallback(async () => {
    if (examDismiss.current && !(await examDismiss.current())) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.closest('.chart-settings__group')) active.blur();
    flushPendingDrafts();
    onClose();
  }, [flushPendingDrafts, onClose]);
  const selectCategory = (next: SettingsSection) => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.closest('.chart-settings__group')) active.blur();
    flushPendingDrafts();
    setOnly(next);
  };
  React.useLayoutEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }, [only]);
  const modalRef = useModalFocus<HTMLDivElement>(true);
  const backdrop = useBackdropDismiss(close);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      close();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [close]);

  return ReactDOM.createPortal(
    <div className="ai-settings-overlay" {...backdrop} role="dialog" aria-modal="true" aria-label={t('chart.title')}>
      <div className="ai-settings-modal chart-settings chart-customization" ref={modalRef} tabIndex={-1}>
        <header className="ai-settings-header">
          <h2>{t('chart.title')}</h2>
          <button type="button" className="pdf-preview-close" onClick={close} aria-label={t('actions.close', { ns: 'common' })}>×</button>
        </header>

        <div className="chart-customization__layout">
          <label className="chart-customization__mobile-category">
            <span>{t('chart.customization.navigation')}</span>
            <select value={only} onChange={(e) => selectCategory(e.target.value as SettingsSection)}>
              {categories.map((category) => <option key={category} value={category}>{categoryLabel(category)}</option>)}
            </select>
          </label>
          <nav className="chart-customization__nav" aria-label={t('chart.customization.navigation')}>
            {categories.map((category) => (
              <button key={category} type="button" aria-current={only === category ? 'page' : undefined}
                onClick={() => selectCategory(category)}>
                {categoryLabel(category)}
              </button>
            ))}
          </nav>
          <div className="ai-settings-body chart-settings__body chart-customization__content" ref={contentRef}>
            <div className="chart-customization__intro">
              <h3>{t(`chart.sections.${only}`)}</h3>
              {!(show.exam && examLayout) && <>
                {!show.exam && <p className="chart-settings__note">{show.patient ? t('chart.patient.visibilityNote') : t(`chart.customization.descriptions.${only}`)}</p>}
                <p className="chart-customization__scope">{followsAccount ? t('chart.noteAccount') : t('chart.noteBrowser')}</p>
              </>}
            </div>

          <section className="chart-settings__group" hidden={!show.charting}>
            <h3 className="ai-settings-subhead">{t('chart.customization.layout')}</h3>
            <label className="chart-settings__switch">
              <span><span id={`${settingsId}-autosave-label`}>{t('chart.autosave.label')}</span> <span className="chart-settings__hint" id={`${settingsId}-autosave-hint`}>{t('chart.autosave.hint')}</span></span>
              <input type="checkbox" role="switch" className="ios-switch" aria-labelledby={`${settingsId}-autosave-label`} aria-describedby={`${settingsId}-autosave-hint`}
                checked={prefs.autosave} onChange={(e) => onChange({ autosave: e.target.checked })} />
            </label>
            <fieldset className="chart-settings__field">
              <legend>{t('chart.charting.view')}</legend>
              <label className="chart-settings__choice choice-row">
                <input type="radio" name="chartingView" checked={prefs.chartingView === 'grid'} onChange={() => onChange({ chartingView: 'grid' })} />
                {t('chart.charting.grid')}
              </label>
              <label className="chart-settings__choice choice-row">
                <input type="radio" name="chartingView" checked={prefs.chartingView === 'tooth'} onChange={() => onChange({ chartingView: 'tooth' })} />
                {t('chart.charting.byTooth')}
              </label>
            </fieldset>

            <fieldset className="chart-settings__field">
              <legend>{t('chart.charting.pocket')}</legend>
              <label className="chart-settings__choice choice-row">
                <input type="radio" name="pocketMode" checked={prefs.pocketMode === 'tooth'} onChange={() => onChange({ pocketMode: 'tooth' })} />
                {t('chart.charting.pocketTooth')}
              </label>
              <label className="chart-settings__choice choice-row">
                <input type="radio" name="pocketMode" checked={prefs.pocketMode === 'root'} onChange={() => onChange({ pocketMode: 'root' })} />
                <span>{t('chart.charting.pocketRoot')} <span className="chart-settings__hint">{t('chart.charting.pocketRootHint')}</span></span>
              </label>
              <label className="chart-settings__choice choice-row">
                <input type="radio" name="pocketMode" checked={prefs.pocketMode === 'site'} onChange={() => onChange({ pocketMode: 'site' })} />
                <span>{t('chart.charting.pocketSite')} <span className="chart-settings__hint">{t('chart.charting.pocketSiteHint')}</span></span>
              </label>
            </fieldset>

            <fieldset className="chart-settings__field">
              <legend>{t('chart.charting.columns')}</legend>
              <p className="chart-settings__note">{t('chart.columnsFooter')}</p>
              <div className="chart-settings__grid">
                {PERIO_FIELDS.map((f) => {
                  const shown = !prefs.hiddenColumns.includes(f.key);
                  return (
                    <label key={f.key} className="chart-settings__choice choice-row">
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

            <h3 className="ai-settings-subhead chart-customization__subheading">{t('chart.customization.input')}</h3>
            <fieldset className="chart-settings__field">
              <legend>{t('chart.charting.space')}</legend>
              <label className="chart-settings__choice choice-row">
                <input type="radio" name="spaceKey" checked={prefs.spaceMovesDown} onChange={() => onChange({ spaceMovesDown: true })} />
                <span>{t('chart.charting.spaceDown')} <span className="chart-settings__hint">{t('chart.charting.spaceDownHint')}</span></span>
              </label>
              <label className="chart-settings__choice choice-row">
                <input type="radio" name="spaceKey" checked={!prefs.spaceMovesDown} onChange={() => onChange({ spaceMovesDown: false })} />
                {t('chart.charting.spaceType')}
              </label>
            </fieldset>

            <fieldset className="chart-settings__field">
              <legend>{t('chart.charting.scorePicker')}</legend>
              {SCORE_PICKER_OPTIONS.map((value) => (
                <label key={value} className="chart-settings__choice choice-row">
                  <input type="radio" name="scorePicker" checked={prefs.scorePicker === value} onChange={() => onChange({ scorePicker: value })} />
                  {t(`chart.charting.scorePickerOptions.${value}`)}
                </label>
              ))}
            </fieldset>

            <fieldset className="chart-settings__field">
              <legend>{t('chart.charting.scoreTap')}</legend>
              <label className="chart-settings__choice choice-row">
                <input type="radio" name="scoreTapMoves" checked={prefs.scoreTapMoves === 'finding'} onChange={() => onChange({ scoreTapMoves: 'finding' })} />
                <span>{t('chart.charting.scoreFinding')} <span className="chart-settings__hint">{t('chart.charting.scoreFindingHint')}</span></span>
              </label>
              <label className="chart-settings__choice choice-row">
                <input type="radio" name="scoreTapMoves" checked={prefs.scoreTapMoves === 'tooth'} onChange={() => onChange({ scoreTapMoves: 'tooth' })} />
                <span>{t('chart.charting.scoreTooth')} <span className="chart-settings__hint">{t('chart.charting.scoreToothHint')}</span></span>
              </label>
              <label className="chart-settings__choice choice-row">
                <input type="radio" name="scoreTapMoves" checked={prefs.scoreTapMoves === 'stay'} onChange={() => onChange({ scoreTapMoves: 'stay' })} />
                {t('chart.charting.scoreStay')}
              </label>
            </fieldset>


          </section>

          <section className="chart-settings__group" hidden={!show.beside}>
            <h3 className="ai-settings-subhead">{t('chart.beside.title')}</h3>
            <label className="chart-settings__switch">
              <span><span id={`${settingsId}-mirror-label`}>{t('chart.beside.show')}</span> <span className="chart-settings__hint" id={`${settingsId}-mirror-hint`}>{t('chart.beside.showHint')}</span></span>
              <input type="checkbox" role="switch" className="ios-switch" aria-labelledby={`${settingsId}-mirror-label`} aria-describedby={`${settingsId}-mirror-hint`}
                checked={prefs.mirrorToDiagnosis} onChange={(e) => onChange({ mirrorToDiagnosis: e.target.checked })} />
            </label>
            <fieldset className="chart-settings__field" disabled={!prefs.mirrorToDiagnosis}>
              <legend>{t('chart.beside.include')}</legend>
              <div className="chart-settings__grid">
                {shownColumns.map((f) => (
                  <label key={f.key} className="chart-settings__choice choice-row">
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

          <section className="chart-settings__group" hidden={!show.quickCodes}>
            <QuickCodesEditor codes={prefs.quickCodes} onChange={(quickCodes) => onChange({ quickCodes })} />
          </section>

          <section className="chart-settings__group" hidden={!show.procedureQuickCodes}>
            <QuickCodesEditor codes={prefs.procedureQuickCodes} onChange={(procedureQuickCodes) => onChange({ procedureQuickCodes })}
              title={t('chart.procedureQuickCodes.title')} description={t('chart.procedureQuickCodes.note')} placeholder={t('chart.procedureQuickCodes.placeholder')} />
          </section>

          <section className="chart-settings__group" hidden={!show.exam}>
            {examLayout ? <ExamLayoutEditor key={examLayout.scope} {...examLayout} dismissGuard={examDismiss} saveTarget={show.exam ? examSaveTarget : null} /> : (
              <>
                <h3 className="ai-settings-subhead">{t('chart.exam.title')}</h3>
                <ExamAreasEditor hiddenAreas={prefs.hiddenExamAreas} onHiddenChange={(hiddenExamAreas) => onChange({ hiddenExamAreas })} areas={prefs.customExamAreas} onChange={(customExamAreas) => onChange({ customExamAreas })} />
              </>
            )}
          </section>

          <section className="chart-settings__group chart-customization__modules" hidden={!show.anesthesia}>
            <fieldset className="chart-settings__field chart-customization__module">
              <legend>{t('chart.anesthesia.blocks')}</legend>
              <p className="chart-settings__note">{t('chart.anesthesia.blocksNote')}</p>
              <div className="chart-customization__choices">
                {BLOCK_ROW_OPTIONS.map((b) => (
                  <label key={b.id} className="chart-settings__choice choice-row">
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
            <fieldset className="chart-settings__field chart-customization__module">
              <legend>{t('chart.anesthesia.usual')}</legend>
              <p className="chart-settings__note">{t('chart.anesthesia.usualNote')}</p>
              <div className="chart-settings__drug">
                <label className="custom-def__control"><span>{t('chart.drugName')}</span>
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
                </label>
                <label className="custom-def__control"><span>{t('chart.drugStrength')}</span>
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
                </label>
                <datalist id="chart-settings-drugs">
                  {USUAL_DRUGS.map((d) => <option key={d} value={d} />)}
                </datalist>
              </div>
            </fieldset>
            <fieldset className="chart-settings__field chart-customization__module">
              <legend>{t('chart.anesthesia.adjunct')}</legend>
              <p className="chart-settings__note">{t('chart.anesthesia.adjunctNote')}</p>
              <div className="chart-settings__drug">
                <label className="custom-def__control"><span>{t('chart.drugName')}</span>
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
                </label>
                <label className="custom-def__control"><span>{t('chart.drugStrength')}</span>
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
                </label>
                <datalist id="chart-settings-adjuncts">
                  {USUAL_ADJUNCTS.map((d) => <option key={d} value={d} />)}
                </datalist>
              </div>
            </fieldset>
          </section>

          <section className="chart-settings__group chart-customization__modules" hidden={!show.patient}>
            {PATIENT_SETTINGS_GROUPS.map(({ id: group, fields }) => (
              <fieldset key={group} className="chart-settings__field chart-customization__module">
                <legend>{t(`patient.${group}`, { ns: 'forms' })}</legend>
                <div className="chart-customization__choices">
                  {fields.map((field) => (
                    <label key={field} className="chart-settings__choice choice-row">
                      <input type="checkbox" checked={!prefs.hiddenPatientFields.includes(field)} onChange={(e) => onChange({ hiddenPatientFields: toggleField(prefs.hiddenPatientFields, field, !e.target.checked) })} />
                      {t(`patient.${field}`, { ns: 'forms' })}
                    </label>
                  ))}
                  {group === 'visitGroup' && (
                    <label className="chart-settings__choice choice-row">
                      <input type="checkbox" checked={!prefs.hideRecheck} onChange={(e) => onChange({ hideRecheck: !e.target.checked })} />
                      {t('chart.customization.showRecheck')}
                    </label>
                  )}
                </div>
              </fieldset>
            ))}
          </section>

          {show.pdfImages && (
            <section className="chart-settings__group">
              <label className="chart-settings__imaging-language">
                {t('radiologyReport.editorLanguage', { ns: 'app' })}
                <select className="patient-form__input" value={prefs.imagingReportLanguage ?? ''} onChange={event => {
                  const value = event.target.value;
                  onChange({ imagingReportLanguage: isAppLanguage(value) ? value : null });
                }}>
                  <option value="">{t('radiologyReport.automaticLanguage', { ns: 'app' })}</option>
                  {APP_LANGUAGES.map(value => <option key={value} value={value}>{LANGUAGE_NAMES[value]}</option>)}
                </select>
              </label>
            </section>
          )}

          <section className="chart-settings__group" hidden={!(show.pdfGrid || show.pdfImages)}>
            <h3 className="ai-settings-subhead">{t('chart.pdf.title')}</h3>
            {show.pdfGrid && (
            <label className="chart-settings__choice choice-row">
              <input
                type="checkbox"
                checked={!prefs.mirrorToDiagnosis || prefs.pdfIncludeGrid}
                disabled={!prefs.mirrorToDiagnosis}
                onChange={(e) => onChange({ pdfIncludeGrid: e.target.checked })}
              />
              <span>{t('chart.pdf.grid')} <span className="chart-settings__hint">{t('chart.pdf.gridHint')}</span></span>
            </label>
            )}
            {show.pdfImages && (
            <label className="chart-settings__choice choice-row">
              <input type="checkbox" checked={prefs.pdfIncludeImages} onChange={(e) => onChange({ pdfIncludeImages: e.target.checked })} />
              <span>{t('chart.pdf.images')} <span className="chart-settings__hint">{t('chart.pdf.imagesHint')}</span></span>
            </label>
            )}
            {show.pdfImages && (
            <label className="chart-settings__choice choice-row">
              <input type="checkbox" checked={prefs.pdfIncludeRadiographicReport} onChange={(e) => onChange({ pdfIncludeRadiographicReport: e.target.checked })} />
              {t('chart.pdf.radiographicReport')}
            </label>
            )}
            {show.pdfImages && (
            <label className="chart-settings__choice choice-row">
              <input type="checkbox" checked={prefs.pdfIncludeCtReport} onChange={(e) => onChange({ pdfIncludeCtReport: e.target.checked })} />
              {t('chart.pdf.ctReport')}
            </label>
            )}
            {show.pdfImages && (
            <label className="chart-settings__choice choice-row">
              <input type="checkbox" checked={prefs.pdfIncludeDischarge} onChange={(e) => onChange({ pdfIncludeDischarge: e.target.checked })} />
              {t('chart.pdf.dischargeSections')}
            </label>
            )}
            {show.pdfImages && (
            <label className="chart-settings__choice choice-row">
              <input type="checkbox" checked={prefs.pdfIncludeCodesUsed} onChange={(e) => onChange({ pdfIncludeCodesUsed: e.target.checked })} />
              {t('chart.pdf.codesUsed')}
            </label>
            )}
          </section>
          </div>
        </div>
        <footer className="ai-settings-footer chart-customization__footer">
          <button type="button" className={show.exam && examLayout ? "ui-btn ui-btn--secondary" : "entry-grid__button entry-grid__button--topbar"} onClick={close}>{t('done')}</button>
          {show.exam && examLayout?.canEdit && <div ref={setExamSaveTarget} />}
        </footer>
      </div>
    </div>,
    document.body,
  );
};
