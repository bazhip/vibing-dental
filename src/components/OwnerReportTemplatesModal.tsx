import React from 'react';
import { useModalFocus } from '../hooks/useModalFocus';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useStackLeaveGuard, useStackScreenOptions } from '../ios/Stack';
import { confirmDialog } from './ui/dialogs';
import { Sheet } from '../ios/Sheet';
import {
  BuiltInSectionId,
  CustomReportSection,
  DEFAULT_SECTION_TITLES,
  MAX_TEMPLATES,
  OwnerReportConfig,
  OwnerReportTemplate,
  PLACEHOLDERS,
  ReportSectionConfig,
  SECTION_LABELS,
  defaultTemplate,
  isCustomSection,
  newId,
  normalizeConfig,
} from '../utils/ownerReportConfig';
import { LOCALE_LABELS, REPORT_LOCALES, ReportLocale, reportStrings } from '../utils/ownerReportI18n';
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
  /** In the iOS app — 'screen': the editor only, as a pushed screen (Save
   *  in the navigation bar; Back asks before discarding); 'sheet': the
   *  editor in an iOS sheet (Cancel / Save; swipe-down asks before
   *  discarding). Default: the dialog. */
  presentation?: 'modal' | 'screen' | 'sheet';
}

const PLACEHOLDER_HINTS: Record<(typeof PLACEHOLDERS)[number], string> = {
  pet: 'Pet name',
  owner: 'Owner name',
  species: 'cat, dog…',
  date: 'Visit date',
  practice: 'Practice name',
  doctor: 'Doctor',
};

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
  presentation = 'modal',
}) => {
  const { t } = useTranslation();
  const asScreen = presentation === 'screen';
  const asSheet = presentation === 'sheet';
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
    if (dirty && !window.confirm('Discard your unsaved changes to the owner report templates?')) return;
    onClose();
  }, [busy, dirty, onClose]);

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
      else if (!asScreen && !asSheet) requestClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, previewUrl, closePreview, requestClose, asScreen, asSheet]);

  // As a pushed screen: Save in the navigation bar (owners); Back asks
  // before discarding edits.
  const saveRef = React.useRef<() => Promise<void>>(async () => {});
  const confirmLeave = async () => !busy && (!dirty || (await confirmDialog({
    title: 'Discard your unsaved changes to the owner report templates?',
    confirmLabel: 'Discard',
    cancelLabel: 'Keep editing',
    danger: true,
  })));
  useStackLeaveGuard(asScreen ? confirmLeave : null);
  useStackScreenOptions({
    trailing: asScreen && canEdit ? (
      <button type="button" className="ios-glass-button ios-glass-button--prominent" onClick={() => void saveRef.current()} disabled={busy || !dirty}>
        {t('actions.save')}
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

  if (!open) return null;

  const selected = draft.templates.find((t) => t.id === selectedId) ?? draft.templates[0];
  const strings = reportStrings(selected.language);

  // ---- Draft mutation helpers ---------------------------------------------
  const updateTemplate = (patch: Partial<OwnerReportTemplate> | ((t: OwnerReportTemplate) => Partial<OwnerReportTemplate>)) => {
    setDraft((d) => ({
      ...d,
      templates: d.templates.map((t) =>
        t.id === selected.id ? { ...t, ...(typeof patch === 'function' ? patch(t) : patch) } : t
      ),
    }));
  };
  const updateSection = (id: string, patch: Partial<CustomReportSection>) => {
    updateTemplate((t) => ({
      sections: t.sections.map((s) => (s.id === id ? ({ ...s, ...patch } as ReportSectionConfig) : s)),
    }));
  };
  const moveSection = (index: number, delta: number) => {
    updateTemplate((t) => {
      const next = [...t.sections];
      const target = index + delta;
      if (target < 0 || target >= next.length) return {};
      [next[index], next[target]] = [next[target], next[index]];
      return { sections: next };
    });
  };
  const addCustomSection = () => {
    updateTemplate((t) => ({
      sections: [...t.sections, { id: newId('custom-'), enabled: true, title: '', body: '' }],
    }));
  };
  const removeSection = (id: string) => {
    updateTemplate((t) => ({ sections: t.sections.filter((s) => s.id !== id) }));
  };
  const setLanguage = (language: ReportLocale) => {
    updateTemplate((t) => ({
      language,
      // Swap the header title along with the language unless it was customized.
      title: t.title === reportStrings(t.language).defaultTitle ? reportStrings(language).defaultTitle : t.title,
    }));
  };

  const addTemplate = (base?: OwnerReportTemplate) => {
    if (draft.templates.length >= MAX_TEMPLATES) return;
    const fresh = base
      ? { ...clone(base), id: newId('tpl-'), name: `${base.name} (copy)` }
      : { ...defaultTemplate(), id: newId('tpl-'), name: 'New template' };
    setDraft((d) => ({ ...d, templates: [...d.templates, fresh] }));
    setSelectedId(fresh.id);
  };
  const deleteTemplate = () => {
    if (draft.templates.length <= 1) return;
    if (!window.confirm(`Delete the “${selected.name}” template? Charts that use it switch to the default.`)) return;
    setDraft((d) => {
      const templates = d.templates.filter((t) => t.id !== selected.id);
      const defaultTemplateId = d.defaultTemplateId === selected.id ? templates[0].id : d.defaultTemplateId;
      return { templates, defaultTemplateId };
    });
    setSelectedId(draft.templates.find((t) => t.id !== selected.id)!.id);
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
      updateTemplate((t) => ({ introTemplate: `${t.introTemplate}${token}` }));
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
        templates: draft.templates.map((t) => ({
          ...t,
          name: t.name.trim() || 'Untitled template',
          homecareTips: t.homecareTips.map((tip) => tip.trim()).filter(Boolean),
        })),
      });
      await onSave(cleaned);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the templates.');
    } finally {
      setBusy(false);
    }
  };

  saveRef.current = handleSave;

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
      setError("Couldn't build the preview. Try again in a moment.");
    } finally {
      setPreviewBusy(false);
    }
  };

  // The heading used when the custom one is left blank — the standard
  // wording for the template's language (pet-dependent headings show as
  // their {pet} placeholder, which custom headings also accept).
  const defaultHeading = (id: BuiltInSectionId) =>
    selected.language === 'en' ? DEFAULT_SECTION_TITLES[id] : strings.headings[id]('{pet}');
  const generatedTips = strings.homecareTips;

  const previewOverlay = (
    <div className="pdf-preview-overlay report-templates__preview" onClick={closePreview} role="dialog" aria-modal="true" aria-labelledby="report-templates-preview-title">
      <div className="pdf-preview-modal" onClick={(e) => e.stopPropagation()}>
        <header className="pdf-preview-header">
          <div>
            <h2 id="report-templates-preview-title">Preview · {selected.name}</h2>
            <p>Sample visit. Real reports also include the mouth diagram and any before/after photos.</p>
          </div>
          <button type="button" className="pdf-preview-close" onClick={closePreview} aria-label="Close preview" autoFocus>
            ×
          </button>
        </header>
        <div className="pdf-preview-iframe-wrap">
          <iframe src={previewUrl ?? undefined} title="Owner report template preview" className="pdf-preview-iframe" />
        </div>
      </div>
    </div>
  );

  const templatesEditor = (
    <>
      {/* ---- Template list ------------------------------------------- */}
      <nav className="report-templates__list" aria-label="Templates">
        <ul>
          {draft.templates.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                className={`report-templates__item${t.id === selected.id ? ' report-templates__item--on' : ''}`}
                aria-current={t.id === selected.id ? 'true' : undefined}
                onClick={() => setSelectedId(t.id)}
              >
                <span className="report-templates__item-name">{t.name || 'Untitled template'}</span>
                <span className="report-templates__item-meta">
                  {t.id === draft.defaultTemplateId && <span className="report-templates__badge">Default</span>}
                  {t.language !== 'en' && <span className="report-templates__lang">{t.language.toUpperCase()}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {canEdit && (
          <div className="report-templates__list-actions">
            <button type="button" className="diagram-view__action" onClick={() => addTemplate()} disabled={draft.templates.length >= MAX_TEMPLATES}>
              New
            </button>
            <button type="button" className="diagram-view__action" onClick={() => addTemplate(selected)} disabled={draft.templates.length >= MAX_TEMPLATES}>
              Duplicate
            </button>
            <button
              type="button"
              className="diagram-view__action"
              onClick={() => setDraft((d) => ({ ...d, defaultTemplateId: selected.id }))}
              disabled={selected.id === draft.defaultTemplateId}
            >
              Set as default
            </button>
            <button
              type="button"
              className="diagram-view__action diagram-view__action--danger"
              onClick={deleteTemplate}
              disabled={draft.templates.length <= 1}
            >
              Delete
            </button>
          </div>
        )}
      </nav>

      {/* ---- Editor ---------------------------------------------------- */}
      <div className="report-templates__editor">
        {roleKnown && !canEdit && (
          <p className="login-notice" role="status">
            Only practice owners can edit. You can look through the templates and preview them.
          </p>
        )}
        <fieldset className="report-templates__fieldset" disabled={!canEdit || busy}>
          <section className="ai-settings-section">
            <h3 className="ai-settings-subhead">Basics</h3>
            <div className="report-templates__row">
              <label className="patient-form__label">
                Template name
                <input
                  type="text"
                  className="patient-form__input"
                  value={selected.name}
                  maxLength={80}
                  onChange={(e) => updateTemplate({ name: e.target.value })}
                />
              </label>
              <label className="patient-form__label">
                Report title
                <input
                  type="text"
                  className="patient-form__input"
                  value={selected.title}
                  maxLength={80}
                  placeholder="No title"
                  onChange={(e) => updateTemplate({ title: e.target.value })}
                  {...track((v) => updateTemplate({ title: v }))}
                />
              </label>
            </div>
            <div className="report-templates__row">
              <label className="patient-form__label">
                Report language
                <select
                  className="patient-form__input"
                  value={selected.language}
                  onChange={(e) => setLanguage(e.target.value as ReportLocale)}
                >
                  {REPORT_LOCALES.map((loc) => (
                    <option key={loc} value={loc}>{LOCALE_LABELS[loc]}</option>
                  ))}
                </select>
              </label>
              <label className="patient-form__label">
                Dates
                <select
                  className="patient-form__input"
                  value={selected.dateFormat}
                  onChange={(e) => updateTemplate({ dateFormat: e.target.value === 'long' ? 'long' : 'iso' })}
                >
                  <option value="iso">As charted (2026-07-19)</option>
                  <option value="long">Written out, in the report language</option>
                </select>
              </label>
            </div>
            <p className="patient-form__hint">
              The language applies to everything the report writes for you — headings,
              findings, tooth names and default text. Text your team types prints as written.
            </p>
            <label className="report-templates__check">
              <input
                type="checkbox"
                checked={selected.showToothNumbers}
                onChange={(e) => updateTemplate({ showToothNumbers: e.target.checked })}
              />
              <span>
                Show tooth numbers <span className="patient-form__hint">— “{strings.toothName(1, 4, false)} (104)” instead of “{strings.toothName(1, 4, false)}”</span>
              </span>
            </label>
            <label className="report-templates__check">
              <input
                type="checkbox"
                checked={selected.showGrades}
                onChange={(e) => updateTemplate({ showGrades: e.target.checked })}
              />
              <span>
                Show grades and measurements <span className="patient-form__hint">— “{strings.fieldPhrases.calculus('2')}” instead of “{strings.fieldPlain.calculus}”</span>
              </span>
            </label>
          </section>

          <section className="ai-settings-section">
            <h3 className="ai-settings-subhead">Opening summary</h3>
            <div className="report-templates__chips" role="group" aria-label="Insert a placeholder">
              {PLACEHOLDERS.map((p) => (
                <button
                  key={p}
                  type="button"
                  className="report-templates__chip"
                  title={`Insert ${PLACEHOLDER_HINTS[p].toLowerCase()}`}
                  // Keep focus (and the caret) in the field being edited.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => insertToken(`{${p}}`)}
                >
                  {`{${p}}`}
                </button>
              ))}
            </div>
            <p className="patient-form__hint">
              Click a placeholder to insert it into the field you’re editing (any text field
              below). Capitalize it — {'{Pet}'} — to capitalize the value.
            </p>
            <textarea
              className="patient-form__input report-templates__textarea"
              rows={4}
              aria-label="Opening summary template"
              value={selected.introTemplate}
              placeholder={strings.intro('{pet}')}
              onChange={(e) => updateTemplate({ introTemplate: e.target.value })}
              {...track((v) => updateTemplate({ introTemplate: v }))}
            />
            <span className="patient-form__hint">Leave empty to use the standard opening shown in grey.</span>
          </section>

          <section className="ai-settings-section">
            <h3 className="ai-settings-subhead">Sections</h3>
            <p className="patient-form__hint">
              Turn sections on or off, rename their headings, and set the print order. Sections
              with nothing to say for a visit (no extractions, no photos…) are skipped automatically.
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
                          {custom ? 'Custom text' : SECTION_LABELS[section.id as BuiltInSectionId]}
                        </span>
                      </label>
                      <span className="report-templates__section-actions">
                        <button
                          type="button"
                          className="diagram-view__action report-templates__icon"
                          onClick={() => moveSection(index, -1)}
                          disabled={index === 0}
                          aria-label="Move up"
                          title="Move up"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="diagram-view__action report-templates__icon"
                          onClick={() => moveSection(index, 1)}
                          disabled={index === selected.sections.length - 1}
                          aria-label="Move down"
                          title="Move down"
                        >
                          ↓
                        </button>
                        {custom && (
                          <button
                            type="button"
                            className="diagram-view__action diagram-view__action--danger"
                            onClick={() => removeSection(section.id)}
                          >
                            Delete
                          </button>
                        )}
                      </span>
                    </div>
                    <input
                      type="text"
                      className="patient-form__input"
                      aria-label={custom ? 'Custom section heading' : `${SECTION_LABELS[section.id as BuiltInSectionId]} heading`}
                      value={section.title}
                      maxLength={120}
                      placeholder={custom ? 'Heading (optional)' : defaultHeading(section.id as BuiltInSectionId)}
                      onChange={(e) => updateSection(section.id, { title: e.target.value })}
                      {...track((v) => updateSection(section.id, { title: v }))}
                    />
                    {custom && (
                      <textarea
                        className="patient-form__input report-templates__textarea"
                        rows={3}
                        aria-label="Section text"
                        value={(section as CustomReportSection).body}
                        placeholder="Text printed under the heading — e.g. pricing for your dental plans, or after-hours contact details."
                        onChange={(e) => updateSection(section.id, { body: e.target.value })}
                        {...track((v) => updateSection(section.id, { body: v }))}
                      />
                    )}
                  </li>
                );
              })}
            </ol>
            <button type="button" className="diagram-view__action" onClick={addCustomSection}>
              + Add a custom text section
            </button>
          </section>

          <section className="ai-settings-section">
            <h3 className="ai-settings-subhead">Home care tips</h3>
            {selected.homecareTips.length === 0 ? (
              <>
                <p className="patient-form__hint">Using the standard tips:</p>
                <ul className="report-templates__default-tips">
                  {generatedTips.map((tip) => <li key={tip}>{tip}</li>)}
                </ul>
                <button
                  type="button"
                  className="diagram-view__action"
                  onClick={() => updateTemplate({ homecareTips: [...generatedTips] })}
                >
                  Customize these tips
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
                        aria-label={`Tip ${i + 1}`}
                        value={tip}
                        onChange={(e) =>
                          updateTemplate((t) => ({
                            homecareTips: t.homecareTips.map((x, j) => (j === i ? e.target.value : x)),
                          }))
                        }
                        {...track((v) =>
                          updateTemplate((t) => ({ homecareTips: t.homecareTips.map((x, j) => (j === i ? v : x)) }))
                        )}
                      />
                      <button
                        type="button"
                        className="diagram-view__action diagram-view__action--danger"
                        aria-label={`Remove tip ${i + 1}`}
                        onClick={() =>
                          updateTemplate((t) => ({ homecareTips: t.homecareTips.filter((_, j) => j !== i) }))
                        }
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="report-templates__inline-actions">
                  <button
                    type="button"
                    className="diagram-view__action"
                    onClick={() => updateTemplate((t) => ({ homecareTips: [...t.homecareTips, ''] }))}
                  >
                    + Add tip
                  </button>
                  <button
                    type="button"
                    className="diagram-view__action"
                    onClick={() => updateTemplate({ homecareTips: [] })}
                  >
                    Use the standard tips
                  </button>
                </div>
              </>
            )}
            <span className="patient-form__hint">
              Each chart can still edit its own tips in the Owner Report section.
            </span>
          </section>

          <section className="ai-settings-section">
            <h3 className="ai-settings-subhead">Closing and footer</h3>
            <label className="patient-form__label">
              Closing note
              <textarea
                className="patient-form__input report-templates__textarea"
                rows={2}
                value={selected.closingNote}
                placeholder="e.g. Thank you for trusting us with {pet}'s care!"
                onChange={(e) => updateTemplate({ closingNote: e.target.value })}
                {...track((v) => updateTemplate({ closingNote: v }))}
              />
            </label>
            <label className="patient-form__label">
              Footer
              <input
                type="text"
                className="patient-form__input"
                value={selected.footer}
                maxLength={200}
                placeholder="e.g. (555) 010-0100 · www.example-vet.com · Open Mon–Sat"
                onChange={(e) => updateTemplate({ footer: e.target.value })}
                {...track((v) => updateTemplate({ footer: v }))}
              />
              <span className="patient-form__hint">Printed in small type at the bottom of every page.</span>
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
            {previewBusy ? 'Building preview…' : 'Preview with sample visit'}
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
        title="Owner report templates"
        cancelLabel={canEdit ? t('actions.cancel') : undefined}
        doneLabel={canEdit ? t('actions.save') : undefined}
        onDone={canEdit ? () => void handleSave() : undefined}
        doneDisabled={busy || !dirty}
        confirmDismiss={confirmLeave}
      >
        {content}
      </Sheet>
    );
  }

  return (
    <>
      <div className="ai-settings-overlay" onClick={requestClose} role="dialog" aria-modal="true" aria-labelledby="report-templates-title">
        <div className="ai-settings-modal report-templates" ref={modalRef} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
          <header className="ai-settings-header">
            <h2 id="report-templates-title">Owner report templates</h2>
            <button type="button" className="pdf-preview-close" onClick={requestClose} aria-label="Close">
              ×
            </button>
          </header>

          <div className="report-templates__body">
            {templatesEditor}
          </div>

          {error && <div className="login-error report-templates__error" role="alert">{error}</div>}
          <footer className="ai-settings-footer report-templates__footer">
            <button type="button" className="diagram-view__action" onClick={handlePreview} disabled={previewBusy}>
              {previewBusy ? 'Building preview…' : 'Preview with sample visit'}
            </button>
            <span className="ai-settings-spacer" />
            {canEdit ? (
              <>
                <button type="button" className="diagram-view__action" onClick={requestClose} disabled={busy}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="entry-grid__button entry-grid__button--topbar"
                  onClick={handleSave}
                  disabled={busy || !dirty}
                >
                  {busy ? 'Saving…' : 'Save templates'}
                </button>
              </>
            ) : (
              <button type="button" className="entry-grid__button entry-grid__button--topbar" onClick={onClose}>
                Close
              </button>
            )}
          </footer>
        </div>
      </div>

      {previewUrl && previewOverlay}
    </>
  );
};
