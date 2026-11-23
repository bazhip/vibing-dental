import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useReorderList } from '../hooks/useReorderList';
import { IMAGING_REPORT_KINDS, isChoiceInput, NOTE_INPUT_TYPES, type NoteInputType } from '../utils/consultationTemplates';
import { defaultPatientLayout, parsePatientLayout, PATIENT_BUILTIN_FIELDS, patientDefaultGroup, REQUIRED_PATIENT_FIELDS, type PatientBuiltinField, type PatientLayout } from '../utils/patientLayout';
import { parsePracticeChartField } from '../utils/practiceChartFields';
import { PATIENT_FIELD_OPTIONS, type ChartPrefs } from '../utils/chartSettings';
import { ReorderHandle } from './ui/ReorderHandle';
import './VisitDocumentationSection.css';

export function ChartLayoutRows<Field extends string>({ fields, available, label, onChange, edit, canRemove, onCreate, rowKind = 'field' }: {
  fields: readonly Field[];
  available: readonly Field[];
  label: (field: Field) => string;
  onChange?: (fields: Field[]) => void;
  edit?: (field: Field) => ReactNode;
  canRemove?: (field: Field) => boolean;
  onCreate?: () => void;
  rowKind?: 'field' | 'section';
}) {
  const { t } = useTranslation(['visitDocumentation', 'forms']);
  const id = useId();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [expanded, setExpanded] = useState<Field>();
  const rowAttribute = rowKind === 'section' ? 'data-layout-section' : 'data-layout-row';
  const reorder = useReorderList(`.chart-layout-rows--${rowKind}`, rowAttribute, fields.length, (from, to) => {
    const next = [...fields];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange?.(next);
  });
  const hidden = available.filter(field => !fields.includes(field));

  return <>
    <ol className={`consultation-library__sections chart-layout-rows chart-layout-rows--${rowKind}`}>
      {fields.map((field, index) => {
        const name = label(field);
        const open = expanded === field;
        return <li key={field} data-layout-row={rowKind === 'field' ? index : undefined} data-layout-section={rowKind === 'section' ? index : undefined} data-drop-target={reorder.dropAt(index)}>
          <div className="consultation-library__section-row">
            {onChange && fields.length > 1 && <ReorderHandle index={index} reorder={reorder}
              label={t('consultation.templates.builder.dragField', { field: name })} />}
            <div className="consultation-library__row-label">
              {edit ? <button type="button" className="consultation-library__section-name" dir="auto"
                aria-expanded={open} aria-controls={open ? `${id}-${field}` : undefined}
                onClick={() => setExpanded(open ? undefined : field)}>{name}</button> : <span dir="auto">{name}</span>}
            </div>
            {onChange && (!canRemove || canRemove(field)) && <button type="button" className="consultation-library__row-action consultation-library__remove"
              aria-label={t('consultation.templates.builder.removeNamed', { field: name })}
              onClick={() => { if (open) setExpanded(undefined); onChange(fields.filter(item => item !== field)); }}><span aria-hidden="true">×</span></button>}
          </div>
          {open && edit && <div id={`${id}-${field}`} className="consultation-library__settings">{edit(field)}</div>}
        </li>;
      })}
    </ol>
    {onChange && (hidden.length > 0 || onCreate) && <>
      <button type="button" className="ui-btn ui-btn--secondary exam-layout__add" aria-expanded={pickerOpen}
        aria-controls={pickerOpen ? `${id}-picker` : undefined} onClick={() => setPickerOpen(!pickerOpen)}>
        <span aria-hidden="true">+</span> {t('forms:exam.layout.add')}
      </button>
      {pickerOpen && <div className="consultation-library__picker" id={`${id}-picker`}>
        {hidden.length > 0 && <ul aria-label={t('consultation.templates.builder.builtInFields')} className="consultation-library__field-list">
          {hidden.map(field => <li key={field}><button type="button" className="consultation-library__row-action"
            onClick={() => { onChange([...fields, field]); setPickerOpen(false); }}>{label(field)}</button></li>)}
        </ul>}
        {onCreate && <button type="button" className="ui-btn ui-btn--secondary"
          onClick={() => { setPickerOpen(false); onCreate(); }}>{t('consultation.templates.builder.createField')}</button>}
      </div>}
    </>}
  </>;
}

const SECTION_ROW = 'section';
const PATIENT_LABEL_KEYS = {
  patientName: 'name', patientNumber: 'number', species: 'species', dentition: 'dentition', date: 'date',
  ownerName: 'ownerName', ownerPhone: 'ownerPhone', ownerEmail: 'ownerEmail', tech: 'tech', recallDate: 'recheck', complaint: 'complaint',
} as const satisfies Record<PatientBuiltinField, string>;

