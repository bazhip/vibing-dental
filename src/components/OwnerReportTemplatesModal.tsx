import React from 'react';
import { useTranslation } from 'react-i18next';
import { useModalFocus } from '../hooks/useModalFocus';
import {
  BuiltInSectionId,
  CustomReportSection,
  MAX_TEMPLATES,
  OwnerReportConfig,
  OwnerReportTemplate,
  PLACEHOLDERS,
  ReportSectionConfig,
  defaultSectionTitle,
  defaultTemplate,
  isCustomSection,
  newId,
  normalizeConfig,
  placeholderTitle,
  sectionLabel,
} from '../utils/ownerReportConfig';
import { REPORT_LOCALES, ReportLocale, appReportLocale, reportStrings } from '../utils/ownerReportI18n';
import { buildOwnerReportModel } from '../utils/ownerReport';
import { buildOwnerReportPdfBytes, OwnerReportBranding } from '../utils/ownerReportPdf';
import { sampleOwnerReportSnapshot } from '../utils/ownerReportSample';
import './OwnerReportTemplatesModal.css';

interface OwnerReportTemplatesModalProps {
  open: boolean;
  onClose: () => void;
  config: OwnerReportConfig;
  onSave: (config: OwnerReportConfig) => Promise<void>;
  /** Practice owners edit; everyone else gets a read-only view. */
  canEdit: boolean;
  /** Role still loading — suppress the read-only note until known. */
  roleKnown: boolean;
  branding: OwnerReportBranding;
}

const DATE_FORMATS = ['iso', 'long'] as const;

type TextField = HTMLInputElement | HTMLTextAreaElement;

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/**
 * Owner report templates editor (opened from Practice settings): a list
 * of templates on the left, the selected template on the right — title,
 * intro, section order/visibility/headings, custom text sections,
 * home-care tips, closing note, footer, display options, and language.
 * Edits stay in a draft until Save; Cancel/Escape/backdrop ask before
 * discarding. Preview renders the PDF with a sample visit.
 */
