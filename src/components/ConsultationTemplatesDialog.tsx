import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useReorderList } from '../hooks/useReorderList';
import { ReorderHandle } from './ui/ReorderHandle';
import { useModalFocus } from '../hooks/useModalFocus';
import { useBackdropDismiss } from '../hooks/useBackdropDismiss';
import { documentationUrl } from '../help/openDocumentation';
import { isNativeApp } from '../native/platform';
import { Sheet } from '../ios/Sheet';
import { confirmDialog, friendlyError } from './ui/dialogs';
import {
  noteLibraryVersion, noteTemplateSections, splitNoteTemplateSections, NOTE_IMAGES_ID, CONSULTATION_TEMPLATE_LIMIT, CONSULTATION_TEMPLATE_NAME_LIMIT,
  CONSULTATION_SECTION_LIMIT, PRACTICE_NOTE_FIELD_LIMIT, practiceNoteFields, updatePracticeNoteField, consultationHeadings, consultationChoices, consultationLibraryFits, consultationSectionKey, consultationSections, dentalSectionKey, isCustomNoteField, isCustomDischargeField, standardNoteFields, defaultNoteLayout, dischargeStarterNameKey, DISCHARGE_RECOVERY_ACTIVITY, DENTAL_RECOVERY, STANDARD_DISCHARGE,
  consultationStarterNameKey, isNoteStarter, noteStarterName, canConfigureNoteInput, NOTE_INPUT_TYPES, NOTE_OPTION_LIMIT, NOTE_OPTION_LENGTH, parseConsultationLibrary, IMAGING_REPORT_KINDS, IMAGING_STARTER_TEXT_LIMIT,
  type PracticeNoteField, type NoteTemplateKind, type NoteTemplateSection, type ConsultationSection, type ConsultationLayout, type ConsultationLibrary, type PracticeConsultationTemplate,
} from '../utils/consultationTemplates';

