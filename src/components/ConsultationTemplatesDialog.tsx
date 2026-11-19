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
  CONSULTATION_STARTERS, CONSULTATION_TEMPLATE_LIMIT, CONSULTATION_TEMPLATE_NAME_LIMIT,
  DENTAL_CONSULTATION, isConsultationStarter, parseConsultationLibrary,
  type ConsultationField, type ConsultationLayout, type ConsultationLibrary, type PracticeConsultationTemplate,
} from '../utils/consultationTemplates';

interface Props {
  initial: ConsultationLibrary;
  status: 'loading' | 'error' | 'ready';
  canEdit: boolean;
  onSave: (draft: ConsultationLibrary) => Promise<void>;
  onReload: () => void;
  onClose: () => void;
}

export function ConsultationTemplatesDialog({ initial, status, canEdit, onSave, onReload, onClose }: Props) {
  const { t, i18n } = useTranslation(['visitDocumentation', 'common', 'reportui']);
  const id = useId();
  const native = isNativeApp();
  const focus = useModalFocus(!native);
  const [edits, setDraft] = useState<ConsultationLibrary>();
  const draft = edits ?? initial;
  const [choice, setSelectedId] = useState<string>();
  const selectedId = choice ?? draft.defaultId;
  const [showArchived, setShowArchived] = useState(false);
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [error, setError] = useState('');
  const changed = draft !== initial && JSON.stringify(draft) !== JSON.stringify(initial);
  const templates = [...Object.values(CONSULTATION_STARTERS), ...draft.templates.filter(template => showArchived || !template.archived)];
  const custom = draft.templates.find(template => template.id === selectedId);
  const selected = custom ?? (isConsultationStarter(selectedId) ? CONSULTATION_STARTERS[selectedId] : DENTAL_CONSULTATION);
  const editable = status === 'ready' && canEdit && !saving;
  const editSelected = editable && !!custom && !custom.archived && !preview;
  const valid = !!parseConsultationLibrary(draft);
  const language = i18n.resolvedLanguage ?? i18n.language;
  const nameOf = (template: ConsultationLayout) => isConsultationStarter(template.id)
    ? t(`consultation.templates.starters.${template.id}`)
    : template.name || t('consultation.templates.untitled');
  const update = (template: PracticeConsultationTemplate) => setDraft({
    ...draft, templates: draft.templates.map(item => item.id === template.id ? template : item),
  });
  const choose = (templateId: string) => {
    setSelectedId(templateId);
    setPreview(false);
  };
  const duplicate = () => {
    const template = { id: crypto.randomUUID(), name: nameOf(selected), fields: [...selected.fields] };
    setDraft({ ...draft, templates: [...draft.templates, template] });
    choose(template.id);
  };
  const move = (field: ConsultationField, delta: number) => {
    if (!custom) return;
    const fields = [...custom.fields];
    const index = fields.indexOf(field);
    const destination = index + delta;
    if (destination < 0 || destination >= fields.length) return;
    fields.splice(index, 1);
    fields.splice(destination, 0, field);
    update({ ...custom, fields });
  };
  const toggleArchive = () => {
    if (!custom) return;
    const archiving = !custom.archived;
    setDraft({
      defaultId: archiving && draft.defaultId === custom.id ? DENTAL_CONSULTATION.id : draft.defaultId,
      templates: draft.templates.map(item => item.id === custom.id ? { ...item, archived: archiving } : item),
    });
    if (archiving && !showArchived) choose(DENTAL_CONSULTATION.id);
  };
  const setArchivedVisibility = () => {
    if (showArchived && custom?.archived) choose(DENTAL_CONSULTATION.id);
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

  const title = t('consultation.templates.title');
  const body = <>
    <div className="consultation-library__body">
      <div className="consultation-library__intro">
        <p>{t('consultation.templates.intro')}</p>
        <a className="visit-documentation__guide" href={documentationUrl(language, 'consultation-templates')}
          target="_blank" rel="noopener noreferrer">{t('consultation.templates.help')}</a>
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
              disabled={draft.templates.length >= CONSULTATION_TEMPLATE_LIMIT} onClick={duplicate}>{t('common:actions.duplicate')}</button>}
            {editable && <details>
              <summary>{t('consultation.templates.options')}</summary>
              <div className="consultation-library__menu">
                <button type="button" className="ui-btn ui-btn--secondary" disabled={selected.id === draft.defaultId || custom?.archived}
                  onClick={() => setDraft({ ...draft, defaultId: selected.id })}>{t('consultation.templates.setDefault')}</button>
                {custom && <button type="button" className="ui-btn ui-btn--secondary"
                  onClick={toggleArchive}>{t(custom.archived ? 'consultation.templates.restore' : 'consultation.templates.archive')}</button>}
              </div>
            </details>}
          </div>
          {preview && <p className="consultation-library__sample">{t('consultation.templates.sampleNotice')}</p>}
          <ol className="consultation-library__sections">
            {selected.fields.map((field, index) => {
              const label = t(`fields.${field}.label`);
              return <li key={field}>
                <div>
                  <span>{label}</span>
                  {preview && <p>{t(`consultation.templates.samples.${field}`)}</p>}
                </div>
                {editSelected && <div className="consultation-library__move">
                  <button type="button" className="ui-btn ui-btn--secondary" disabled={index === 0}
                    aria-label={t('consultation.templates.moveUp', { field: label })} onClick={() => move(field, -1)}><span aria-hidden="true">↑</span></button>
                  <button type="button" className="ui-btn ui-btn--secondary" disabled={index === selected.fields.length - 1}
                    aria-label={t('consultation.templates.moveDown', { field: label })} onClick={() => move(field, 1)}><span aria-hidden="true">↓</span></button>
                </div>}
              </li>;
            })}
          </ol>
        </section>
      </div>
    </div>
    {error && <p role="alert" className="ui-dialog__error">{error}</p>}
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