export const OwnerReportTemplatesModal: React.FC<OwnerReportTemplatesModalProps> = ({
  open,
  onClose,
  config,
  onSave,
  canEdit,
  roleKnown,
  branding,
}) => {
  const { t } = useTranslation('reportui');
  const [draft, setDraft] = React.useState<OwnerReportConfig>(() => clone(config));
  const [selectedId, setSelectedId] = React.useState(config.defaultTemplateId);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = React.useState(false);
  const modalRef = useModalFocus(open && !previewUrl);
  // The text field the placeholder chips insert into.
  const activeField = React.useRef<{ el: TextField; set: (value: string) => void } | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setDraft(clone(config));
    setSelectedId(config.defaultTemplateId);
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const baseline = React.useMemo(() => JSON.stringify(config), [config]);
  const dirty = open && JSON.stringify(draft) !== baseline;

  const requestClose = React.useCallback(() => {
    if (busy) return;
    if (dirty && !window.confirm(t('templates.discardConfirm'))) return;
    onClose();
  }, [busy, dirty, onClose, t]);

  const closePreview = React.useCallback(() => {
    setPreviewUrl((url) => {
      if (url) URL.revokeObjectURL(url);
      return null;
    });
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (previewUrl) closePreview();
      else requestClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, previewUrl, closePreview, requestClose]);

  // Leaving the page with unsaved template edits asks first.
  React.useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  React.useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  if (!open) return null;

  const selected = draft.templates.find((tpl) => tpl.id === selectedId) ?? draft.templates[0];
  const strings = reportStrings(selected.language);

  // ---- Draft mutation helpers ---------------------------------------------
  const updateTemplate = (patch: Partial<OwnerReportTemplate> | ((tpl: OwnerReportTemplate) => Partial<OwnerReportTemplate>)) => {
    setDraft((d) => ({
      ...d,
      templates: d.templates.map((tpl) =>
        tpl.id === selected.id ? { ...tpl, ...(typeof patch === 'function' ? patch(tpl) : patch) } : tpl
      ),
    }));
  };
  const updateSection = (id: string, patch: Partial<CustomReportSection>) => {
    updateTemplate((tpl) => ({
      sections: tpl.sections.map((s) => (s.id === id ? ({ ...s, ...patch } as ReportSectionConfig) : s)),
    }));
  };
  const moveSection = (index: number, delta: number) => {
    updateTemplate((tpl) => {
      const next = [...tpl.sections];
      const target = index + delta;
      if (target < 0 || target >= next.length) return {};
      [next[index], next[target]] = [next[target], next[index]];
      return { sections: next };
    });
  };
  const addCustomSection = () => {
    updateTemplate((tpl) => ({
      sections: [...tpl.sections, { id: newId('custom-'), enabled: true, title: '', body: '' }],
    }));
  };
  const removeSection = (id: string) => {
    updateTemplate((tpl) => ({ sections: tpl.sections.filter((s) => s.id !== id) }));
  };
  const setLanguage = (language: ReportLocale) => {
    updateTemplate((tpl) => ({
      language,
      // Swap the header title along with the language unless it was customized.
      title: tpl.title === reportStrings(tpl.language).defaultTitle ? reportStrings(language).defaultTitle : tpl.title,
    }));
  };

  const addTemplate = (base?: OwnerReportTemplate) => {
    if (draft.templates.length >= MAX_TEMPLATES) return;
    const fresh = base
      ? { ...clone(base), id: newId('tpl-'), name: t('templates.copyName', { name: base.name }) }
      : { ...defaultTemplate(appReportLocale()), id: newId('tpl-'), name: t('templates.newName') };
    setDraft((d) => ({ ...d, templates: [...d.templates, fresh] }));
    setSelectedId(fresh.id);
  };
  const deleteTemplate = () => {
    if (draft.templates.length <= 1) return;
    if (!window.confirm(t('templates.deleteConfirm', { name: selected.name }))) return;
    setDraft((d) => {
      const templates = d.templates.filter((tpl) => tpl.id !== selected.id);
      const defaultTemplateId = d.defaultTemplateId === selected.id ? templates[0].id : d.defaultTemplateId;
      return { templates, defaultTemplateId };
    });
    setSelectedId(draft.templates.find((tpl) => tpl.id !== selected.id)!.id);
  };

  // ---- Placeholder chips -----------------------------------------------------
  const track = (set: (value: string) => void) => ({
    onFocus: (e: React.FocusEvent<TextField>) => {
      activeField.current = { el: e.currentTarget, set };
    },
  });
  const insertToken = (token: string) => {
    const active = activeField.current;
    if (!active || !active.el.isConnected) {
      updateTemplate((tpl) => ({ introTemplate: `${tpl.introTemplate}${token}` }));
      return;
    }
    const { el, set } = active;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    set(`${el.value.slice(0, start)}${token}${el.value.slice(end)}`);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  // ---- Save / preview ---------------------------------------------------------
  const handleSave = async () => {
    setBusy(true);
    setError('');
    try {
      const cleaned = normalizeConfig({
        ...draft,
        templates: draft.templates.map((tpl) => ({
          ...tpl,
          name: tpl.name.trim() || t('templates.untitled'),
          homecareTips: tpl.homecareTips.map((tip) => tip.trim()).filter(Boolean),
        })),
      });
      await onSave(cleaned);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('templates.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  const handlePreview = async () => {
    setPreviewBusy(true);
    setError('');
    try {
      const model = buildOwnerReportModel(sampleOwnerReportSnapshot(), {
        template: selected,
        practiceName: branding.practiceName,
        doctorName: branding.doctorName,
      });
      const bytes = await buildOwnerReportPdfBytes(model, branding, []);
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
      setPreviewUrl(url);
    } catch (e) {
      console.error(e);
      setError(t('templates.previewFailed'));
    } finally {
      setPreviewBusy(false);
    }
  };

  // The heading used when the custom one is left blank — the standard
  // wording for the template's language (pet-dependent headings show as
  // their {pet} placeholder, which custom headings also accept).
  const defaultHeading = (id: BuiltInSectionId) =>
    selected.language === 'en' ? defaultSectionTitle(id) : strings.headings[id]('{pet}');
  const generatedTips = strings.homecareTips;
  const introPlaceholder = strings.intro('{pet}');

  return (
    <>
      <div className="ai-settings-overlay" onClick={requestClose} role="dialog" aria-modal="true" aria-labelledby="report-templates-title">
        <div className="ai-settings-modal report-templates" ref={modalRef} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
          <header className="ai-settings-header">
            <h2 id="report-templates-title">{t('templates.title')}</h2>
            <button type="button" className="pdf-preview-close" onClick={requestClose} aria-label={t('actions.close', { ns: 'common' })}>
              ×
            </button>
          </header>

          <div className="report-templates__body">
            {/* ---- Template list ------------------------------------------- */}
            <nav className="report-templates__list" aria-label={t('templates.listLabel')}>
              <ul>
                {draft.templates.map((tpl) => (
                  <li key={tpl.id}>
                    <button
                      type="button"
                      className={`report-templates__item${tpl.id === selected.id ? ' report-templates__item--on' : ''}`}
                      aria-current={tpl.id === selected.id ? 'true' : undefined}
                      onClick={() => setSelectedId(tpl.id)}
                    >
                      <span className="report-templates__item-name">{tpl.name || t('templates.untitled')}</span>
                      <span className="report-templates__item-meta">
                        {tpl.id === draft.defaultTemplateId && <span className="report-templates__badge">{t('templates.badgeDefault')}</span>}
                        {tpl.language !== 'en' && <span className="report-templates__lang">{tpl.language.toUpperCase()}</span>}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {canEdit && (
                <div className="report-templates__list-actions">
                  <button type="button" className="diagram-view__action" onClick={() => addTemplate()} disabled={draft.templates.length >= MAX_TEMPLATES}>
                    {t('templates.new')}
                  </button>
                  <button type="button" className="diagram-view__action" onClick={() => addTemplate(selected)} disabled={draft.templates.length >= MAX_TEMPLATES}>
                    {t('actions.duplicate', { ns: 'common' })}
                  </button>
                  <button
                    type="button"
                    className="diagram-view__action"
                    onClick={() => setDraft((d) => ({ ...d, defaultTemplateId: selected.id }))}
                    disabled={selected.id === draft.defaultTemplateId}
                  >
                    {t('templates.setDefault')}
                  </button>
                  <button
                    type="button"
                    className="diagram-view__action diagram-view__action--danger"
                    onClick={deleteTemplate}
                    disabled={draft.templates.length <= 1}
                  >
                    {t('actions.delete', { ns: 'common' })}
                  </button>
                </div>
              )}
            </nav>

            {/* ---- Editor ---------------------------------------------------- */}
            <div className="report-templates__editor">
              {roleKnown && !canEdit && (
                <p className="login-notice" role="status">
                  {t('templates.readOnly')}
                </p>
              )}
              <fieldset className="report-templates__fieldset" disabled={!canEdit || busy}>
                <section className="ai-settings-section">
                  <h3 className="ai-settings-subhead">{t('templates.basics')}</h3>
                  <div className="report-templates__row">
                    <label className="patient-form__label">
                      {t('templates.nameLabel')}
                      <input
                        type="text"
                        className="patient-form__input"
                        value={selected.name}
                        maxLength={80}
                        onChange={(e) => updateTemplate({ name: e.target.value })}
                      />
                    </label>
                    <label className="patient-form__label">
                      {t('templates.titleLabel')}
                      <input
                        type="text"
                        className="patient-form__input"
                        value={selected.title}
                        maxLength={80}
                        placeholder={t('templates.titlePlaceholder')}
                        onChange={(e) => updateTemplate({ title: e.target.value })}
                        {...track((v) => updateTemplate({ title: v }))}
                      />
                    </label>
                  </div>
                  <div className="report-templates__row">
                    <label className="patient-form__label">
                      {t('templates.languageLabel')}
                      <select
                        className="patient-form__input"
                        value={selected.language}
                        onChange={(e) => setLanguage(e.target.value as ReportLocale)}
                      >
                        {REPORT_LOCALES.map((loc) => (
                          <option key={loc} value={loc}>{t(`languages.${loc}`)}</option>
                        ))}
                      </select>
                    </label>
                    <label className="patient-form__label">
                      {t('templates.datesLabel')}
                      <select
                        className="patient-form__input"
                        value={selected.dateFormat}
                        onChange={(e) => updateTemplate({ dateFormat: e.target.value === 'long' ? 'long' : 'iso' })}
                      >
                        {DATE_FORMATS.map((format) => (
                          <option key={format} value={format}>
                            {format === 'iso' ? t('templates.datesIso') : t('templates.datesLong')}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <p className="patient-form__hint">
                    {t('templates.languageHint')}
                  </p>
                  <label className="report-templates__check">
                    <input
                      type="checkbox"
                      checked={selected.showToothNumbers}
                      onChange={(e) => updateTemplate({ showToothNumbers: e.target.checked })}
                    />
                    <span>
                      {t('templates.showToothNumbers')}{' '}
                      <span className="patient-form__hint">
                        {t('templates.toothNumbersExample', {
                          with: `${strings.toothName(1, 4, false)} (104)`,
                          without: strings.toothName(1, 4, false),
                        })}
                      </span>
                    </span>
                  </label>
                  <label className="report-templates__check">
                    <input
                      type="checkbox"
                      checked={selected.showGrades}
                      onChange={(e) => updateTemplate({ showGrades: e.target.checked })}
                    />
                    <span>
                      {t('templates.showGrades')}{' '}
                      <span className="patient-form__hint">
                        {t('templates.gradesExample', {
                          with: strings.fieldPhrases.calculus('2'),
                          without: strings.fieldPlain.calculus,
                        })}
                      </span>
                    </span>
                  </label>
                </section>

                <section className="ai-settings-section">
                  <h3 className="ai-settings-subhead">{t('templates.summaryTitle')}</h3>
                  <div className="report-templates__chips" role="group" aria-label={t('templates.insertLabel')}>
                    {PLACEHOLDERS.map((p) => (
                      <button
                        key={p}
                        type="button"
                        className="report-templates__chip"
                        title={placeholderTitle(p)}
                        // Keep focus (and the caret) in the field being edited.
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => insertToken(`{${p}}`)}
                      >
                        {`{${p}}`}
                      </button>
                    ))}
                  </div>
                  <p className="patient-form__hint">
                    {t('templates.insertHelp')}
                  </p>
                  <textarea
                    className="patient-form__input report-templates__textarea"
                    rows={4}
                    aria-label={t('templates.summaryAria')}
                    value={selected.introTemplate}
                    placeholder={introPlaceholder}
                    onChange={(e) => updateTemplate({ introTemplate: e.target.value })}
                    {...track((v) => updateTemplate({ introTemplate: v }))}
                  />
                  <span className="patient-form__hint">{t('templates.summaryEmpty')}</span>
                </section>

                <section className="ai-settings-section">
                  <h3 className="ai-settings-subhead">{t('templates.sectionsTitle')}</h3>
                  <p className="patient-form__hint">
                    {t('templates.sectionsHint')}
                  </p>
                  <ol className="report-templates__sections">
                    {selected.sections.map((section, index) => {
                      const custom = isCustomSection(section);
                      return (
                        <li key={section.id} className={`report-templates__section${section.enabled ? '' : ' report-templates__section--off'}`}>
                          <div className="report-templates__section-head">
                            <label className="report-templates__check report-templates__check--inline">
                              <input
                                type="checkbox"
                                checked={section.enabled}
                                onChange={(e) => updateSection(section.id, { enabled: e.target.checked })}
                              />
                              <span className="report-templates__section-name">
                                {custom ? t('templates.customText') : sectionLabel(section.id as BuiltInSectionId)}
                              </span>
                            </label>
                            <span className="report-templates__section-actions">
                              <button
                                type="button"
                                className="diagram-view__action report-templates__icon"
                                onClick={() => moveSection(index, -1)}
                                disabled={index === 0}
                                aria-label={t('templates.moveUp')}
                                title={t('templates.moveUp')}
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                className="diagram-view__action report-templates__icon"
                                onClick={() => moveSection(index, 1)}
                                disabled={index === selected.sections.length - 1}
                                aria-label={t('templates.moveDown')}
                                title={t('templates.moveDown')}
                              >
                                ↓
                              </button>
                              {custom && (
                                <button
                                  type="button"
                                  className="diagram-view__action diagram-view__action--danger"
                                  onClick={() => removeSection(section.id)}
                                >
                                  {t('actions.delete', { ns: 'common' })}
                                </button>
                              )}
                            </span>
                          </div>
                          <input
                            type="text"
                            className="patient-form__input"
                            aria-label={custom ? t('templates.customHeadingAria') : t('templates.headingAria', { label: sectionLabel(section.id as BuiltInSectionId) })}
                            value={section.title}
                            maxLength={120}
                            placeholder={custom ? t('templates.headingPlaceholder') : defaultHeading(section.id as BuiltInSectionId)}
                            onChange={(e) => updateSection(section.id, { title: e.target.value })}
                            {...track((v) => updateSection(section.id, { title: v }))}
                          />
                          {custom && (
                            <textarea
                              className="patient-form__input report-templates__textarea"
                              rows={3}
                              aria-label={t('templates.sectionTextAria')}
                              value={(section as CustomReportSection).body}
                              placeholder={t('templates.sectionTextPlaceholder')}
                              onChange={(e) => updateSection(section.id, { body: e.target.value })}
                              {...track((v) => updateSection(section.id, { body: v }))}
                            />
                          )}
                        </li>
                      );
                    })}
                  </ol>
                  <button type="button" className="diagram-view__action" onClick={addCustomSection}>
                    {t('templates.addCustom')}
                  </button>
                </section>

                <section className="ai-settings-section">
                  <h3 className="ai-settings-subhead">{t('templates.tipsTitle')}</h3>
                  {selected.homecareTips.length === 0 ? (
                    <>
                      <p className="patient-form__hint">{t('templates.tipsStandard')}</p>
                      <ul className="report-templates__default-tips">
                        {generatedTips.map((tip) => <li key={tip}>{tip}</li>)}
                      </ul>
                      <button
                        type="button"
                        className="diagram-view__action"
                        onClick={() => updateTemplate({ homecareTips: [...generatedTips] })}
                      >
                        {t('templates.tipsCustomize')}
                      </button>
                    </>
                  ) : (
                    <>
                      <ul className="report-templates__tips">
                        {selected.homecareTips.map((tip, i) => (
                          <li key={i} className="report-templates__tip">
                            <input
                              type="text"
                              className="patient-form__input"
                              aria-label={t('templates.tipAria', { n: i + 1 })}
                              value={tip}
                              onChange={(e) =>
                                updateTemplate((tpl) => ({
                                  homecareTips: tpl.homecareTips.map((x, j) => (j === i ? e.target.value : x)),
                                }))
                              }
                              {...track((v) =>
                                updateTemplate((tpl) => ({ homecareTips: tpl.homecareTips.map((x, j) => (j === i ? v : x)) }))
                              )}
                            />
                            <button
                              type="button"
                              className="diagram-view__action diagram-view__action--danger"
                              aria-label={t('templates.tipRemoveAria', { n: i + 1 })}
                              onClick={() =>
                                updateTemplate((tpl) => ({ homecareTips: tpl.homecareTips.filter((_, j) => j !== i) }))
                              }
                            >
                              {t('templates.tipRemove')}
                            </button>
                          </li>
                        ))}
                      </ul>
                      <div className="report-templates__inline-actions">
                        <button
                          type="button"
                          className="diagram-view__action"
                          onClick={() => updateTemplate((tpl) => ({ homecareTips: [...tpl.homecareTips, ''] }))}
                        >
                          {t('templates.tipAdd')}
                        </button>
                        <button
                          type="button"
                          className="diagram-view__action"
                          onClick={() => updateTemplate({ homecareTips: [] })}
                        >
                          {t('templates.tipsUseStandard')}
                        </button>
                      </div>
                    </>
                  )}
                  <span className="patient-form__hint">
                    {t('templates.tipsPerChart')}
                  </span>
                </section>

                <section className="ai-settings-section">
                  <h3 className="ai-settings-subhead">{t('templates.closingTitle')}</h3>
                  <label className="patient-form__label">
                    {t('templates.closingLabel')}
                    <textarea
                      className="patient-form__input report-templates__textarea"
                      rows={2}
                      value={selected.closingNote}
                      placeholder={t('templates.closingPlaceholder')}
                      onChange={(e) => updateTemplate({ closingNote: e.target.value })}
                      {...track((v) => updateTemplate({ closingNote: v }))}
                    />
                  </label>
                  <label className="patient-form__label">
                    {t('templates.footerLabel')}
                    <input
                      type="text"
                      className="patient-form__input"
                      value={selected.footer}
                      maxLength={200}
                      placeholder={t('templates.footerPlaceholder')}
                      onChange={(e) => updateTemplate({ footer: e.target.value })}
                      {...track((v) => updateTemplate({ footer: v }))}
                    />
                    <span className="patient-form__hint">{t('templates.footerHint')}</span>
                  </label>
                </section>
              </fieldset>
            </div>
          </div>

          {error && <div className="login-error report-templates__error" role="alert">{error}</div>}
          <footer className="ai-settings-footer report-templates__footer">
            <button type="button" className="diagram-view__action" onClick={handlePreview} disabled={previewBusy}>
              {previewBusy ? t('templates.previewBuilding') : t('templates.previewSample')}
            </button>
            <span className="ai-settings-spacer" />
            {canEdit ? (
              <>
                <button type="button" className="diagram-view__action" onClick={requestClose} disabled={busy}>
                  {t('actions.cancel', { ns: 'common' })}
                </button>
                <button
                  type="button"
                  className="entry-grid__button entry-grid__button--topbar"
                  onClick={handleSave}
                  disabled={busy || !dirty}
                >
                  {busy ? t('templates.saving') : t('templates.save')}
                </button>
              </>
            ) : (
              <button type="button" className="entry-grid__button entry-grid__button--topbar" onClick={onClose}>
                {t('actions.close', { ns: 'common' })}
              </button>
            )}
          </footer>
        </div>
      </div>

      {previewUrl && (
        <div className="pdf-preview-overlay report-templates__preview" onClick={closePreview} role="dialog" aria-modal="true" aria-labelledby="report-templates-preview-title">
          <div className="pdf-preview-modal" onClick={(e) => e.stopPropagation()}>
            <header className="pdf-preview-header">
              <div>
                <h2 id="report-templates-preview-title">{t('templates.previewHeading', { name: selected.name })}</h2>
                <p>{t('templates.previewSubtitle')}</p>
              </div>
              <button type="button" className="pdf-preview-close" onClick={closePreview} aria-label={t('templates.previewClose')} autoFocus>
                ×
              </button>
            </header>
            <div className="pdf-preview-iframe-wrap">
              <iframe src={previewUrl} title={t('templates.previewFrame')} className="pdf-preview-iframe" />
            </div>
          </div>
        </div>
      )}
    </>
  );
};
