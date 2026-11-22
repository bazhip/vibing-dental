import { useId, useLayoutEffect, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { useReorderList } from '../hooks/useReorderList';
import {
  isChoiceInput, NOTE_INPUT_TYPES, NOTE_OPTION_LIMIT, NOTE_OPTION_LENGTH, type NoteInputType,
} from '../utils/consultationTemplates';
import {
  parsePracticeChartFieldConfig, PRACTICE_CHART_FIELD_LIMIT, PRACTICE_CHART_PAGE_FIELD_LIMIT,
  type PracticeChartFieldConfig, type PracticeChartPage, type SharedPracticeField,
} from '../utils/practiceChartFields';
import { ReorderHandle } from './ui/ReorderHandle';
import { confirmDialog, friendlyError } from './ui/dialogs';
import './PracticeFieldEditor.css';

export type PracticeFieldDismiss = () => boolean | Promise<boolean>;

export interface PracticeFieldLibrarySettings {
  scope?: string;
  config: PracticeChartFieldConfig;
  status: 'loading' | 'error' | 'ready';
  canEdit: boolean;
  onSave: (config: PracticeChartFieldConfig) => Promise<void>;
  onReload: () => void;
}

const builder = 'consultation.templates.builder' as const;
const rowAttribute = 'data-practice-field-row';

export function PracticeFieldEditor({ page, config, status, canEdit, onSave, onReload, dismissGuard }: PracticeFieldLibrarySettings & {
  page?: PracticeChartPage;
  dismissGuard?: RefObject<PracticeFieldDismiss | null>;
}) {
  const { t } = useTranslation(['visitDocumentation', 'forms', 'common', 'library']);
  const id = useId();
  const [draft, setDraft] = useState<PracticeChartFieldConfig>();
  const [picker, setPicker] = useState(false);
  const [search, setSearch] = useState('');
  const [fieldDrafts, setFieldDrafts] = useState<Partial<Record<PracticeChartPage, SharedPracticeField>>>();
  const fieldDraft = page ? fieldDrafts?.[page] : undefined;
  const setFieldDraft = (field: SharedPracticeField | undefined) => {
    if (page) setFieldDrafts(previous => ({ ...previous, [page]: field }));
  };
  const [managing, setManaging] = useState(false);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const current = draft ?? config;
  const fields = (page && current.pages[page]) || [];
  const canChange = canEdit && status === 'ready' && !saving;
  const atCapacity = fields.length >= PRACTICE_CHART_PAGE_FIELD_LIMIT;

  const setFields = (next: SharedPracticeField[]) => {
    if (!page) return;
    setDraft({ ...current, pages: { ...current.pages, [page]: next } });
    setMessage('');
  };

  const reorder = useReorderList('.practice-field-editor__list', rowAttribute, fields.length, (from, to) => {
    const next = [...fields];
    next.splice(to, 0, ...next.splice(from, 1));
    setFields(next);
  });

  useLayoutEffect(() => {
    if (!dismissGuard) return;
    dismissGuard.current = () => {
      if (saving) return false;
      if (!draft && !Object.values(fieldDrafts ?? {}).some(Boolean)) return true;
      return confirmDialog({
        title: t('practiceChartFields.discard'),
        confirmLabel: t('ios.sheets.discard.discard', { ns: 'common' }),
        danger: true,
      });
    };
    return () => { dismissGuard.current = null; };
  }, [dismissGuard, draft, fieldDrafts, saving, t]);

  useLayoutEffect(() => {
    setPicker(false);
    setSearch('');
    setManaging(false);
  }, [page]);

  if (!page) return null;
  const editedId = fieldDraft?.id;
  const editingExisting = fields.some(field => field.id === editedId);
  const available = current.fields.filter(field => !fields.some(item => item.id === field.id) &&
    field.label.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const normalizedField = fieldDraft && {
    ...fieldDraft,
    label: fieldDraft.label.trim(),
    ...(fieldDraft.options ? { options: fieldDraft.options.map(option => option.trim()) } : {}),
  };
  const fieldDraftConfig = normalizedField && {
    fields: editingExisting ? current.fields : [...current.fields, normalizedField],
    pages: {
      ...current.pages,
      [page]: editingExisting ? fields.map(field => field.id === editedId ? normalizedField : field) : [...fields, normalizedField],
    },
  };

  const removeFromLibrary = async (field: SharedPracticeField) => {
    if (!canChange || !await confirmDialog({
      title: t('library:templates.deleteTitle', { name: field.label }),
      message: t('practiceChartFields.deleteMessage'),
      confirmLabel: t('actions.delete', { ns: 'common' }),
      danger: true,
    })) return;
    setDraft({ ...current, fields: current.fields.filter(item => item.id !== field.id) });
    setMessage('');
  };

  const save = async () => {
    if (!draft || !canChange || fieldDraft) return;
    setSaving(true);
    setMessage('');
    try {
      await onSave(draft);
      setDraft(undefined);
      setMessage(t('practiceChartFields.saved'));
    } catch (error) {
      setMessage(friendlyError(error, t('practiceChartFields.saveFailed')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="practice-field-editor" aria-labelledby={id}>
      <div className="practice-field-editor__heading">
        <h3 id={id}>{t(`${builder}.practiceFields`)}</h3>
        {status === 'ready' && canEdit && <button type="button" className="consultation-library__row-action practice-field-editor__manage"
          disabled={!canChange || !!fieldDraft} title={t('practiceChartFields.manage')} aria-label={t('practiceChartFields.manage')}
          aria-expanded={picker && managing} onClick={() => {
            setPicker(!picker || !managing);
            setManaging(!picker || !managing);
          }}><span aria-hidden="true">⋯</span></button>}
      </div>
      <p className="visit-documentation__helper">{t('practiceChartFields.intro')}</p>
      {status === 'loading' && <p role="status">{t('consultation.templates.loading')}</p>}
      {status === 'error' && <div>
        <p>{t('practiceChartFields.loadFailed')}</p>
        <button type="button" className="ui-btn ui-btn--secondary" onClick={onReload}>{t('actions.tryAgain', { ns: 'common' })}</button>
      </div>}
      {status === 'ready' && <>
        {!canEdit && <p className="visit-documentation__helper">{t('forms:exam.layout.ownerOnly')}</p>}
        {fields.length > 0 && <ul className="practice-field-editor__list">
          {fields.map((field, index) => <li key={field.id} data-practice-field-row={index} data-drop-target={reorder.dropAt(index)}>
            {canEdit && <ReorderHandle index={index} label={t(`${builder}.dragField`, { field: field.label })}
              reorder={reorder} disabled={!canChange || fields.length === 1 || !!fieldDraft} />}
            {canEdit
              ? <button type="button" className="consultation-library__row-action practice-field-editor__name"
                disabled={!canChange || !!fieldDraft} onClick={() => { setPicker(false); setFieldDraft(field); }}>{field.label}</button>
              : <span dir="auto">{field.label}</span>}
            {canEdit && <button type="button" className="consultation-library__row-action consultation-library__remove"
              aria-label={t(`${builder}.removeNamed`, { field: field.label })} disabled={!canChange || !!fieldDraft}
              onClick={() => setFields(fields.filter(item => item.id !== field.id))}><span aria-hidden="true">×</span></button>}
          </li>)}
        </ul>}
        {canEdit && <div className="practice-field-editor__actions">
          <button type="button" className="ui-btn ui-btn--secondary" aria-expanded={picker && !managing}
            disabled={!canChange || atCapacity || !!fieldDraft}
            onClick={() => { setPicker(!picker || managing); setSearch(''); setManaging(false); }}>{t('forms:exam.layout.add')}</button>
          {!fieldDraft && <button type="button" className="ui-btn ui-btn--primary"
            disabled={!canChange || !draft} onClick={() => void save()}>{t('practiceChartFields.save')}</button>}
        </div>}
        {picker && canChange && !fieldDraft && <div className="consultation-library__picker">
          {managing ? <>
            <h4>{t('practiceChartFields.manage')}</h4>
            {current.fields.length ? <ul className="consultation-library__field-list">
              {current.fields.map(field => <li key={field.id}><span dir="auto">{field.label}</span>
                <button type="button" className="consultation-library__row-action"
                  onClick={() => void removeFromLibrary(field)}>{t('actions.delete', { ns: 'common' })}</button>
              </li>)}
            </ul> : <p>{t(`${builder}.noPracticeFields`)}</p>}
            <button type="button" className="ui-btn ui-btn--secondary" onClick={() => { setManaging(false); setPicker(false); }}>{t('actions.close', { ns: 'common' })}</button>
          </> : <>
          <label className="ui-dialog__label">{t('practiceChartFields.search')}
            <input type="search" className="ui-dialog__input" autoFocus value={search} onChange={event => setSearch(event.target.value)} />
          </label>
          {available.length ? <ul className="consultation-library__field-list">{available.map(field => <li key={field.id}>
            <button type="button" className="consultation-library__row-action" dir="auto" onClick={() => {
              setFields([...fields, field]);
              setPicker(false);
            }}>{field.label}</button>
          </li>)}</ul> : <p className="visit-documentation__helper">{t(`${builder}.noFields`)}</p>}
          <button type="button" className="ui-btn ui-btn--secondary" disabled={current.fields.length >= PRACTICE_CHART_FIELD_LIMIT}
            onClick={() => setFieldDraft({ id: crypto.randomUUID(), label: search.trim() })}>{t(`${builder}.createField`)}</button>
          </>}
        </div>}
        {fieldDraft && canChange && <div className="consultation-library__picker">
          <label className="ui-dialog__label">{t(`${builder}.fieldName`)}
            <input className="ui-dialog__input" dir="auto" autoFocus maxLength={100} value={fieldDraft.label}
              onChange={event => setFieldDraft({ ...fieldDraft, label: event.target.value })} />
          </label>
          <label className="ui-dialog__label">{t('forms:customEditor.fieldType')}
            <select className="ui-dialog__input" value={fieldDraft.inputType ?? ''}
              onChange={event => {
                const inputType = (event.target.value || undefined) as NoteInputType | undefined;
                setFieldDraft({ ...fieldDraft, inputType, options: isChoiceInput(inputType) ? fieldDraft.options ?? [''] : undefined });
              }}>
              <option value="">{t(`${builder}.inputTypes.paragraph`)}</option>
              {NOTE_INPUT_TYPES.map(type => <option key={type} value={type}>{t(`${builder}.inputTypes.${type}`)}</option>)}
            </select>
          </label>
          <label className="ui-dialog__label">{t(`${builder}.guidance`)}
            <textarea className="ui-dialog__input" dir="auto" rows={2} maxLength={1000} value={fieldDraft.guidance ?? ''}
              onChange={event => setFieldDraft({ ...fieldDraft, guidance: event.target.value || undefined })} />
          </label>
          {fieldDraft.options && <fieldset className="consultation-library__input-options">
            <legend>{t(`${builder}.choiceOptions`)}</legend>
            {fieldDraft.options.map((option, index, options) => <div className="consultation-library__field-option" key={index}>
              <input className="ui-dialog__input" dir="auto" maxLength={NOTE_OPTION_LENGTH} value={option}
                aria-label={t(`${builder}.choiceOption`, { n: index + 1 })}
                onChange={event => setFieldDraft({ ...fieldDraft, options: options.map((name, i) => i === index ? event.target.value : name) })} />
              <button type="button" className="consultation-library__row-action consultation-library__remove" disabled={options.length === 1}
                aria-label={t(`${builder}.removeChoice`, { n: index + 1 })}
                onClick={() => setFieldDraft({ ...fieldDraft, options: options.filter((_, i) => i !== index) })}><span aria-hidden="true">×</span></button>
            </div>)}
            <button type="button" className="ui-btn ui-btn--secondary" disabled={fieldDraft.options.length >= NOTE_OPTION_LIMIT}
              onClick={() => setFieldDraft({ ...fieldDraft, options: [...(fieldDraft.options ?? []), ''] })}>{t(`${builder}.addChoice`)}</button>
            <p className="visit-documentation__helper">{t(`${builder}.choiceHelp`)}</p>
          </fieldset>}
          <div className="practice-field-editor__actions">
            <button type="button" className="ui-btn ui-btn--secondary" onClick={() => setFieldDraft(undefined)}>{t('actions.cancel', { ns: 'common' })}</button>
            <button type="button" className="ui-btn ui-btn--primary"
              disabled={!fieldDraftConfig || !parsePracticeChartFieldConfig(fieldDraftConfig)}
              onClick={() => {
                setDraft(fieldDraftConfig);
                setMessage('');
                setFieldDraft(undefined);
                setPicker(false);
              }}>{t(editingExisting ? 'practiceChartFields.apply' : 'practiceChartFields.addToPage')}</button>
          </div>
        </div>}
      </>}
      {message && <p role="status" className="visit-documentation__helper">{message}</p>}
    </section>
  );
}
