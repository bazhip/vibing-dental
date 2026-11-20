import { OwnerReportTemplateChoices } from './OwnerReportTemplateChoices';
import { RefineTextAction, RefineTextContext } from './RefineTextAction';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { PdfPagesPreview, canShowPdfInline } from './PdfPagesPreview';
import { useModalFocus } from '../hooks/useModalFocus';
import { useReorderList } from '../hooks/useReorderList';
import ReactDOM from 'react-dom';
import { useStackLeaveGuard, useStackScreenOptions } from '../ios/Stack';
import { confirmDialog } from './ui/dialogs';
import { ReorderHandle } from './ui/ReorderHandle';
import { Sheet } from '../ios/Sheet';
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
  ownerTemplateFields,
  placeholderTitle,
  sectionLabel,
} from '../utils/ownerReportConfig';
import { REPORT_LOCALES, ReportLocale, appReportLocale, reportStrings } from '../utils/ownerReportI18n';
import { errorText } from '../utils/apiErrors';
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
  startNew?: boolean;
  aiEnabled?: boolean;
  /** Role still loading — suppress the read-only note until known. */
  roleKnown: boolean;
  /** The practice's saved templates couldn't be loaded — what's shown is
   *  only the built-in default, so saving is blocked (it would replace
   *  the real templates). */
  loadFailed?: boolean;
  /** Language new templates start in (the practice's client language); default: the app language. */
  clientLanguage?: ReportLocale;
  branding: OwnerReportBranding;
  /** In the iOS app — 'screen': the editor only, as a pushed screen (Save
   *  in the navigation bar; Back asks before discarding); 'sheet': the
   *  editor in an iOS sheet (Cancel / Save; swipe-down asks before
   *  discarding). Default: the dialog. */
  presentation?: 'modal' | 'screen' | 'sheet';
  /** Register the current draft guard with the containing workspace. */
  onLeaveGuardChange?: (guard: (() => Promise<boolean>) | null) => void;
}

const DATE_FORMATS = ['iso', 'long'] as const;
const EDITOR_CATEGORIES = ['basics', 'content', 'homecare', 'closing'] as const;
type EditorCategory = typeof EDITOR_CATEGORIES[number];

