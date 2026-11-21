import { useId, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { documentationUrl } from '../help/openDocumentation';
import { useReorderList } from '../hooks/useReorderList';
import { MAX_EXAM_LABEL } from '../utils/customExam';
import {
  DEFAULT_EXAM_LAYOUT, EXAM_DIAGNOSTICS_ID, EXAM_LAYOUT_LIMIT, isBuiltInExamArea,
  newExamLayoutFieldId, parseExamLayout, type ExamLayoutField,
} from '../utils/examLayout';
import { confirmDialog, friendlyError } from './ui/dialogs';
import './VisitDocumentationSection.css';

const FIELD_KINDS = ['area', 'text'] as const;

export interface ExamLayoutSettings {
  scope?: string;
  fields: ExamLayoutField[];
  status: 'loading' | 'ready' | 'error';
  mode: 'personal' | 'practice';
  canEdit: boolean;
  onSave: (fields: ExamLayoutField[]) => Promise<void>;
  onReload: () => void;
}

export type ExamLayoutDismiss = () => boolean | Promise<boolean>;

export function ExamLayoutEditor({ fields, status, mode, canEdit, onSave, onReload, dismissGuard, saveTarget }: ExamLayoutSettings & {
  dismissGuard?: RefObject<ExamLayoutDismiss | null>;
  saveTarget?: HTMLElement | null;
}) {
  const { t, i18n } = useTranslation(['forms', 'visitDocumentation', 'common', 'settings']);
  const id = useId();
  const [edits, setEdits] = useState<ExamLayoutField[]>();
  const [expanded, setExpanded] = useState<string>();
  const [adding, setAdding] = useState(false);
  const [removed, setRemoved] = useState<{ field: ExamLayoutField; index: number }>();
  const [announcement, setAnnouncement] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const closingRef = useRef(false);
  const [error, setError] = useState('');
  const draft = edits ?? fields;
  const parsed = parseExamLayout(draft);
  const changed = !!edits && JSON.stringify(parsed) !== JSON.stringify(fields);
  const editable = status === 'ready' && canEdit && !saving;
  const atLimit = draft.length >= EXAM_LAYOUT_LIMIT;

  const defaultLabel = (field: ExamLayoutField) => isBuiltInExamArea(field.id)
    ? t(`exam.items.${field.id}`)
    : field.id === EXAM_DIAGNOSTICS_ID ? t('visitDocumentation:fields.gpDiagnostics.label') : '';
  const fieldName = (field: ExamLayoutField) => field.label?.trim() ||
    defaultLabel(field) || t(field.kind === 'area' ? 'exam.layout.area' : 'exam.layout.text');
  const titles = draft.map(field => (field.label?.trim() || defaultLabel(field)).toLocaleLowerCase());
  const hasDuplicate = titles.some((name, index) => !!name && titles.indexOf(name) !== index);

  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= draft.length) return;
    const next = [...draft];
    const [field] = next.splice(from, 1);
    next.splice(to, 0, field);
    setEdits(next);
    setAnnouncement(t('visitDocumentation:consultation.templates.builder.sectionMoved', {
      field: fieldName(field), position: to + 1,
    }));
  };
  const reorder = useReorderList('.consultation-library__sections', 'data-exam-row', draft.length, move);
  const add = (field: ExamLayoutField, edit: boolean) => {
    setEdits([...draft, field]);
    setAdding(false);
    setExpanded(edit ? field.id : undefined);
    if (removed?.field.id === field.id) setRemoved(undefined);
  };
  const remove = (field: ExamLayoutField, index: number) => {
    setEdits(draft.filter(item => item.id !== field.id));
    setExpanded(undefined);
    setRemoved({ field, index });
  };
  const undo = () => {
    if (!removed) return;
    const next = [...draft];
    next.splice(removed.index, 0, removed.field);
    setEdits(next);
    setRemoved(undefined);
  };
  const save = async () => {
    if (!editable || !parsed || hasDuplicate || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError('');
    try {
      await onSave(parsed);
      setEdits(undefined);
      setRemoved(undefined);
    } catch (cause) {
      setError(friendlyError(cause, t('exam.layout.saveFailed')));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  useLayoutEffect(() => {
    if (!dismissGuard) return;
    dismissGuard.current = async () => {
      if (savingRef.current || closingRef.current) return false;
      if (!changed) return true;
      closingRef.current = true;
      try {
        return await confirmDialog({ title: t('exam.layout.discard'), confirmLabel: t('common:actions.dismiss') });
      } finally {
        closingRef.current = false;
      }
    };
    return () => { dismissGuard.current = null; };
  }, [changed, dismissGuard, t]);

  const missingDefaults = DEFAULT_EXAM_LAYOUT.filter(field => !draft.some(item => item.id === field.id));

  const saveButton = canEdit && (
    <button type="button" className="ui-btn ui-btn--primary" disabled={!editable || !changed || !parsed || hasDuplicate}
      onClick={() => void save()}>{t('common:actions.save')}</button>
  );
  return <section className="exam-layout__editor" aria-label={t('exam.layout.title')}>
    <div className="consultation-library__body exam-layout__body">
      <div className="consultation-library__intro">
        <div className="consultation-library__intro-copy">
          <p>{t(mode === 'practice' ? 'exam.layout.practiceIntro' : 'exam.layout.personalIntro')}</p>
          <a className="context-help-link" href={documentationUrl(i18n.resolvedLanguage ?? i18n.language, 'exam') + '/first'}
            target="_blank" rel="noopener noreferrer">{t('exam.layout.help')}</a>
        </div>
      </div>
      {status === 'loading' && <p role="status">{t('exam.layout.loading')}</p>}
      {status === 'error' && <div className="consultation-library__notice">
        <p role="alert">{t('exam.layout.loadFailed')}</p>
        <button type="button" className="ui-btn ui-btn--secondary" onClick={onReload}>{t('settings:practice.team.retry')}</button>
      </div>}
      {status === 'ready' && <>
        {!canEdit && mode === 'practice' && <p>{t('exam.layout.ownerOnly')}</p>}
        {draft.length === 0 && <p role="status">{t('exam.layout.empty')}</p>}
        <ol className="consultation-library__sections">
          {draft.map((field, index) => {
            const name = fieldName(field);
            const area = field.kind === 'area';
            const open = editable && expanded === field.id;
            return <li key={field.id} data-exam-row={index} data-drop-target={reorder.target?.to === index || undefined}>
              <div className="consultation-library__section-row">
                {editable && <button type="button" className="consultation-library__row-action consultation-library__drag"
                  aria-label={t('visitDocumentation:consultation.templates.builder.dragField', { field: name })}
                  aria-keyshortcuts="ArrowUp ArrowDown"
                  onPointerDown={event => reorder.start(event, index)} onPointerMove={reorder.track}
                  onPointerUp={event => reorder.finish(event, true)} onPointerCancel={event => reorder.finish(event, false)}
                  onLostPointerCapture={event => reorder.finish(event, false)}
                  onKeyDown={event => {
                    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
                    event.preventDefault();
                    move(index, index + (event.key === 'ArrowUp' ? -1 : 1));
                  }}><span aria-hidden="true">⠿</span></button>}
                <div className="consultation-library__row-label exam-layout__row-label">
                  {editable ? <button type="button" className="consultation-library__section-name"
                    aria-expanded={open} aria-controls={open ? `${id}-${field.id}` : undefined} dir="auto"
                    onClick={() => setExpanded(open ? undefined : field.id)}>{name}</button> : <span dir="auto">{name}</span>}
                  <span className="exam-layout__field-kind">{t(area ? 'exam.layout.areaType' : 'exam.layout.text')}</span>
                </div>
                {editable && <button type="button" className="consultation-library__row-action consultation-library__remove"
                  aria-label={t('visitDocumentation:consultation.templates.builder.removeNamed', { field: name })}
                  onClick={() => remove(field, index)}><span aria-hidden="true">×</span></button>}
              </div>
              {open && <div className="consultation-library__settings" id={`${id}-${field.id}`}>
                <label className="ui-dialog__label">
                  {t('visitDocumentation:consultation.templates.builder.fieldName')}
                  <input className="ui-dialog__input" dir="auto" autoFocus maxLength={MAX_EXAM_LABEL}
                    placeholder={defaultLabel(field) || undefined} value={field.label ?? ''}
                    onChange={event => setEdits(draft.map(item => item.id === field.id ? { ...item, label: event.target.value } : item))} />
                </label>
              </div>}
            </li>;
          })}
        </ol>
        <div role="status" className="visually-hidden">{announcement}</div>
        {removed && <div role="status" className="consultation-library__undo">
          <span>{t('visitDocumentation:consultation.templates.builder.fieldRemoved', { field: fieldName(removed.field) })}</span>
          <button type="button" className="consultation-library__row-action" disabled={!editable || atLimit}
            onClick={undo}>{t('visitDocumentation:consultation.templates.builder.undoRemove')}</button>
        </div>}
        {editable && (atLimit ? <p>{t('settings:chart.list.limit')}</p> : <>
          <button type="button" className="ui-btn ui-btn--secondary exam-layout__add"
            aria-expanded={adding} aria-controls={adding ? `${id}-picker` : undefined}
            onClick={() => setAdding(!adding)}><span aria-hidden="true">+</span> {t('exam.layout.add')}</button>
          {adding && <div className="consultation-library__picker" id={`${id}-picker`}>
            <div className="exam-layout__choices">
              {FIELD_KINDS.map(kind => <button type="button" className="ui-btn ui-btn--secondary"
                key={kind} onClick={() => add({ id: newExamLayoutFieldId(kind), kind }, true)}>
                {t(kind === 'area' ? 'exam.layout.area' : 'exam.layout.text')}
              </button>)}
            </div>
            {missingDefaults.length > 0 && <>
              <h3 className="exam-layout__defaults">{t('visitDocumentation:consultation.templates.builder.builtInFields')}</h3>
              <ul className="consultation-library__field-list">
                {missingDefaults.map(field => <li key={field.id}>
                  <button type="button" className="consultation-library__row-action"
                    onClick={() => add(field, false)}>{fieldName(field)}</button>
                </li>)}
              </ul>
            </>}
          </div>}
        </>)}
      </>}
    </div>
    {(error || hasDuplicate) && <p role="alert" className="ui-dialog__error">{error || t('exam.layout.duplicate')}</p>}
    {saveButton && (saveTarget
      ? createPortal(saveButton, saveTarget)
      : <div className="exam-layout__actions">{saveButton}</div>)}
  </section>;
}
