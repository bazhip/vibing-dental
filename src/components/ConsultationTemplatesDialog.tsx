import { useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useModalFocus } from '../hooks/useModalFocus';
import { useBackdropDismiss } from '../hooks/useBackdropDismiss';
import { documentationUrl } from '../help/openDocumentation';
import { isNativeApp } from '../native/platform';
import { Sheet } from '../ios/Sheet';
import { confirmDialog, friendlyError } from './ui/dialogs';
import {
  CONSULTATION_LIBRARY_VERSION, CONSULTATION_TEMPLATE_LIMIT, CONSULTATION_TEMPLATE_NAME_LIMIT,
  CONSULTATION_SECTION_LIMIT, consultationHeadings, consultationChoices, consultationLibraryFits, consultationSectionKey, consultationSections, dentalSectionKey, isCustomNoteField, isCustomDischargeField, standardNoteFields, defaultNoteLayout,
  isConsultationStarter, parseConsultationLibrary,
  type NoteTemplateKind, type ConsultationSection, type ConsultationLayout, type ConsultationLibrary, type PracticeConsultationTemplate,
} from '../utils/consultationTemplates';

const SECTION_TEXT_SETTINGS = ['guidance', 'example', 'suggestedText'] as const;
const FORMATS = ['paragraph', 'bullets'] as const;
const DETAIL_LEVELS = ['concise', 'detailed'] as const;
const CUSTOM_SECTION = 'custom';

interface Props {
  kind?: NoteTemplateKind;
  initial: ConsultationLibrary;
  status: 'loading' | 'error' | 'ready';
  canEdit: boolean;
  onSave: (draft: ConsultationLibrary) => Promise<void>;
  onReload: () => void;
  onClose: () => void;
}