type TextField = HTMLInputElement | HTMLTextAreaElement;

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/**
 * Practice template editor for report title, intro, section order and
 * visibility, headings, custom text sections,
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
  startNew = false,
  aiEnabled,
  roleKnown,
  loadFailed = false,
  clientLanguage,
  branding,
  presentation = 'modal',
  onLeaveGuardChange,
}) => {
  const refinement = React.useContext(RefineTextContext);
  const refineEnabled = (aiEnabled ?? refinement.enabled) && canEdit;
  const closingId = React.useId();
  const actionPanelId = React.useId();
  const draftFieldsId = React.useId();
  const { t } = useTranslation(['reportui', 'visitDocumentation']);
  const asScreen = presentation === 'screen';
  const asSheet = presentation === 'sheet';
  const categorized = !asScreen && !asSheet;
  const startedNew = React.useRef(false);
  const [actionsOpen, setActionsOpen] = React.useState(false);
  const actionsTrigger = React.useRef<HTMLButtonElement>(null);
  const [category, setCategory] = React.useState<EditorCategory>('basics');
  const editorRef = React.useRef<HTMLDivElement>(null);
  const nameRef = React.useRef<HTMLInputElement>(null);
  const [draft, setDraft] = React.useState<OwnerReportConfig>(() => clone(config));
  const [selectedId, setSelectedId] = React.useState(config.defaultTemplateId);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = React.useState(false);
  const modalRef = useModalFocus(open && !previewUrl && !asScreen && !asSheet);
  // The text field the placeholder chips insert into.
  const activeField = React.useRef<{ el: TextField; set: (value: string) => void } | null>(null);

  React.useEffect(() => {
    startedNew.current = false;
    if (!open) return;
    setDraft(clone(config));
    setSelectedId(config.defaultTemplateId);
    setCategory('basics');
    setActionsOpen(false);
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const makeNewTemplate = React.useCallback(
    () => ({ ...defaultTemplate(clientLanguage ?? appReportLocale()), id: newId('tpl-'), name: t('templates.newName') }),
    [clientLanguage, t],
  );
  React.useEffect(() => {
    if (!open || !startNew || !canEdit || loadFailed || startedNew.current || config.templates.length >= MAX_TEMPLATES) return;
    startedNew.current = true;
    const fresh = makeNewTemplate();
    setDraft(previous => ({ ...previous, templates: [...previous.templates, fresh] }));
    setSelectedId(fresh.id);
    nameRef.current?.focus({ preventScroll: true });
  }, [open, startNew, canEdit, loadFailed, config.templates.length, makeNewTemplate]);

  const baseline = React.useMemo(() => JSON.stringify(config), [config]);
  const dirty = open && JSON.stringify(draft) !== baseline;

  // The PDF behind previewUrl, for drawing it as pages where a frame can't show it.
  const previewBlobRef = React.useRef<Blob | null>(null);
  const confirmationPending = React.useRef(false);
  const current = React.useRef({ open, busy, canEdit, snapshot: JSON.stringify(draft) });
  current.current = { open, busy, canEdit, snapshot: JSON.stringify(draft) };
  const mounted = React.useRef(true);
  React.useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const confirmLeave = React.useCallback(async () => {
    if (current.current.busy || confirmationPending.current) return false;
    if (!dirty) return true;
    const snapshot = current.current.snapshot;
    confirmationPending.current = true;
    try {
      const confirmed = await confirmDialog({
        title: t('templates.discardConfirm'),
        confirmLabel: t('ios.sheets.discard.discard', { ns: 'common' }),
        cancelLabel: t('ios.sheets.discard.keep', { ns: 'common' }),
        danger: true,
      });
      return confirmed && mounted.current && current.current.open && !current.current.busy && current.current.snapshot === snapshot;
    } finally {
      confirmationPending.current = false;
    }
  }, [dirty, t]);
  const requestClose = React.useCallback(async () => {
    if (await confirmLeave()) onClose();
  }, [confirmLeave, onClose]);

  React.useEffect(() => {
    if (!open) return;
    onLeaveGuardChange?.(confirmLeave);
    return () => onLeaveGuardChange?.(null);
  }, [open, confirmLeave, onLeaveGuardChange]);

  const closePreview = React.useCallback(() => {
    setPreviewUrl((url) => {
      if (url) URL.revokeObjectURL(url);
      return null;
    });
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (previewUrl) closePreview();
      else if (!asScreen && !asSheet) requestClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, previewUrl, closePreview, requestClose, asScreen, asSheet]);

  // As a pushed screen: Save in the navigation bar (owners); Back asks
  // before discarding edits.
  const saveRef = React.useRef<() => Promise<void>>(async () => {});
  useStackLeaveGuard(asScreen ? confirmLeave : null);
  useStackScreenOptions({
    trailing: asScreen && canEdit ? (
      <button type="button" className="ios-glass-button ios-glass-button--prominent" onClick={() => void saveRef.current()} disabled={busy || !dirty || loadFailed}>
        {t('actions.save', { ns: 'common' })}
      </button>
    ) : asScreen ? null : undefined,
  });

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

  const selected = draft.templates.find((tpl) => tpl.id === selectedId) ?? draft.templates[0];
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
  const sectionOrder = useReorderList('.report-templates__sections', 'data-report-section-row', selected?.sections.length ?? 0, (from, to) => {
    updateTemplate((tpl) => {
      const next = [...tpl.sections];
      const [section] = next.splice(from, 1);
      next.splice(to, 0, section);
      return { sections: next };
    });
  });

  if (!open) return null;

  const strings = reportStrings(selected.language);
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
    if (!canEdit || busy || draft.templates.length >= MAX_TEMPLATES) return;
    const fresh = base
      ? { ...clone(base), id: newId('tpl-'), name: t('templates.copyName', { name: base.name }) }
      : makeNewTemplate();
    setDraft((d) => ({ ...d, templates: [...d.templates, fresh] }));
    setSelectedId(fresh.id);
  };
  const deleteTemplate = async () => {
    if (!canEdit || busy || draft.templates.length <= 1 || confirmationPending.current) return;
    const snapshot = current.current.snapshot;
    const selectedToDelete = selected.id;
    confirmationPending.current = true;
    try {
      const confirmed = await confirmDialog({
        title: t('templates.deleteConfirm', { name: selected.name }),
        confirmLabel: t('actions.delete', { ns: 'common' }),
        cancelLabel: t('actions.cancel', { ns: 'common' }),
        danger: true,
      });
      if (!confirmed || !mounted.current || !current.current.open || current.current.busy || !current.current.canEdit || current.current.snapshot !== snapshot) return;
      const remaining = draft.templates.filter((tpl) => tpl.id !== selectedToDelete);
      setDraft((d) => ({
        templates: remaining,
        defaultTemplateId: d.defaultTemplateId === selectedToDelete ? remaining[0].id : d.defaultTemplateId,
      }));
      setSelectedId(remaining[0].id);
    } finally {
      confirmationPending.current = false;
    }
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
      setError(errorText(e, t('templates.saveFailed')));
    } finally {
      setBusy(false);
    }
  };

  saveRef.current = handleSave;

  const handlePreview = async () => {
    setPreviewBusy(true);
    setError('');
    try {
      const model = buildOwnerReportModel(sampleOwnerReportSnapshot(selected.language), {
        template: selected,
        practiceName: branding.practiceName,
        doctorName: branding.doctorName,
      });
      const bytes = await buildOwnerReportPdfBytes(model, branding, []);
      const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
      previewBlobRef.current = blob;
      const url = URL.createObjectURL(blob);
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

  const previewOverlay = (
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
          {/* Phones (Android Chrome, iOS) can't show a PDF in a frame —
              draw its pages instead. */}
          {canShowPdfInline() || !previewBlobRef.current
            ? <iframe src={previewUrl ?? undefined} title={t('templates.previewFrame')} className="pdf-preview-iframe" />
            : <PdfPagesPreview blob={previewBlobRef.current} title={t('templates.previewFrame')} />}
        </div>
      </div>
    </div>
  );

  const selectCategory = (next: EditorCategory) => {
    setCategory(next);
    activeField.current = null;
    if (editorRef.current) editorRef.current.scrollTop = 0;
  };

  const draftFields = ownerTemplateFields(selected);
  const selectTemplate = (id: string | null) => {
    if (!id) return;
    setSelectedId(id);
    activeField.current = null;
  };
  const finishTemplateAction = (action: () => void) => {
    setActionsOpen(false);
    actionsTrigger.current?.focus();
    action();
  };
  const canAddTemplate = !busy && draft.templates.length < MAX_TEMPLATES;
  const templateActions = (
    <>
      <button type="button" className="diagram-view__action" onClick={() => finishTemplateAction(() => addTemplate(selected))} disabled={!canAddTemplate}>
        {t('actions.duplicate', { ns: 'common' })}
      </button>
      <button
        type="button"
        className="diagram-view__action"
        onClick={() => finishTemplateAction(() => setDraft((d) => ({ ...d, defaultTemplateId: selected.id })))}
        disabled={busy || selected.id === draft.defaultTemplateId}
      >
        {t('templates.setDefault')}
      </button>
      <button type="button" className="diagram-view__action diagram-view__action--danger" onClick={() => finishTemplateAction(deleteTemplate)} disabled={busy || draft.templates.length <= 1}>
        {t('actions.delete', { ns: 'common' })}
      </button>
    </>
  );

  const templatesEditor = (
    <>
      <div className="report-templates__toolbar">
        <OwnerReportTemplateChoices config={draft} templateId={selected.id} onSelect={selectTemplate} disabled={busy}
          actions={canEdit && (
            <div className="report-templates__toolbar-actions">
              <button type="button" className="diagram-view__action" onClick={() => addTemplate()} disabled={!canAddTemplate}>
                <span aria-hidden="true">+</span>{' '}{t('templates.newName')}
              </button>
              <div
                className="report-templates__overflow"
                onBlur={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget)) setActionsOpen(false);
                }}
                onKeyDown={(e) => {
                  if (e.key !== 'Escape' || !actionsOpen) return;
                  e.preventDefault();
                  e.stopPropagation();
                  setActionsOpen(false);
                  actionsTrigger.current?.focus();
                }}
              >
                <button
                  ref={actionsTrigger}
                  type="button"
                  className="diagram-view__action report-templates__overflow-trigger"
                  aria-label={t('templates.manageActions')}
                  aria-expanded={actionsOpen}
                  aria-controls={actionPanelId}
                  onClick={(e) => {
                    e.currentTarget.focus();
                    setActionsOpen((value) => !value);
                  }}
                  disabled={busy}
                >
                  <span aria-hidden="true">⋯</span>
                </button>
                <div id={actionPanelId} className="report-templates__overflow-panel" hidden={!actionsOpen}>
                  {templateActions}
                </div>
              </div>
            </div>
          )} />
      </div>

      {categorized && (
        <nav className="report-templates__categories" aria-label={t('templates.editor.navigation')}>
          <label className="report-templates__compact-picker patient-form__label">
            {t('templates.editor.navigation')}
            <select className="patient-form__input" value={category} onChange={(e) => selectCategory(e.target.value as EditorCategory)}>
              {EDITOR_CATEGORIES.map((id) => <option key={id} value={id}>{t(`templates.editor.${id}`)}</option>)}
            </select>
          </label>
          {EDITOR_CATEGORIES.map((id) => (
            <button type="button" key={id} aria-current={category === id ? 'page' : undefined} onClick={() => selectCategory(id)}>
              {t(`templates.editor.${id}`)}
            </button>
          ))}
        </nav>
      )}

      {/* ---- Editor ---------------------------------------------------- */}
      <div className="report-templates__editor" ref={editorRef}>
        {categorized && <p className="report-templates__scope">{t('templates.editor.scope')}</p>}
        {loadFailed && (
          <p className="login-error" role="alert">
            {t('templates.loadFailed')}
          </p>
        )}
        {roleKnown && !canEdit && (
          <p className="login-notice" role="status">
            {t('templates.readOnly')}
          </p>
        )}
        <fieldset className="report-templates__fieldset" disabled={!canEdit || busy}>
          <section className="ai-settings-section" hidden={categorized && category !== 'basics'}>
            <h3 className="ai-settings-subhead">{t('templates.basics')}</h3>
            <div className="report-templates__row">
              <label className="patient-form__label">
                {t('templates.nameLabel')}
                <input
                  ref={nameRef}
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
            <label className="choice-row report-templates__check">
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
            <label className="choice-row report-templates__check">
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

          <section className="ai-settings-section" hidden={categorized && category !== 'content'}>
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
            <div className="refine-field">
              <textarea
                className="patient-form__input report-templates__textarea"
                rows={4}
                aria-label={t('templates.summaryAria')}
                value={selected.introTemplate}
                placeholder={introPlaceholder}
                onChange={(e) => updateTemplate({ introTemplate: e.target.value })}
                {...track((v) => updateTemplate({ introTemplate: v }))}
              />
              {refineEnabled && <RefineTextAction value={selected.introTemplate} enabled={aiEnabled}
              scopeKey={selected.id} readOnly={!canEdit || busy} onApply={introTemplate => updateTemplate({ introTemplate })} />}
            </div>
            <span className="patient-form__hint">{t('templates.summaryEmpty')}</span>
            {draftFields.length > 0 && (
              <div className="report-templates__used-fields">
                <span className="patient-form__hint" id={draftFieldsId}>{t('templates.fieldsInTemplate', { ns: 'library' })}</span>
                <ul aria-labelledby={draftFieldsId}>
                  {draftFields.map(field => <li key={field}><code>{field}</code></li>)}
                </ul>
              </div>
            )}
          </section>

          <section className="ai-settings-section" hidden={categorized && category !== 'content'}>
            <h3 className="ai-settings-subhead">{t('templates.sectionsTitle')}</h3>
            <p className="patient-form__hint">
              {t('templates.sectionsHint')}
            </p>
            <ol className="report-templates__sections">
              {selected.sections.map((section, index) => {
                const custom = isCustomSection(section);
                const name = custom ? section.title.trim() || t('templates.customText') : sectionLabel(section.id as BuiltInSectionId);
                return (
                  <li key={section.id} className={`report-templates__section${section.enabled ? '' : ' report-templates__section--off'}`}
                    data-report-section-row={index} data-reorder-drop={sectionOrder.dropAt(index)}>
                    <div className="report-templates__section-head">
                      <ReorderHandle index={index} reorder={sectionOrder} disabled={!canEdit || busy || selected.sections.length < 2}
                        label={t('visitDocumentation:consultation.templates.builder.dragField', { field: name })} />
                      <label className="choice-row report-templates__check report-templates__check--inline">
                        <input
                          type="checkbox"
                          checked={section.enabled}
                          onChange={(e) => updateSection(section.id, { enabled: e.target.checked })}
                        />
                        <span className="report-templates__section-name">
                          {custom ? t('templates.customText') : name}
                        </span>
                      </label>
                      {custom && (
                        <span className="report-templates__section-actions">
                          <button
                            type="button"
                            className="diagram-view__action diagram-view__action--danger"
                            onClick={() => removeSection(section.id)}
                          >
                            {t('actions.delete', { ns: 'common' })}
                          </button>
                        </span>
                      )}
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
                      <div className="refine-field">
                        <textarea
                          className="patient-form__input report-templates__textarea"
                          rows={3}
                          aria-label={t('templates.sectionTextAria')}
                          value={(section as CustomReportSection).body}
                          placeholder={t('templates.sectionTextPlaceholder')}
                          onChange={(e) => updateSection(section.id, { body: e.target.value })}
                          {...track((v) => updateSection(section.id, { body: v }))}
                        />
                        {refineEnabled && <RefineTextAction
                          value={(section as CustomReportSection).body} enabled={aiEnabled}
                          scopeKey={selected.id} readOnly={!canEdit || busy} onApply={body => updateSection(section.id, { body })} />}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
            <button type="button" className="diagram-view__action" onClick={addCustomSection}>
              {t('templates.addCustom')}
            </button>
          </section>

          <section className="ai-settings-section" hidden={categorized && category !== 'homecare'}>
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
                      <div className="refine-field refine-field--single">
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
                        <RefineTextAction value={tip} enabled={aiEnabled} singleLine
                          scopeKey={JSON.stringify([selected.id, selected.homecareTips])} readOnly={!canEdit || busy}
                          onApply={value => updateTemplate(tpl => ({ homecareTips: tpl.homecareTips.map((previous, index) => index === i ? value : previous) }))} />
                      </div>
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

          <section className="ai-settings-section" hidden={categorized && category !== 'closing'}>
            <h3 className="ai-settings-subhead">{t('templates.closingTitle')}</h3>
            <label htmlFor={closingId} className="patient-form__label">
              {t('templates.closingLabel')}
            </label>
            <div className="refine-field">
              <textarea id={closingId}
                className="patient-form__input report-templates__textarea"
                rows={2}
                value={selected.closingNote}
                placeholder={t('templates.closingPlaceholder')}
                onChange={(e) => updateTemplate({ closingNote: e.target.value })}
                {...track((v) => updateTemplate({ closingNote: v }))}
              />
              {refineEnabled && <RefineTextAction value={selected.closingNote} enabled={aiEnabled}
              scopeKey={selected.id} readOnly={!canEdit || busy} onApply={closingNote => updateTemplate({ closingNote })} />}
            </div>
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
    </>
  );

  if (asScreen || asSheet) {
    const content = (
      <div className="ios-settings-page report-templates report-templates--screen">
        <div className="report-templates__body">
          {templatesEditor}
        </div>
        {error && <div className="login-error report-templates__error" role="alert">{error}</div>}
        <div className="report-templates__screen-actions">
          <button type="button" className="diagram-view__action" onClick={handlePreview} disabled={previewBusy}>
            {previewBusy ? t('templates.previewBuilding') : t('templates.previewSample')}
          </button>
        </div>
        {/* Outside the stack layer (it is transformed; fixed would follow it). */}
        {previewUrl && ReactDOM.createPortal(previewOverlay, document.body)}
      </div>
    );
    if (asScreen) return content;
    return (
      <Sheet
        open
        onClose={onClose}
        title={t('templates.title')}
        cancelLabel={canEdit ? t('actions.cancel', { ns: 'common' }) : undefined}
        doneLabel={canEdit ? t('actions.save', { ns: 'common' }) : undefined}
        onDone={canEdit ? () => void handleSave() : undefined}
        doneDisabled={busy || !dirty || loadFailed}
        confirmDismiss={confirmLeave}
      >
        {content}
      </Sheet>
    );
  }

  return (
    <>
      <div className="ai-settings-overlay" onClick={requestClose} role="dialog" aria-modal="true" aria-labelledby="report-templates-title">
        <div className="ai-settings-modal report-templates report-templates--categorized" ref={modalRef} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
          <header className="ai-settings-header">
            <h2 id="report-templates-title">{t('templates.title')}</h2>
            <button type="button" className="pdf-preview-close" onClick={requestClose} aria-label={t('actions.close', { ns: 'common' })}>
              ×
            </button>
          </header>

          <div className="report-templates__body">
            {templatesEditor}
          </div>

          {error && <div className="login-error report-templates__error" role="alert">{error}</div>}
          <footer className="ai-settings-footer report-templates__footer">
            <button type="button" className="diagram-view__action" onClick={handlePreview} disabled={previewBusy} aria-label={previewBusy ? t('templates.previewBuilding') : t('templates.previewSample')}>
              {previewBusy ? t('templates.previewBuilding') : (
                <>
                  <span className="report-templates__long">{t('templates.previewSample')}</span>
                  <span className="report-templates__short">{t('templates.previewShort')}</span>
                </>
              )}
            </button>
            <span className="ai-settings-spacer" />
            {canEdit ? (
              <>
                {/* Phones: × already closes (with the same unsaved-changes check). */}
                <button type="button" className="diagram-view__action report-templates__cancel" onClick={requestClose} disabled={busy}>
                  {t('actions.cancel', { ns: 'common' })}
                </button>
                <button
                  type="button"
                  className="entry-grid__button entry-grid__button--topbar"
                  onClick={handleSave}
                  disabled={busy || !dirty || loadFailed}
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

      {previewUrl && previewOverlay}
    </>
  );
};
