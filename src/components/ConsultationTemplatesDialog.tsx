import { useId, useRef, useState, type PointerEvent } from 'react';
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
  CONSULTATION_SECTION_LIMIT, PRACTICE_NOTE_FIELD_LIMIT, practiceNoteFields, updatePracticeNoteField, imagingSectionKey, consultationHeadings, consultationChoices, consultationLibraryFits, consultationSectionKey, consultationSections, dentalSectionKey, isCustomNoteField, isCustomDischargeField, standardNoteFields, defaultNoteLayout,
  isConsultationStarter, parseConsultationLibrary,
  type PracticeNoteField, type NoteTemplateKind, type ConsultationSection, type ConsultationLayout, type ConsultationLibrary, type PracticeConsultationTemplate,
} from '../utils/consultationTemplates';

const SECTION_TEXT_SETTINGS = ['guidance', 'example', 'suggestedText'] as const;
const FORMATS = ['paragraph', 'bullets'] as const;
const DETAIL_LEVELS = ['concise', 'detailed'] as const;

interface Props {
  kind?: NoteTemplateKind;
  initial: ConsultationLibrary;
  status: 'loading' | 'error' | 'ready';
  canEdit: boolean;
  onSave: (draft: ConsultationLibrary) => Promise<void>;
  onReload: () => void;
  onClose: () => void;
  onOpenSettings?: () => void;
}