const SECTION_TEXT_SETTINGS = ['guidance', 'example', 'suggestedText'] as const;
const IMAGE_TEXT_SETTINGS = ['guidance'] as const;
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
  const { t, i18n } = useTranslation(['visitDocumentation', 'common', 'reportui', 'settings', 'library', 'app', 'forms']);
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
  const listRef = useRef<HTMLUListElement>(null);
  const templateNameInput = useRef<HTMLInputElement>(null);
  const focusTemplate = useRef(false);
  const [newTemplateId, setNewTemplateId] = useState<string>();
  useEffect(() => {
    if (!newTemplateId) return;
    templateNameInput.current?.focus();
    templateNameInput.current?.select();
  }, [newTemplateId]);
  const [preview, setPreview] = useState(false);
  const [expanded, setExpanded] = useState<NoteTemplateSection['id']>();
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState('');
  const [fieldName, setFieldName] = useState('');
  const [creating, setCreating] = useState(false);
  const [managing, setManaging] = useState(false);
  const [removed, setRemoved] = useState<{ id: string; section: NoteTemplateSection; index: number }>();
  const [announcement, setAnnouncement] = useState('');
  const [sample, setSample] = useState('');
  const [importing, setImporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [error, setError] = useState('');
  const changed = draft !== initial && JSON.stringify(draft) !== JSON.stringify(initial);
  const activeTemplates = consultationChoices(draft, kind);
  const templates = activeTemplates;
  const selected: ConsultationLayout = templates.find(template => template.id === selectedId) ?? activeTemplates[0] ?? starter;
  useEffect(() => {
    if (!focusTemplate.current) return;
    focusTemplate.current = false;
    listRef.current?.querySelector<HTMLButtonElement>('[aria-current="true"]')?.focus();
  }, [selected.id]);
  const builtin = isNoteStarter(selected.id, kind);
  const stored = draft.templates.find(template => template.id === selected.id);
  const custom = stored ?? (builtin ? { ...selected, name: noteStarterName(selected.id) } : undefined);
  const editable = status === 'ready' && canEdit && !saving;
  const canAddTemplate = editable && draft.templates.filter(template => !isNoteStarter(template.id, kind)).length < CONSULTATION_TEMPLATE_LIMIT;
  const editSelected = editable && !!custom && !custom.archived && !preview;
  const sections = noteTemplateSections(selected, kind);
  const textSectionCount = consultationSections(selected).length;
  const practiceFields = practiceNoteFields(draft, kind);
  const canCreateField = (draft.practiceFields?.length ?? 0) < PRACTICE_NOTE_FIELD_LIMIT;
  const canReorderTemplates = editable && activeTemplates.length > 1;
  const versionedDraft: ConsultationLibrary = { ...draft, version: noteLibraryVersion(kind) };
  const valid = !!parseConsultationLibrary(versionedDraft, kind);
  const language = i18n.resolvedLanguage ?? i18n.language;
  const nameOf = (template: ConsultationLayout) => {
    const dischargeKey = isDischarge && dischargeStarterNameKey(template);
    if (dischargeKey) return t(dischargeKey);
    const consultKey = consultationStarterNameKey(template);
    if (consultKey) return t(consultKey);
    return template.name || t('consultation.templates.untitled');
  };
  const replaceTemplate = (template: PracticeConsultationTemplate) => draft.templates.some(item => item.id === template.id)
    ? draft.templates.map(item => item.id === template.id ? template : item) : [...draft.templates, template];
  const update = (template: PracticeConsultationTemplate) => setDraft({ ...draft, templates: replaceTemplate(template) });
  const choose = (templateId: string) => {
    setSelectedId(templateId);
    setNewTemplateId(undefined);
    setImporting(false);
    setPreview(false);
    setExpanded(undefined);
    setAdding(false);
    setCreating(false);
    setManaging(false);
    setRemoved(undefined);
    setAnnouncement('');
  };
  const sectionName = (section: NoteTemplateSection) => {
    if (section.id === NOTE_IMAGES_ID) return section.label?.trim() || t('settings:chart.pdf.images');
    const key = consultationSectionKey({ ...section, id: section.id });
    return section.label?.trim() || (key ? t(`${key}.label`) : t('consultation.templates.builder.customSection'));
  };
  const newFieldId = (): PracticeNoteField['id'] => isDischarge ? `dischargeCustom_${crypto.randomUUID()}` as const : `consultationCustom_${crypto.randomUUID()}` as const;
  const addTemplate = (template: Omit<PracticeConsultationTemplate, 'id'>) => {
    if (!canAddTemplate) return;
    const id = crypto.randomUUID();
    setDraft({ ...draft, templates: [...draft.templates, { ...template, id }] });
    choose(id);
    setNewTemplateId(id);
  };
  const createTemplate = () => {
    const startingLayout = isDischarge ? STANDARD_DISCHARGE : starter;
    addTemplate({ name: t('consultation.templates.untitled'), fields: startingLayout.fields, sections: consultationSections(startingLayout) });
  };
  const duplicate = () => addTemplate({
    name: [...t('reportui:templates.copyName', { name: nameOf(selected) })].slice(0, CONSULTATION_TEMPLATE_NAME_LIMIT).join(''),
    fields: selected.fields, sections: consultationSections(selected), imagePlacement: selected.imagePlacement,
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
  const updateSections = (items: readonly NoteTemplateSection[]) => {
    if (custom) update({ ...custom, ...splitNoteTemplateSections(items, kind) });
  };
  const updateSection = (section: NoteTemplateSection) => {
    if (!custom) return;
    const updated = sections.map(item => item.id === section.id ? section : item);
    if (section.id === NOTE_IMAGES_ID) { updateSections(updated); return; }
    const next = { ...draft, templates: replaceTemplate({ ...custom, ...splitNoteTemplateSections(updated, kind) }) };
    const shared = practiceFields.find(field => field.id === section.id);
    const old = sections.find(item => item.id === section.id);
    if (shared && old && (old.label !== section.label || SECTION_TEXT_SETTINGS.some(key => old[key] !== section[key]) || old.inputType !== section.inputType || old.options !== section.options)
      && (canCreateField || draft.practiceFields?.some(field => field.id === shared.id))) {
      const { label, guidance, example, suggestedText, inputType, options } = section;
      setDraft(updatePracticeNoteField(next, { ...shared, label: label ?? '', guidance, example, suggestedText, inputType, options }));
    } else setDraft(next);
  };
  const closePicker = () => {
    setAdding(false);
    setSearch('');
    setCreating(false);
    setManaging(false);
  };
  const addSection = (section: NoteTemplateSection) => {
    if (!custom || (section.id !== NOTE_IMAGES_ID && textSectionCount >= CONSULTATION_SECTION_LIMIT) || sections.some(item => item.id === section.id)) return;
    updateSections([...sections, section]);
    setExpanded(section.id);
    closePicker();
  };
  const createField = () => {
    const label = fieldName.trim();
    if (!custom || !canCreateField || !label || textSectionCount >= CONSULTATION_SECTION_LIMIT) return;
    const field = { id: newFieldId(), label };
    setDraft({
      ...draft, practiceFields: [...(draft.practiceFields ?? []), field],
      templates: replaceTemplate({ ...custom, ...splitNoteTemplateSections([...sections, field], kind) }),
    });
    setFieldName('');
    setExpanded(field.id);
    closePicker();
  };
  const deletePracticeField = async (field: PracticeNoteField) => {
    const members = draft.practiceFields ?? [];
    const known = members.some(item => item.id === field.id);
    if (!known && !canCreateField) return;
    if (!await confirmDialog({
      title: t('library:templates.deleteTitle', { name: field.label }),
      message: t('consultation.templates.builder.deletePracticeFieldMessage'),
      confirmLabel: t('common:actions.delete'),
      danger: true,
    })) return;
    // A field may still be referenced by an existing template. Its hidden
    // entry keeps that definition from being rediscovered in the picker.
    const inUse = draft.templates.some(template => template.sections?.some(section => section.id === field.id));
    const remaining = members.filter(item => item.id !== field.id);
    setDraft({ ...draft, practiceFields: inUse ? [...remaining, { ...field, archived: true }] : remaining });
  };
  const fieldToKeep = (id: ConsultationSection['id']) => {
    if (draft.practiceFields?.some(field => field.id === id)) return undefined;
    return practiceFields.find(field => field.id === id);
  };
  const remove = (index: number) => {
    if (!custom) return;
    const section = sections[index];
    if (section.id !== NOTE_IMAGES_ID && textSectionCount <= 1) return;
    const field = section.id === NOTE_IMAGES_ID ? undefined : fieldToKeep(section.id);
    if (field && !canCreateField) return;
    setDraft({
      ...draft,
      ...(field ? { practiceFields: [...(draft.practiceFields ?? []), field] } : {}),
      templates: replaceTemplate({ ...custom, ...splitNoteTemplateSections(sections.filter(item => item.id !== section.id), kind) }),
    });
    if (expanded === section.id) setExpanded(undefined);
    setRemoved({ id: custom.id, section, index });
    setAnnouncement('');
  };
  const undoRemove = () => {
    if (!removed || removed.id !== custom?.id || sections.some(section => section.id === removed.section.id)
      || (removed.section.id !== NOTE_IMAGES_ID && textSectionCount >= CONSULTATION_SECTION_LIMIT)) return;
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
  const moveTemplate = (index: number, destination: number) => {
    if (index === destination || index < 0 || destination < 0 || destination >= activeTemplates.length) return;
    const order = activeTemplates.map(template => template.id);
    const [templateId] = order.splice(index, 1);
    order.splice(destination, 0, templateId);
    setDraft({ ...draft, order });
    setAnnouncement(t('discharge.templates.templateMoved', {
      template: nameOf(activeTemplates[index]), position: destination + 1,
    }));
  };
  const templateReorder = useReorderList('.consultation-library__template-list', 'data-template-row', activeTemplates.length, moveTemplate);
  const sectionReorder = useReorderList('.consultation-library__sections', 'data-section-row', sections.length, move);
  const fallbackTemplate = activeTemplates.find(template => template.id === starter.id && template.id !== selected.id)
    ?? activeTemplates.find(template => template.id !== selected.id);
  const fieldsToKeepOnDelete = sections.flatMap(section => {
    const field = practiceFields.find(item => item.id === section.id);
    return field && !draft.practiceFields?.some(item => item.id === field.id)
      && !draft.templates.some(template => template.id !== selected.id && template.sections?.some(item => item.id === field.id))
      ? [field] : [];
  });
  const canDelete = !!custom && !!fallbackTemplate
    && (draft.practiceFields?.length ?? 0) + fieldsToKeepOnDelete.length <= PRACTICE_NOTE_FIELD_LIMIT;
  const deleteTemplate = async () => {
    if (!custom || !canDelete || !await confirmDialog({
      title: t('library:templates.deleteTitle', { name: nameOf(selected) }),
      message: t('discharge.templates.deleteMessage'),
      confirmLabel: t('common:actions.delete'),
      danger: true,
    })) return;
    setDraft({
      ...draft,
      defaultId: draft.defaultId === selected.id && fallbackTemplate ? fallbackTemplate.id : draft.defaultId,
      templates: builtin
        ? replaceTemplate({ ...custom, archived: true })
        : draft.templates.filter(template => template.id !== selected.id),
      ...(draft.order ? { order: draft.order.filter(id => id !== selected.id) } : {}),
      ...(fieldsToKeepOnDelete.length ? { practiceFields: [...(draft.practiceFields ?? []), ...fieldsToKeepOnDelete] } : {}),
    });
    focusTemplate.current = true;
    choose(fallbackTemplate?.id ?? draft.defaultId);
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

  const title = t(isImaging ? 'imaging.layout.title' : isDischarge ? 'discharge.templates.title' : 'consultation.templates.title');
  const body = <>
    <div className="consultation-library__body">
      <div className="consultation-library__intro">
        <p>{t(isImaging ? 'imaging.layout.intro' : isDischarge ? 'discharge.templates.intro' : 'consultation.templates.intro')}</p>
        <a className="visit-documentation__guide" href={documentationUrl(language, isImaging ? 'imaging' : isDischarge ? 'discharge' : 'consultation-templates')}
          target="_blank" rel="noopener noreferrer">{t(isImaging ? 'imaging.layout.help' : isDischarge ? 'discharge.templates.help' : 'consultation.templates.help')}</a>
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
      {isImaging ? <div className="consultation-library__imaging-fields">
        {IMAGING_REPORT_KINDS.map(kind => {
          const defaultTitle = t(kind === 'ct' ? 'app:ct.title' : 'app:radiographic.title');
          const field = draft.imagingReportFields?.[kind];
          const updateField = (name: 'label' | 'starterText', value: string) => setDraft({
            ...draft, imagingReportFields: { ...draft.imagingReportFields, [kind]: { ...field, [name]: value } },
          });
          return <details key={kind} className="consultation-library__settings">
            <summary><bdi>{field?.label?.trim() || defaultTitle}</bdi></summary>
            <label className="ui-dialog__label">
              {t('consultation.templates.builder.sectionLabel')}
              <input className="ui-dialog__input" dir="auto" maxLength={CONSULTATION_TEMPLATE_NAME_LIMIT}
                value={field?.label ?? ''} placeholder={defaultTitle} readOnly={!editable}
                onChange={event => updateField('label', event.target.value)} />
            </label>
            <label className="ui-dialog__label">
              {t('imaging.layout.starterText')}
              <textarea className="ui-dialog__input" dir="auto" rows={4} maxLength={IMAGING_STARTER_TEXT_LIMIT}
                value={field?.starterText ?? ''} readOnly={!editable} onChange={event => updateField('starterText', event.target.value)} />
            </label>
          </details>;
        })}
      </div> : <div className="consultation-library__layout">
        <div className="consultation-library__list">
          <span id={`${id}-picker`} className="patient-form__label">{t('consultation.templates.label')}</span>
          <ul ref={listRef} aria-labelledby={`${id}-picker`} data-template-sortable={canReorderTemplates || undefined}
            className={templates.length > 6 ? 'consultation-library__template-list consultation-library__list--scroll' : 'consultation-library__template-list'}>
            {templates.map((template, index) => {
              const sortable = canReorderTemplates && index < activeTemplates.length;
              return <li key={template.id} data-template-row={sortable ? index : undefined} data-drop-target={templateReorder.dropAt(index)}>
                {sortable && <ReorderHandle index={index} reorder={templateReorder}
                  label={t('discharge.templates.dragTemplate', { template: nameOf(template) })} />}
                <button type="button" className="consultation-library__template-choice" aria-current={template.id === selected.id || undefined}
                  onClick={() => { if (template.id !== selected.id) choose(template.id); }}><span dir="auto">{nameOf(template)}</span>
                  {template.id === draft.defaultId && <small>{t('consultation.templates.default')}</small>}
                </button>
              </li>;
            })}
          </ul>
          {editable && <button type="button" className="ui-btn ui-btn--secondary consultation-library__new"
            disabled={!canAddTemplate} onClick={createTemplate}><span aria-hidden="true">+</span> {t('library:templates.new')}</button>}
        </div>
        <section className="consultation-library__editor" aria-labelledby={`${id}-name`}>
          <header className={editSelected ? 'visually-hidden' : 'consultation-library__heading'}>
            <h3 id={`${id}-name`}><bdi>{nameOf(selected)}</bdi></h3>
          </header>
          {editSelected && <label className="ui-dialog__label">
            {t('reportui:templates.nameLabel')}
            <input ref={templateNameInput} className="ui-dialog__input" dir="auto" maxLength={CONSULTATION_TEMPLATE_NAME_LIMIT}
              value={dischargeStarterNameKey(custom) || consultationStarterNameKey(custom) ? nameOf(custom) : custom.name}
              onChange={event => update({ ...custom, name: event.target.value })} />
          </label>}
          <div className="consultation-library__tools consultation-library__tools--discharge">
            <button type="button" className="ui-btn ui-btn--secondary" aria-pressed={preview}
              onClick={() => setPreview(!preview)}>{t('consultation.templates.preview')}</button>
            {editable && <details key={selected.id}>
              <summary>{t('consultation.templates.options')}</summary>
              <div className="consultation-library__menu consultation-library__menu--discharge">
                <button type="button" disabled={!canAddTemplate} onClick={duplicate}>{t('common:actions.duplicate')}</button>
                <button type="button" disabled={selected.id === draft.defaultId}
                  onClick={() => setDraft({ ...draft, defaultId: selected.id })}>{t('consultation.templates.setDefault')}</button>
                <button type="button" disabled={!canAddTemplate}
                  onClick={() => setImporting(!importing)}>{t('consultation.templates.builder.importTitle')}</button>
                <button type="button" className="consultation-library__delete" disabled={!canDelete}
                  onClick={() => void deleteTemplate()}>{t('library:templates.deleteConfirm')}</button>
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
              const sectionId = section.id;
              const imageSection = sectionId === NOTE_IMAGES_ID;
              const key = imageSection ? undefined : consultationSectionKey({ ...section, id: sectionId });
              const dentalKey = imageSection ? undefined : dentalSectionKey(sectionId);
              const textSettings: readonly (typeof SECTION_TEXT_SETTINGS)[number][] = imageSection ? IMAGE_TEXT_SETTINGS : SECTION_TEXT_SETTINGS;
              const example = imageSection ? undefined : section.example ?? (sectionId === DISCHARGE_RECOVERY_ACTIVITY ? t('discharge.templates.activity.sample') : dentalKey ? t(`consultation.dental.${dentalKey}.sample`)
                : isCustomNoteField(sectionId) ? ''
                  : sectionId === 'dischargeMedications' || sectionId === 'dischargeInstructions' || sectionId === 'dischargeFollowUp'
                    ? t(`discharge.templates.samples.${sectionId}`) : t(`consultation.templates.samples.${sectionId}`));
              return <li key={section.id} data-section-row={index} data-drop-target={sectionReorder.dropAt(index)}
                className={section.level === 2 ? 'consultation-library__subsection' : undefined}>
                <div className="consultation-library__section-row">
                  {editSelected && <ReorderHandle index={index} reorder={sectionReorder}
                    label={t('consultation.templates.builder.dragField', { field: label })} />}
                  <div className="consultation-library__row-label">
                    {editSelected ? <button type="button" className="consultation-library__section-name"
                      aria-expanded={expanded === section.id} aria-controls={`${id}-${section.id}`}
                      onClick={() => setExpanded(expanded === section.id ? undefined : section.id)}>{label}</button> : <span dir="auto">{label}</span>}
                    {preview && section.options && <ul className="consultation-library__preview-choices">
                      {section.options.map((option, optionIndex) => <li key={optionIndex}>
                        <label className="choice-row">
                          <input type={section.inputType === 'radio' ? 'radio' : 'checkbox'} disabled />
                          <span dir="auto">{option}</span>
                        </label>
                      </li>)}
                    </ul>}
                    {preview && !section.options && example && (section.format === 'bullets'
                      ? <ul>{example.split(/\r?\n/u).filter(Boolean).map((line, n) => <li key={n}>{line}</li>)}</ul>
                      : <p>{example}</p>)}
                  </div>
                  {editSelected && <button type="button" className="consultation-library__row-action consultation-library__remove"
                    disabled={!imageSection && (textSectionCount === 1 || (!canCreateField && !!fieldToKeep(sectionId)))} aria-label={t('consultation.templates.builder.removeNamed', { field: label })}
                    onClick={() => remove(index)}><span aria-hidden="true">×</span></button>}
                </div>
                {editSelected && expanded === section.id && <div className="consultation-library__settings" id={`${id}-${section.id}`}>
                  <label className="ui-dialog__label">{t('consultation.templates.builder.sectionLabel')}
                    <input className="ui-dialog__input" dir="auto" maxLength={100} value={section.label ?? ''}
                      placeholder={imageSection ? t('settings:chart.pdf.images') : key ? t(`${key}.label`) : undefined}
                      onChange={event => updateSection({ ...section, label: event.target.value || undefined })} />
                  </label>
                  {!imageSection && canConfigureNoteInput(sectionId, kind) && <>
                    <label className="ui-dialog__label">{t('forms:customEditor.fieldType')}
                      <select className="ui-dialog__input" value={section.inputType ?? ''}
                        onChange={event => {
                          const inputType = (event.target.value || undefined) as ConsultationSection['inputType'];
                          const options = inputType === 'radio' || inputType === 'multiselect' ? section.options ?? [''] : undefined;
                          updateSection({ ...section, inputType, options });
                        }}>
                        <option value="">{t('consultation.templates.builder.inputTypes.paragraph')}</option>
                        {NOTE_INPUT_TYPES.map(type => <option key={type} value={type}>
                          {t(`consultation.templates.builder.inputTypes.${type}`)}
                        </option>)}
                      </select>
                    </label>
                    {section.options && <fieldset className="consultation-library__input-options">
                      <legend>{t('consultation.templates.builder.choiceOptions')}</legend>
                      {section.options.map((option, optionIndex) => <div className="consultation-library__field-option" key={optionIndex}>
                        <input className="ui-dialog__input" dir="auto" maxLength={NOTE_OPTION_LENGTH} value={option}
                          aria-label={t('consultation.templates.builder.choiceOption', { n: optionIndex + 1 })}
                          onChange={event => updateSection({ ...section, options: section.options?.map((value, index) =>
                            index === optionIndex ? event.target.value : value) })}
                          onBlur={event => {
                            const value = event.target.value.trim();
                            if (value !== option) updateSection({ ...section, options: section.options?.map((name, index) => index === optionIndex ? value : name) });
                          }} />
                        <button type="button" className="consultation-library__row-action consultation-library__remove"
                          aria-label={t('consultation.templates.builder.removeChoice', { n: optionIndex + 1 })}
                          disabled={section.options?.length === 1}
                          onClick={() => updateSection({ ...section, options: section.options?.filter((_, index) => index !== optionIndex) })}>
                          <span aria-hidden="true">×</span>
                        </button>
                      </div>)}
                      <button type="button" className="ui-btn ui-btn--secondary" disabled={section.options.length >= NOTE_OPTION_LIMIT}
                        onClick={() => updateSection({ ...section, options: [...(section.options ?? []), ''] })}>
                        {t('consultation.templates.builder.addChoice')}
                      </button>
                      <p className="visit-documentation__helper">{t('consultation.templates.builder.choiceHelp')}</p>
                    </fieldset>}
                  </>}
                  {textSettings.map(property => <label key={property} className="ui-dialog__label">
                    {t(`consultation.templates.builder.${property}`)}
                    <textarea className="ui-dialog__input" dir="auto" rows={2} maxLength={1000} value={section[property] ?? ''}
                      placeholder={property === 'guidance' && key ? t(`${key}.helper`) : property === 'example' ? example : undefined}
                      onChange={event => updateSection({ ...section, [property]: event.target.value || undefined })} />
                  </label>)}
                  {!imageSection && <><label className="ui-dialog__label">{t('consultation.templates.builder.format')}
                    <select className="ui-dialog__input" value={section.format ?? FORMATS[0]}
                      onChange={event => updateSection({ ...section, format: event.target.value as ConsultationSection['format'] })}>
                      {FORMATS.map(format => <option key={format} value={format}>{t(`consultation.templates.builder.${format}`)}</option>)}
                    </select>
                  </label>
                  <label className="choice-row consultation-library__checkbox">
                    <input type="checkbox" checked={section.level === 2}
                      onChange={event => updateSection({ ...section, level: event.target.checked ? 2 : undefined })} />
                    <span>{t('consultation.templates.builder.subsection')}</span>
                  </label></>}
                  {isDischarge && isCustomDischargeField(section.id) && <label className="choice-row consultation-library__checkbox">
                    <input type="checkbox" checked={section.ownerReport === true}
                      onChange={event => updateSection({ ...section, ownerReport: event.target.checked ? true : undefined })} />
                    <span>{t('discharge.templates.ownerReport')}</span>
                  </label>}
                </div>}
              </li>;
            })}
          </ol>
          <div role="status" className="visually-hidden">{announcement}</div>
          <div role="status" className="consultation-library__undo">
            {removed && removed.id === custom?.id && <span>{t('consultation.templates.builder.fieldRemoved', { field: sectionName(removed.section) })}</span>}
            {editSelected && removed && removed.id === custom?.id && !sections.some(section => section.id === removed.section.id)
              && (removed.section.id === NOTE_IMAGES_ID || textSectionCount < CONSULTATION_SECTION_LIMIT) && <button type="button" className="consultation-library__row-action"
                onClick={undoRemove}>{t('consultation.templates.builder.undoRemove')}</button>}
          </div>
          {editSelected && (textSectionCount < CONSULTATION_SECTION_LIMIT || !sections.some(item => item.id === NOTE_IMAGES_ID)) && <>
            <button type="button" className="ui-btn ui-btn--secondary" aria-expanded={adding}
              onClick={() => adding ? closePicker() : setAdding(true)}>{t('consultation.templates.builder.addSection')}</button>
            {adding && <div className="consultation-library__picker">
              {managing ? <>
                <h4>{t('consultation.templates.builder.manageFields')}</h4>
                {!practiceFields.some(field => !field.archived) && <p>{t('consultation.templates.builder.noPracticeFields')}</p>}
                <ul className="consultation-library__field-list">
                  {practiceFields.filter(field => !field.archived).map(field => <li key={field.id}>
                    <span dir="auto">{field.label}</span>
                    <button type="button" className="consultation-library__row-action"
                      disabled={!canCreateField && !draft.practiceFields?.some(item => item.id === field.id)}
                      onClick={() => void deletePracticeField(field)}>
                      {t('common:actions.delete')}
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
                  const matching = (section: NoteTemplateSection) => sectionName(section).toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
                  const gallery = { id: NOTE_IMAGES_ID } as const;
                  const builtIn = [...new Map([gallery, ...standardNoteFields(kind).map(id => ({ id })), ...(isDischarge ? consultationSections(DENTAL_RECOVERY) : consultationSections(starter))]
                    .map(section => [section.id, section])).values()].filter(matching);
                  const shared = practiceFields.filter(field => !field.archived && matching(field));
                  const group = (heading: string, entries: readonly NoteTemplateSection[]) => entries.length > 0 && <div>
                    <h4>{heading}</h4>
                    <ul className="consultation-library__field-list">{entries.map(section => {
                      const added = sections.some(item => item.id === section.id);
                      return <li key={section.id}>
                        <button type="button" className="consultation-library__row-action" dir="auto" disabled={added || (section.id !== NOTE_IMAGES_ID && textSectionCount >= CONSULTATION_SECTION_LIMIT)}
                          onClick={() => {
                            const { id, label, guidance, example, suggestedText, inputType, options } = section;
                            addSection({ id, label, guidance, example, suggestedText, inputType, options });
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
                  <button type="button" className="ui-btn ui-btn--secondary" disabled={!canCreateField || textSectionCount >= CONSULTATION_SECTION_LIMIT}
                    onClick={() => { setFieldName(search); setCreating(true); }}>{t('consultation.templates.builder.createField')}</button>
                  <button type="button" className="ui-btn ui-btn--secondary"
                    onClick={() => setManaging(true)}>{t('consultation.templates.builder.manageFields')}</button>
                </div>
              </>}
            </div>}
          </>}
        </section>
      </div>}
    </div>
    {error && <p role="alert" className="ui-dialog__error">{error}</p>}
    {!valid && !consultationLibraryFits(versionedDraft) && <p role="alert" className="ui-dialog__error">
      {t('consultation.templates.builder.libraryTooLarge')}
    </p>}
    {!native && <footer className="ui-dialog__actions consultation-library__footer">
      <button type="button" className="ui-btn ui-btn--secondary" disabled={saving} onClick={() => void close()}>{t('common:actions.close')}</button>
      {canEdit && <button type="button" className="ui-btn ui-btn--primary" disabled={!editable || !changed || !valid}
        onClick={() => void save()}>{t('common:actions.save')}</button>}
    </footer>}
  </>;

  if (native) return <Sheet open title={title} confirmDismiss={canClose} onClose={onClose}
    cancelLabel={t('common:actions.close')}
    onDone={canEdit ? () => void save() : undefined} doneLabel={canEdit ? t('common:actions.save') : undefined}
    doneDisabled={!editable || !changed || !valid}>
    <div className="consultation-library">{body}</div>
  </Sheet>;
  return createPortal(<div className="ui-dialog-overlay consultation-library-overlay" {...backdrop}>
    <div className="ui-dialog consultation-library" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} ref={focus} tabIndex={-1}
      onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); void close(); } }}>
      <h2 className="ui-dialog__title" id={`${id}-title`}>{title}</h2>
      {body}
    </div>
  </div>, document.body);
}