export function ConsultationTemplatesDialog({ kind = 'consultation', initial, status, canEdit, onSave, onReload, onClose }: Props) {
  const { t, i18n } = useTranslation(['visitDocumentation', 'common', 'reportui', 'settings']);
  const id = useId();
  const isDischarge = kind === 'discharge';
  const starter = defaultNoteLayout(kind);
  const native = isNativeApp();
  const focus = useModalFocus(!native);
  const [edits, setDraft] = useState<ConsultationLibrary>();
  const draft = edits ?? initial;
  const [choice, setSelectedId] = useState<string>();
  const selectedId = choice ?? draft.defaultId;
  const [showArchived, setShowArchived] = useState(false);
  const [preview, setPreview] = useState(false);
  const [expanded, setExpanded] = useState<ConsultationSection['id']>();
  const [adding, setAdding] = useState(false);
  const [sample, setSample] = useState('');
  const [importing, setImporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [error, setError] = useState('');
  const changed = draft !== initial && JSON.stringify(draft) !== JSON.stringify(initial);
  const activeTemplates = consultationChoices(draft, kind);
  const templates = [...activeTemplates, ...draft.templates.filter(template => showArchived && template.archived)];
  const custom = draft.templates.find(template => template.id === selectedId);
  const selected: ConsultationLayout = custom ?? activeTemplates.find(template => template.id === selectedId) ?? starter;
  const editable = status === 'ready' && canEdit && !saving;
  const canAddTemplate = editable && draft.templates.length < CONSULTATION_TEMPLATE_LIMIT;
  const editSelected = editable && !!custom && !custom.archived && !preview;
  const sections = consultationSections(selected);
  const selectedTemplateIndex = activeTemplates.findIndex(template => template.id === selected.id);
  const versionedDraft: ConsultationLibrary = { ...draft, version: CONSULTATION_LIBRARY_VERSION };
  const valid = !!parseConsultationLibrary(versionedDraft, kind);
  const language = i18n.resolvedLanguage ?? i18n.language;
  const nameOf = (template: ConsultationLayout) => isDischarge && template.id === starter.id
    ? t('discharge.templates.starter')
    : isConsultationStarter(template.id)
    ? t(`consultation.templates.starters.${template.id}`)
    : template.name || t('consultation.templates.untitled');
  const update = (template: PracticeConsultationTemplate) => setDraft({
    ...draft, templates: draft.templates.map(item => item.id === template.id ? template : item),
  });
  const choose = (templateId: string) => {
    setSelectedId(templateId);
    setPreview(false);
    setExpanded(undefined);
    setAdding(false);
  };
  const sectionName = (section: ConsultationSection) => {
    const key = consultationSectionKey(section);
    return section.label?.trim() || (key ? t(`${key}.label`) : t('consultation.templates.builder.customSection'));
  };
  const newFieldId = () => isDischarge ? `dischargeCustom_${crypto.randomUUID()}` as const : `consultationCustom_${crypto.randomUUID()}` as const;
  const addTemplate = (template: Omit<PracticeConsultationTemplate, 'id'>) => {
    if (!canAddTemplate) return;
    const id = crypto.randomUUID();
    setDraft({ ...draft, templates: [...draft.templates, { ...template, id }] });
    choose(id);
    setImporting(false);
  };
  const duplicate = () => addTemplate({
    name: nameOf(selected), fields: selected.fields, sections,
    ...(selected.instructions ? { instructions: selected.instructions } : {}),
    ...(selected.detail ? { detail: selected.detail } : {}),
  });
  const importSample = () => {
    const headings = consultationHeadings(sample);
    if (!headings.length) return;
    addTemplate({
      name: t('consultation.templates.untitled'),
      fields: starter.fields,
      sections: headings.map(label => ({ id: newFieldId(), label })),
    });
    setSample('');
  };
  const updateSections = (items: readonly ConsultationSection[]) => {
    if (custom) update({ ...custom, sections: items });
  };
  const updateSection = (section: ConsultationSection) => {
    updateSections(sections.map(item => item.id === section.id ? section : item));
  };
  const addSection = (field: ConsultationSection['id'] | 'custom') => {
    const section: ConsultationSection = field === 'custom'
      ? { id: newFieldId(), label: t('consultation.templates.builder.customSection') }
      : { id: field };
    updateSections([...sections, section]);
    setExpanded(section.id);
    setAdding(false);
  };
  const move = (index: number, delta: number) => {
    const items = [...sections], destination = index + delta;
    if (destination < 0 || destination >= items.length) return;
    [items[index], items[destination]] = [items[destination], items[index]];
    updateSections(items);
  };
  const moveTemplate = (delta: number) => {
    const order = activeTemplates.map(template => template.id), destination = selectedTemplateIndex + delta;
    if (selectedTemplateIndex < 0 || destination < 0 || destination >= order.length) return;
    [order[selectedTemplateIndex], order[destination]] = [order[destination], order[selectedTemplateIndex]];
    setDraft({ ...draft, order });
  };
  const toggleArchive = () => {
    if (!custom) return;
    const archiving = !custom.archived;
    setDraft({
      ...draft,
      defaultId: archiving && draft.defaultId === custom.id ? starter.id : draft.defaultId,
      templates: draft.templates.map(item => item.id === custom.id ? { ...item, archived: archiving } : item),
    });
    if (archiving && !showArchived) choose(starter.id);
  };
  const setArchivedVisibility = () => {
    if (showArchived && custom?.archived) choose(starter.id);
    setShowArchived(!showArchived);
  };
  const save = async () => {
    if (!editable || !valid || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError('');
    try {
      await onSave(draft);
      onClose();
    } catch (cause) {
      setError(friendlyError(cause, t('consultation.templates.saveFailed')));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  const canClose = () => savingRef.current ? false : !changed || confirmDialog({
    title: t('consultation.templates.discard'),
    confirmLabel: t('common:actions.dismiss'),
  });
  const close = async () => { if (await canClose()) onClose(); };
  const backdrop = useBackdropDismiss(() => void close());

  const title = t(isDischarge ? 'discharge.templates.title' : 'consultation.templates.title');
  const body = <>
    <div className="consultation-library__body">
      <div className="consultation-library__intro">
        <p>{t(isDischarge ? 'discharge.templates.intro' : 'consultation.templates.intro')}</p>
        <a className="visit-documentation__guide" href={documentationUrl(language, isDischarge ? 'discharge' : 'consultation-templates')}
          target="_blank" rel="noopener noreferrer">{t(isDischarge ? 'discharge.templates.help' : 'consultation.templates.help')}</a>
      </div>
      {status === 'loading' && <p role="status">{t('consultation.templates.loading')}</p>}
      {status === 'error' && <div className="consultation-library__notice">
        <p role="status">{t('consultation.templates.loadFailed')}</p>
        <button type="button" className="ui-btn ui-btn--secondary" onClick={onReload}>{t('common:actions.tryAgain')}</button>
      </div>}
      <div className="consultation-library__layout">
        <div className="consultation-library__list">
          <span id={`${id}-picker`} className="patient-form__label">{t('consultation.templates.label')}</span>
          <ul aria-labelledby={`${id}-picker`} className={templates.length > 6 ? 'consultation-library__list--scroll' : undefined}>
            {templates.map(template => <li key={template.id}><button type="button" aria-current={template.id === selected.id || undefined}
              onClick={() => choose(template.id)}><span dir="auto">{nameOf(template)}</span>
              {template.id === draft.defaultId && <small>{t('consultation.templates.default')}</small>}
            </button></li>)}
          </ul>
          {draft.templates.some(template => template.archived) && <label className="consultation-library__archived">
            <input type="checkbox" checked={showArchived} onChange={setArchivedVisibility} />
            {t('consultation.templates.showArchived')}
          </label>}
        </div>
        <section className="consultation-library__editor" aria-labelledby={`${id}-name`}>
          <header className="consultation-library__heading">
            <h3 id={`${id}-name`}><bdi>{nameOf(selected)}</bdi></h3>
            {custom?.archived && <span className="visit-documentation__status">{t('consultation.templates.archived')}</span>}
          </header>
          {editSelected && <label className="ui-dialog__label">
            {t('reportui:templates.nameLabel')}
            <input className="ui-dialog__input" dir="auto" maxLength={CONSULTATION_TEMPLATE_NAME_LIMIT} value={custom.name}
              onChange={event => update({ ...custom, name: event.target.value })} />
          </label>}
          <div className="consultation-library__tools">
            <button type="button" className="ui-btn ui-btn--secondary" aria-pressed={preview}
              onClick={() => setPreview(!preview)}>{t('consultation.templates.preview')}</button>
            {editable && <button type="button" className="ui-btn ui-btn--secondary"
              disabled={!canAddTemplate} onClick={duplicate}>{t('common:actions.duplicate')}</button>}
            {editable && <details>
              <summary>{t('consultation.templates.options')}</summary>
              <div className="consultation-library__menu">
                <button type="button" className="ui-btn ui-btn--secondary" disabled={selected.id === draft.defaultId || custom?.archived}
                  onClick={() => setDraft({ ...draft, defaultId: selected.id })}>{t('consultation.templates.setDefault')}</button>
                {selectedTemplateIndex >= 0 && <>
                  <button type="button" className="ui-btn ui-btn--secondary" disabled={selectedTemplateIndex === 0}
                    onClick={() => moveTemplate(-1)}>{t('consultation.templates.builder.earlier')}</button>
                  <button type="button" className="ui-btn ui-btn--secondary" disabled={selectedTemplateIndex === activeTemplates.length - 1}
                    onClick={() => moveTemplate(1)}>{t('consultation.templates.builder.later')}</button>
                </>}
                <button type="button" className="ui-btn ui-btn--secondary" disabled={!canAddTemplate}
                  onClick={() => setImporting(!importing)}>{t('consultation.templates.builder.importTitle')}</button>
                {custom && <button type="button" className="ui-btn ui-btn--secondary"
                  onClick={toggleArchive}>{t(custom.archived ? 'consultation.templates.restore' : 'consultation.templates.archive')}</button>}
              </div>
            </details>}
          </div>
          {importing && <div className="consultation-library__settings">
            <label className="ui-dialog__label">{t('consultation.templates.builder.importTitle')}
              <textarea className="ui-dialog__input" rows={4} value={sample} maxLength={12000}
                aria-describedby={`${id}-sample-help`} onChange={event => setSample(event.target.value)} />
            </label>
            <p id={`${id}-sample-help`}>{t('consultation.templates.builder.importHelp')}</p>
            <button type="button" className="ui-btn ui-btn--secondary" disabled={!canAddTemplate || !consultationHeadings(sample).length}
              onClick={importSample}>{t('consultation.templates.builder.createTemplate')}</button>
          </div>}
          {editSelected && <details className="consultation-library__settings">
            <summary>{t('consultation.templates.builder.dictation')}</summary>
            <label className="ui-dialog__label">{t('consultation.templates.builder.instructions')}
              <textarea className="ui-dialog__input" rows={2} dir="auto" maxLength={2000} value={custom.instructions ?? ''}
                onChange={event => update({ ...custom, instructions: event.target.value })} />
            </label>
            <label className="ui-dialog__label">{t('consultation.templates.builder.detail')}
              <select className="ui-dialog__input" value={custom.detail ?? ''}
                onChange={event => update({ ...custom, detail: event.target.value as PracticeConsultationTemplate['detail'] || undefined })}>
                <option value="">{t('consultation.templates.builder.standard')}</option>
                {DETAIL_LEVELS.map(level => <option key={level} value={level}>{t(`consultation.templates.builder.${level}`)}</option>)}
              </select>
            </label>
          </details>}
          {preview && <p className="consultation-library__sample">{t('consultation.templates.sampleNotice')}</p>}
          <ol className="consultation-library__sections">
            {sections.map((section, index) => {
              const label = sectionName(section);
              const key = consultationSectionKey(section);
              const dentalKey = dentalSectionKey(section.id);
              const example = section.example ?? (dentalKey ? t(`consultation.dental.${dentalKey}.sample`)
                : isCustomNoteField(section.id) ? ''
                  : section.id === 'dischargeMedications' || section.id === 'dischargeInstructions' || section.id === 'dischargeFollowUp'
                    ? t(`discharge.templates.samples.${section.id}`) : t(`consultation.templates.samples.${section.id}`));
              return <li key={section.id} className={section.level === 2 ? 'consultation-library__subsection' : undefined}>
                <div className="consultation-library__section-row">
                  <div>
                    {editSelected ? <button type="button" className="consultation-library__section-name"
                      aria-expanded={expanded === section.id} aria-controls={`${id}-${section.id}`}
                      onClick={() => setExpanded(expanded === section.id ? undefined : section.id)}>{label}</button> : <span dir="auto">{label}</span>}
                    {preview && example && (section.format === 'bullets'
                      ? <ul>{example.split(/\r?\n/u).filter(Boolean).map((line, n) => <li key={n}>{line}</li>)}</ul>
                      : <p>{example}</p>)}
                  </div>
                  {editSelected && <div className="consultation-library__move">
                    <button type="button" className="ui-btn ui-btn--secondary" disabled={index === 0}
                      aria-label={t('consultation.templates.moveUp', { field: label })} onClick={() => move(index, -1)}><span aria-hidden="true">↑</span></button>
                    <button type="button" className="ui-btn ui-btn--secondary" disabled={index === sections.length - 1}
                      aria-label={t('consultation.templates.moveDown', { field: label })} onClick={() => move(index, 1)}><span aria-hidden="true">↓</span></button>
                  </div>}
                </div>
                {editSelected && expanded === section.id && <div className="consultation-library__settings" id={`${id}-${section.id}`}>
                  <label className="ui-dialog__label">{t('consultation.templates.builder.sectionLabel')}
                    <input className="ui-dialog__input" dir="auto" maxLength={100} value={section.label ?? ''}
                      placeholder={key ? t(`${key}.label`) : undefined}
                      onChange={event => updateSection({ ...section, label: event.target.value || undefined })} />
                  </label>
                  {SECTION_TEXT_SETTINGS.map(property => <label key={property} className="ui-dialog__label">
                    {t(`consultation.templates.builder.${property}`)}
                    <textarea className="ui-dialog__input" dir="auto" rows={2} maxLength={1000} value={section[property] ?? ''}
                      placeholder={property === 'guidance' && key ? t(`${key}.helper`) : property === 'example' ? example : undefined}
                      onChange={event => updateSection({ ...section, [property]: event.target.value || undefined })} />
                  </label>)}
                  <label className="ui-dialog__label">{t('consultation.templates.builder.format')}
                    <select className="ui-dialog__input" value={section.format ?? FORMATS[0]}
                      onChange={event => updateSection({ ...section, format: event.target.value as ConsultationSection['format'] })}>
                      {FORMATS.map(format => <option key={format} value={format}>{t(`consultation.templates.builder.${format}`)}</option>)}
                    </select>
                  </label>
                  <label className="consultation-library__archived">
                    <input type="checkbox" checked={section.level === 2}
                      onChange={event => updateSection({ ...section, level: event.target.checked ? 2 : undefined })} />
                    {t('consultation.templates.builder.subsection')}
                  </label>
                  {isDischarge && isCustomDischargeField(section.id) && <label className="consultation-library__archived">
                    <input type="checkbox" checked={section.ownerReport === true}
                      onChange={event => updateSection({ ...section, ownerReport: event.target.checked ? true : undefined })} />
                    {t('discharge.templates.ownerReport')}
                  </label>}
                  <button type="button" className="ui-btn ui-btn--secondary" disabled={sections.length === 1}
                    onClick={() => { updateSections(sections.filter(item => item.id !== section.id)); setExpanded(undefined); }}>
                    {t('consultation.templates.builder.removeSection')}
                  </button>
                </div>}
              </li>;
            })}
            {!isDischarge && <li>{t('settings:chart.pdf.images')}</li>}
          </ol>
          {editSelected && sections.length < CONSULTATION_SECTION_LIMIT && (adding
            ? <label className="ui-dialog__label">{t('consultation.templates.builder.addSection')}
              <select className="ui-dialog__input" value="" onChange={event => {
                if (event.target.value) addSection(event.target.value as ConsultationSection['id'] | 'custom');
              }}>
                <option value="">{t('consultation.templates.builder.chooseSection')}</option>
                <option value={CUSTOM_SECTION}>{t('consultation.templates.builder.customSection')}</option>
                {[...standardNoteFields(kind).map(id => ({ id })), ...consultationSections(starter)]
                  .filter((item, index, list) => !sections.some(section => section.id === item.id) && list.findIndex(other => other.id === item.id) === index)
                  .map(section => <option key={section.id} value={section.id}>{sectionName(section)}</option>)}
              </select>
            </label>
            : <button type="button" className="ui-btn ui-btn--secondary" onClick={() => setAdding(true)}>
              {t('consultation.templates.builder.addSection')}
            </button>)}
        </section>
      </div>
    </div>
    {error && <p role="alert" className="ui-dialog__error">{error}</p>}
    {!valid && !consultationLibraryFits(versionedDraft) && <p role="alert" className="ui-dialog__error">
      {t('consultation.templates.builder.libraryTooLarge')}
    </p>}
    <footer className="ui-dialog__actions consultation-library__footer">
      <button type="button" className="ui-btn ui-btn--secondary" disabled={saving} onClick={() => void close()}>{t('common:actions.close')}</button>
      {canEdit && <button type="button" className="ui-btn ui-btn--primary" disabled={!editable || !changed || !valid}
        onClick={() => void save()}>{t('common:actions.save')}</button>}
    </footer>
  </>;

  if (native) return <Sheet open title={title} confirmDismiss={canClose} onClose={onClose}>
    <div className="consultation-library">{body}</div>
  </Sheet>;
  return createPortal(<div className="ui-dialog-overlay" {...backdrop}>
    <div className="ui-dialog consultation-library" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} ref={focus} tabIndex={-1}
      onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); void close(); } }}>
      <h2 className="ui-dialog__title" id={`${id}-title`}>{title}</h2>
      {body}
    </div>
  </div>, document.body);
}