export function ConsultationTemplatesDialog({ kind = 'consultation', initial, status, canEdit, onSave, onReload, onClose, onOpenSettings }: Props) {
  const { t, i18n } = useTranslation(['visitDocumentation', 'common', 'reportui', 'settings']);
  const id = useId();
  const isDischarge = kind === 'discharge';
  const isImaging = kind === 'imaging';
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
  const [search, setSearch] = useState('');
  const [fieldName, setFieldName] = useState('');
  const [creating, setCreating] = useState(false);
  const [managing, setManaging] = useState(false);
  const [removed, setRemoved] = useState<{ id: string; section: ConsultationSection; index: number }>();
  const [announcement, setAnnouncement] = useState('');
  const [dragTarget, setDragTarget] = useState<number>();
  const drag = useRef<{ pointer: number; from: number; to: number; startY: number } | null>(null);
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
  const practiceFields = practiceNoteFields(draft, kind);
  const canCreateField = (draft.practiceFields?.length ?? 0) < PRACTICE_NOTE_FIELD_LIMIT;
  const selectedTemplateIndex = activeTemplates.findIndex(template => template.id === selected.id);
  const versionedDraft: ConsultationLibrary = { ...draft, version: CONSULTATION_LIBRARY_VERSION };
  const valid = !!parseConsultationLibrary(versionedDraft, kind);
  const language = i18n.resolvedLanguage ?? i18n.language;
  const nameOf = (template: ConsultationLayout) => isImaging && template.id === starter.id
    ? t('imaging.templates.starter')
    : isDischarge && template.id === starter.id
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
    setCreating(false);
    setManaging(false);
    setRemoved(undefined);
    setAnnouncement('');
  };
  const sectionName = (section: ConsultationSection) => {
    const key = consultationSectionKey(section);
    const imagingKey = imagingSectionKey(section.id);
    if (imagingKey) return section.label?.trim() || t(`imaging.sections.${imagingKey}`);
    return section.label?.trim() || (key ? t(`${key}.label`) : t('consultation.templates.builder.customSection'));
  };
  const newFieldId = (): PracticeNoteField['id'] => isDischarge ? `dischargeCustom_${crypto.randomUUID()}` as const : `consultationCustom_${crypto.randomUUID()}` as const;
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
    if (!custom) return;
    const next = { ...draft, templates: draft.templates.map(template => template.id === custom.id
      ? { ...custom, sections: sections.map(item => item.id === section.id ? section : item) } : template) };
    const shared = practiceFields.find(field => field.id === section.id);
    const old = sections.find(item => item.id === section.id);
    if (shared && old && (old.label !== section.label || SECTION_TEXT_SETTINGS.some(key => old[key] !== section[key]))
      && (canCreateField || draft.practiceFields?.some(field => field.id === shared.id))) {
      const { label, guidance, example, suggestedText } = section;
      setDraft(updatePracticeNoteField(next, { ...shared, label: label ?? '', guidance, example, suggestedText }));
    } else setDraft(next);
  };
  const closePicker = () => {
    setAdding(false);
    setSearch('');
    setCreating(false);
    setManaging(false);
  };
  const addSection = (section: ConsultationSection) => {
    if (!custom || sections.length >= CONSULTATION_SECTION_LIMIT || sections.some(item => item.id === section.id)) return;
    updateSections([...sections, section]);
    setExpanded(section.id);
    closePicker();
  };
  const createField = () => {
    const label = fieldName.trim();
    if (!custom || !canCreateField || !label || sections.length >= CONSULTATION_SECTION_LIMIT) return;
    const field = { id: newFieldId(), label };
    setDraft({
      ...draft, practiceFields: [...(draft.practiceFields ?? []), field],
      templates: draft.templates.map(template => template.id === custom.id
        ? { ...custom, sections: [...sections, field] } : template),
    });
    setFieldName('');
    setExpanded(field.id);
    closePicker();
  };
  const toggleFieldArchive = (field: PracticeNoteField) => {
    const members = draft.practiceFields ?? [];
    const known = members.some(item => item.id === field.id);
    if (!known && !canCreateField) return;
    const updated = { ...field, archived: !field.archived };
    setDraft({ ...draft, practiceFields: known ? members.map(item => item.id === field.id ? updated : item) : [...members, updated] });
  };
  const fieldToKeep = (id: ConsultationSection['id']) => {
    if (draft.practiceFields?.some(field => field.id === id)) return undefined;
    return practiceFields.find(field => field.id === id);
  };
  const remove = (index: number) => {
    if (!custom || sections.length <= 1) return;
    const section = sections[index];
    const field = fieldToKeep(section.id);
    if (field && !canCreateField) return;
    setDraft({
      ...draft,
      ...(field ? { practiceFields: [...(draft.practiceFields ?? []), field] } : {}),
      templates: draft.templates.map(template => template.id === custom.id
        ? { ...custom, sections: sections.filter(item => item.id !== section.id) } : template),
    });
    if (expanded === section.id) setExpanded(undefined);
    setRemoved({ id: custom.id, section, index });
    setAnnouncement('');
  };
  const undoRemove = () => {
    if (!removed || removed.id !== custom?.id || sections.some(section => section.id === removed.section.id)
      || sections.length >= CONSULTATION_SECTION_LIMIT) return;
    const items = [...sections];
    items.splice(removed.index, 0, removed.section);
    updateSections(items);
    setRemoved(undefined);
    setAnnouncement('');
  };
  const move = (index: number, destination: number) => {
    if (index === destination || destination < 0 || destination >= sections.length) return;
    const items = [...sections];
    const [field] = items.splice(index, 1);
    items.splice(destination, 0, field);
    updateSections(items);
    setAnnouncement(t('consultation.templates.builder.sectionMoved', { field: sectionName(field), position: destination + 1 }));
  };
  const startDrag = (event: PointerEvent<HTMLButtonElement>, index: number) => {
    if (event.button !== 0 || sections.length < 2) return;
    drag.current = { pointer: event.pointerId, from: index, to: index, startY: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const trackDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const current = drag.current;
    if (!current || current.pointer !== event.pointerId || Math.abs(event.clientY - current.startY) < 4 && dragTarget === undefined) return;
    const container = event.currentTarget.closest('.consultation-library__body');
    const bounds = container?.getBoundingClientRect();
    if (bounds && event.clientY < bounds.top + 32) container?.scrollBy(0, -14);
    if (bounds && event.clientY > bounds.bottom - 32) container?.scrollBy(0, 14);
    const row = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-section-row]');
    if (!row || !container?.contains(row)) return;
    current.to = Number(row.dataset.sectionRow);
    setDragTarget(current.to);
  };
  const finishDrag = (event: PointerEvent<HTMLButtonElement>, apply: boolean) => {
    const current = drag.current;
    if (!current || current.pointer !== event.pointerId) return;
    if (apply) move(current.from, current.to);
    drag.current = null;
    setDragTarget(undefined);
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

  const title = t(isImaging ? 'imaging.templates.title' : isDischarge ? 'discharge.templates.title' : 'consultation.templates.title');
  const body = <>
    <div className="consultation-library__body">
      <div className="consultation-library__intro">
        <p>{t(isImaging ? 'imaging.templates.intro' : isDischarge ? 'discharge.templates.intro' : 'consultation.templates.intro')}</p>
        <a className="visit-documentation__guide" href={documentationUrl(language, isImaging ? 'imaging' : isDischarge ? 'discharge' : 'consultation-templates')}
          target="_blank" rel="noopener noreferrer">{t(isImaging ? 'imaging.templates.help' : isDischarge ? 'discharge.templates.help' : 'consultation.templates.help')}</a>
        {onOpenSettings && <button type="button" className="ui-btn ui-btn--secondary" onClick={async () => {
          if (!(await canClose())) return;
          onClose();
          onOpenSettings();
        }}>{t('imaging.templates.settings')}</button>}
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
          {editSelected && !isImaging && <details className="consultation-library__settings">
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
              return <li key={section.id} data-section-row={index} data-drop-target={dragTarget === index || undefined}
                className={section.level === 2 ? 'consultation-library__subsection' : undefined}>
                <div className="consultation-library__section-row">
                  {editSelected && <button type="button" className="consultation-library__row-action consultation-library__drag"
                    aria-label={t('consultation.templates.builder.dragField', { field: label })}
                    aria-keyshortcuts="ArrowUp ArrowDown"
                    onPointerDown={event => startDrag(event, index)} onPointerMove={trackDrag}
                    onPointerUp={event => finishDrag(event, true)} onPointerCancel={event => finishDrag(event, false)}
                    onLostPointerCapture={event => finishDrag(event, false)}
                    onKeyDown={event => {
                      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
                      event.preventDefault();
                      move(index, index + (event.key === 'ArrowUp' ? -1 : 1));
                    }}><span aria-hidden="true">⠿</span></button>}
                  <div className="consultation-library__row-label">
                    {editSelected ? <button type="button" className="consultation-library__section-name"
                      aria-expanded={expanded === section.id} aria-controls={`${id}-${section.id}`}
                      onClick={() => setExpanded(expanded === section.id ? undefined : section.id)}>{label}</button> : <span dir="auto">{label}</span>}
                    {preview && example && (section.format === 'bullets'
                      ? <ul>{example.split(/\r?\n/u).filter(Boolean).map((line, n) => <li key={n}>{line}</li>)}</ul>
                      : <p>{example}</p>)}
                  </div>
                  {editSelected && <button type="button" className="consultation-library__row-action consultation-library__remove"
                    disabled={sections.length === 1 || (!canCreateField && !!fieldToKeep(section.id))} aria-label={t('consultation.templates.builder.removeNamed', { field: label })}
                    onClick={() => remove(index)}><span aria-hidden="true">×</span></button>}
                </div>
                {editSelected && expanded === section.id && <div className="consultation-library__settings" id={`${id}-${section.id}`}>
                  <label className="ui-dialog__label">{t('consultation.templates.builder.sectionLabel')}
                    <input className="ui-dialog__input" dir="auto" maxLength={100} value={section.label ?? ''}
                      placeholder={key ? t(`${key}.label`) : undefined}
                      onChange={event => updateSection({ ...section, label: event.target.value || undefined })} />
                  </label>
                  {SECTION_TEXT_SETTINGS.filter(property => !isImaging || property !== 'suggestedText').map(property => <label key={property} className="ui-dialog__label">
                    {t(`consultation.templates.builder.${property}`)}
                    <textarea className="ui-dialog__input" dir="auto" rows={2} maxLength={1000} value={section[property] ?? ''}
                      placeholder={property === 'guidance' && key ? t(`${key}.helper`) : property === 'example' ? example : undefined}
                      onChange={event => updateSection({ ...section, [property]: event.target.value || undefined })} />
                  </label>)}
                  {!isImaging && <>
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
                  </>}
                  {isDischarge && isCustomDischargeField(section.id) && <label className="consultation-library__archived">
                    <input type="checkbox" checked={section.ownerReport === true}
                      onChange={event => updateSection({ ...section, ownerReport: event.target.checked ? true : undefined })} />
                    {t('discharge.templates.ownerReport')}
                  </label>}
                </div>}
              </li>;
            })}
            {kind === 'consultation' && <li>{t('settings:chart.pdf.images')}</li>}
          </ol>
          <div role="status" className="visually-hidden">{announcement}</div>
          <div role="status" className="consultation-library__undo">
            {removed && removed.id === custom?.id && <span>{t('consultation.templates.builder.fieldRemoved', { field: sectionName(removed.section) })}</span>}
            {editSelected && removed && removed.id === custom?.id && !sections.some(section => section.id === removed.section.id)
              && sections.length < CONSULTATION_SECTION_LIMIT && <button type="button" className="consultation-library__row-action"
                onClick={undoRemove}>{t('consultation.templates.builder.undoRemove')}</button>}
          </div>
          {editSelected && sections.length < CONSULTATION_SECTION_LIMIT && <>
            <button type="button" className="ui-btn ui-btn--secondary" aria-expanded={adding}
              onClick={() => adding ? closePicker() : setAdding(true)}>{t('consultation.templates.builder.addSection')}</button>
            {adding && <div className="consultation-library__picker">
              {managing ? <>
                <h4>{t('consultation.templates.builder.manageFields')}</h4>
                {practiceFields.length === 0 && <p>{t('consultation.templates.builder.noPracticeFields')}</p>}
                <ul className="consultation-library__field-list">
                  {practiceFields.map(field => <li key={field.id}>
                    <span dir="auto">{field.label}</span>
                    <button type="button" className="consultation-library__row-action"
                      disabled={!canCreateField && !draft.practiceFields?.some(item => item.id === field.id)}
                      onClick={() => toggleFieldArchive(field)}>
                      {t(field.archived ? 'consultation.templates.builder.restoreField' : 'consultation.templates.builder.archiveField')}
                    </button>
                  </li>)}
                </ul>
                <button type="button" className="ui-btn ui-btn--secondary"
                  onClick={() => setManaging(false)}>{t('common:actions.close')}</button>
              </> : creating ? <>
                <label className="ui-dialog__label">{t('consultation.templates.builder.fieldName')}
                  <input className="ui-dialog__input" dir="auto" maxLength={100} autoFocus value={fieldName}
                    onChange={event => setFieldName(event.target.value)}
                    onKeyDown={event => { if (event.key === 'Enter') createField(); }} />
                </label>
                <button type="button" className="ui-btn ui-btn--primary" disabled={!fieldName.trim()} onClick={createField}>
                  {t('consultation.templates.builder.createField')}
                </button>
              </> : <>
                <label className="ui-dialog__label">{t('consultation.templates.builder.searchSections')}
                  <input className="ui-dialog__input" type="search" autoFocus value={search} onChange={event => setSearch(event.target.value)} />
                </label>
                {(() => {
                  const matching = (section: ConsultationSection) => sectionName(section).toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
                  const builtIn = [...new Map([...standardNoteFields(kind).map(id => ({ id })), ...consultationSections(starter)]
                    .map(section => [section.id, section])).values()].filter(matching);
                  const shared = practiceFields.filter(field => !field.archived && matching(field));
                  const group = (heading: string, entries: readonly ConsultationSection[]) => entries.length > 0 && <div>
                    <h4>{heading}</h4>
                    <ul className="consultation-library__field-list">{entries.map(section => {
                      const added = sections.some(item => item.id === section.id);
                      return <li key={section.id}>
                        <button type="button" className="consultation-library__row-action" dir="auto" disabled={added}
                          onClick={() => {
                            const { id, label, guidance, example, suggestedText } = section;
                            addSection({ id, label, guidance, example, suggestedText });
                          }}>
                          <span>{sectionName(section)}</span>
                          {added && <small>{t('consultation.templates.builder.alreadyAdded')}</small>}
                        </button>
                      </li>;
                    })}</ul>
                  </div>;
                  return <>
                    {group(t('consultation.templates.builder.practiceFields'), shared)}
                    {group(t('consultation.templates.builder.builtInFields'), builtIn)}
                    {!shared.length && !builtIn.length && <p role="status">{t('consultation.templates.builder.noFields')}</p>}
                  </>;
                })()}
                <div className="consultation-library__tools">
                  <button type="button" className="ui-btn ui-btn--secondary" disabled={!canCreateField}
                    onClick={() => { setFieldName(search); setCreating(true); }}>{t('consultation.templates.builder.createField')}</button>
                  <button type="button" className="ui-btn ui-btn--secondary"
                    onClick={() => setManaging(true)}>{t('consultation.templates.builder.manageFields')}</button>
                </div>
              </>}
            </div>}
          </>}
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