export function PatientLayoutRows({ prefs, onChange }: { prefs: ChartPrefs; onChange: (patch: Partial<ChartPrefs>) => void }) {
  const { t } = useTranslation(['forms', 'visitDocumentation', 'common']);
  const [sectionName, setSectionName] = useState<string>();
  const [draftField, setDraftField] = useState<{ section: string; id: string; label: string; type: NoteInputType | ''; options: string }>();
  const [error, setError] = useState(false);
  const layout = prefs.patientLayout ?? defaultPatientLayout(prefs.patientFieldOrder,
    [...prefs.hiddenPatientFields, ...(prefs.hideRecheck ? ['recallDate'] : [])]);
  const { sections, customFields } = layout;
  const placed = new Set(sections.flatMap(section => section.fields));
  const available = [...PATIENT_BUILTIN_FIELDS, ...customFields.map(field => field.id)];
  const builtIn = (id: string) => PATIENT_BUILTIN_FIELDS.find(field => field === id);
  const label = (id: string) => {
    const field = builtIn(id);
    return field ? t(`patient.${PATIENT_LABEL_KEYS[field]}`) : customFields.find(item => item.id === id)?.label ?? '';
  };
  const sectionLabel = (id: string) => {
    const group = patientDefaultGroup(id);
    return sections.find(section => section.id === id)?.label ?? (group === 'identityGroup' ? t('patient.title') : group ? t(`patient.${group}`) : '');
  };
  const save = (next: PatientLayout) => {
    const parsed = parsePatientLayout(next);
    const nextFields = new Set(next.sections.flatMap(section => section.fields));
    const patch = {
      patientLayout: parsed,
      hiddenPatientFields: PATIENT_FIELD_OPTIONS.filter(field => !nextFields.has(field)),
      hideRecheck: !nextFields.has('recallDate'),
    };
    // Leave room for the remaining account preferences under the profiles limit.
    if (!parsed || new TextEncoder().encode(JSON.stringify({ ...prefs, ...patch })).byteLength > 7500) {
      setError(true);
      return false;
    }
    setError(false);
    onChange(patch);
    return true;
  };
  const builder = 'consultation.templates.builder';
  const fieldDef = draftField && parsePracticeChartField({
    id: draftField.id, label: draftField.label, inputType: draftField.type || undefined,
    options: isChoiceInput(draftField.type) ? draftField.options.split(/\r?\n/u).map(value => value.trim()).filter(Boolean) : undefined,
  });
  return <>
    <div className="patient-layout__toolbar">
    {sectionName === undefined ? <button type="button" className="ui-btn ui-btn--secondary exam-layout__add"
      onClick={() => setSectionName('')}>{t(`${builder}.addSection`, { ns: 'visitDocumentation' })}</button>
      : <div className="consultation-library__settings">
        <label className="ui-dialog__label">
          {t(`${builder}.sectionLabel`, { ns: 'visitDocumentation' })}
          <input className="ui-dialog__input" dir="auto" maxLength={100} autoFocus value={sectionName} onChange={event => setSectionName(event.target.value)} />
        </label>
        <div className="patient-layout__actions">
          <button type="button" className="ui-btn ui-btn--secondary" onClick={() => setSectionName(undefined)}>{t('common:actions.cancel')}</button>
          <button type="button" className="ui-btn ui-btn--primary" disabled={!sectionName.trim()} onClick={() => {
            if (save({ ...layout, sections: [...sections, { id: crypto.randomUUID(), label: sectionName.trim(), fields: [] }] })) setSectionName(undefined);
          }}>{t(`${builder}.addSection`, { ns: 'visitDocumentation' })}</button>
        </div>
      </div>}
    </div>
    <ChartLayoutRows rowKind={SECTION_ROW} fields={sections.map(section => section.id)} available={[]} label={sectionLabel}
      canRemove={id => sections.length > 1 && !sections.find(section => section.id === id)?.fields.some(field => REQUIRED_PATIENT_FIELDS.some(required => required === field))}
      onChange={ids => {
        const next = ids.flatMap(id => sections.filter(section => section.id === id));
        if (save({ ...layout, sections: next }) && draftField && !ids.includes(draftField.section)) setDraftField(undefined);
      }}
      edit={id => {
        const section = sections.find(item => item.id === id);
        if (!section) return null;
        const editing = draftField?.section === id ? draftField : undefined;
        return <>
          <label className="ui-dialog__label">
            {t(`${builder}.sectionLabel`, { ns: 'visitDocumentation' })}
            <input key={sectionLabel(id)} className="ui-dialog__input" dir="auto" maxLength={100} defaultValue={sectionLabel(id)}
              onBlur={event => {
                const name = event.currentTarget.value.trim();
                if (name && name !== sectionLabel(id)) save({ ...layout, sections: sections.map(item => item.id === id ? { ...item, label: name } : item) });
                else event.currentTarget.value = sectionLabel(id);
              }} />
          </label>
          <ChartLayoutRows fields={section.fields} available={available.filter(field => !placed.has(field))} label={label}
            onCreate={draftField ? undefined : () => setDraftField({ section: id, id: crypto.randomUUID(), label: '', type: 'shortText', options: '' })}
            canRemove={field => !REQUIRED_PATIENT_FIELDS.some(required => required === field)}
            onChange={fields => save({ ...layout, sections: sections.map(item => item.id === id ? { ...item, fields } : item) })}
            edit={field => {
              const custom = customFields.find(item => item.id === field);
              return <>
                <label className="ui-dialog__label">
                  {t('patient.layout.moveTo')}
                  <select className="ui-dialog__input" value={id} onChange={event => {
                    const destination = event.target.value;
                    save({ ...layout, sections: sections.map(item => {
                      if (item.id === id) return { ...item, fields: item.fields.filter(value => value !== field) };
                      if (item.id === destination) return { ...item, fields: [...item.fields, field] };
                      return item;
                    }) });
                  }}>
                    {sections.map(item => <option key={item.id} value={item.id}>{sectionLabel(item.id)}</option>)}
                  </select>
                </label>
                {custom && <button type="button" className="ui-btn ui-btn--secondary" onClick={() => setDraftField({
                  section: id, id: custom.id, label: custom.label, type: custom.inputType ?? '', options: custom.options?.join('\n') ?? '',
                })}>{t('patient.layout.editField')}</button>}
              </>;
            }} />
          {editing ? <div className="consultation-library__settings">
            <label className="ui-dialog__label">
              {t(`${builder}.fieldName`, { ns: 'visitDocumentation' })}
              <input className="ui-dialog__input" dir="auto" maxLength={100} autoFocus value={editing.label}
                onChange={event => setDraftField({ ...editing, label: event.target.value })} />
            </label>
            <label className="ui-dialog__label">
              {t('patient.layout.fieldType')}
              <select className="ui-dialog__input" value={editing.type}
                onChange={event => setDraftField({ ...editing, type: NOTE_INPUT_TYPES.find(type => type === event.target.value) ?? '' })}>
                <option value="">{t(`${builder}.inputTypes.paragraph`, { ns: 'visitDocumentation' })}</option>
                {NOTE_INPUT_TYPES.map(type => <option key={type} value={type}>{t(`${builder}.inputTypes.${type}`, { ns: 'visitDocumentation' })}</option>)}
              </select>
            </label>
            {isChoiceInput(editing.type) && <label className="ui-dialog__label">
              {t('patient.layout.options')}
              <textarea className="ui-dialog__input" dir="auto" rows={3} value={editing.options}
                onChange={event => setDraftField({ ...editing, options: event.target.value })} />
            </label>}
            <div className="patient-layout__actions">
              <button type="button" className="ui-btn ui-btn--secondary" onClick={() => setDraftField(undefined)}>{t('common:actions.cancel')}</button>
              <button type="button" className="ui-btn ui-btn--primary" disabled={!fieldDef} onClick={() => {
                if (!fieldDef) return;
                const exists = customFields.some(field => field.id === fieldDef.id);
                const next = exists ? customFields.map(field => field.id === fieldDef.id ? fieldDef : field) : [...customFields, fieldDef];
                if (save({ customFields: next, sections: exists ? sections : sections.map(item => item.id === id ? { ...item, fields: [...item.fields, fieldDef.id] } : item) })) setDraftField(undefined);
              }}>{t('common:actions.save')}</button>
            </div>
          </div> : null}
        </>;
      }} />
    {error && <p role="alert">{t('patient.layout.limit')}</p>}
  </>;
}

export function ImagingLayoutRows({ prefs, onChange }: { prefs: ChartPrefs; onChange: (patch: Partial<ChartPrefs>) => void }) {
  const { t } = useTranslation('app');
  return <ChartLayoutRows fields={prefs.imagingReportOrder} available={IMAGING_REPORT_KINDS}
    label={field => t(field === 'ct' ? 'ct.title' : 'radiographic.title')}
    onChange={imagingReportOrder => onChange({ imagingReportOrder })} />;
}
