import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useReorderList } from '../hooks/useReorderList';
import { IMAGING_REPORT_KINDS } from '../utils/consultationTemplates';
import type { ChartPrefs, OptionalPatientField, PatientLayoutField } from '../utils/chartSettings';
import { PATIENT_SETTINGS_GROUPS } from './useChartSettingsModel';
import { ReorderHandle } from './ui/ReorderHandle';
import './VisitDocumentationSection.css';

export function ChartLayoutRows<Field extends string>({ fields, available, label, onChange, edit }: {
  fields: readonly Field[];
  available: readonly Field[];
  label: (field: Field) => string;
  onChange?: (fields: Field[]) => void;
  edit?: (field: Field) => ReactNode;
}) {
  const { t } = useTranslation(['visitDocumentation', 'forms']);
  const id = useId();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [expanded, setExpanded] = useState<Field>();
  const reorder = useReorderList('.chart-layout-rows', 'data-layout-row', fields.length, (from, to) => {
    const next = [...fields];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange?.(next);
  });
  const hidden = available.filter(field => !fields.includes(field));

  return <>
    <ol className="consultation-library__sections chart-layout-rows">
      {fields.map((field, index) => {
        const name = label(field);
        const open = expanded === field;
        return <li key={field} data-layout-row={index} data-drop-target={reorder.dropAt(index)}>
          <div className="consultation-library__section-row">
            {onChange && fields.length > 1 && <ReorderHandle index={index} reorder={reorder}
              label={t('consultation.templates.builder.dragField', { field: name })} />}
            <div className="consultation-library__row-label">
              {edit ? <button type="button" className="consultation-library__section-name" dir="auto"
                aria-expanded={open} aria-controls={open ? `${id}-${field}` : undefined}
                onClick={() => setExpanded(open ? undefined : field)}>{name}</button> : <span dir="auto">{name}</span>}
            </div>
            {onChange && <button type="button" className="consultation-library__row-action consultation-library__remove"
              aria-label={t('consultation.templates.builder.removeNamed', { field: name })}
              onClick={() => { if (open) setExpanded(undefined); onChange(fields.filter(item => item !== field)); }}><span aria-hidden="true">×</span></button>}
          </div>
          {open && edit && <div id={`${id}-${field}`} className="consultation-library__settings">{edit(field)}</div>}
        </li>;
      })}
    </ol>
    {onChange && hidden.length > 0 && <>
      <button type="button" className="ui-btn ui-btn--secondary exam-layout__add" aria-expanded={pickerOpen}
        aria-controls={pickerOpen ? `${id}-picker` : undefined} onClick={() => setPickerOpen(!pickerOpen)}>
        <span aria-hidden="true">+</span> {t('forms:exam.layout.add')}
      </button>
      {pickerOpen && <div className="consultation-library__picker" id={`${id}-picker`}>
        <p>{t('consultation.templates.builder.builtInFields')}</p>
        <ul className="consultation-library__field-list">
          {hidden.map(field => <li key={field}><button type="button" className="consultation-library__row-action"
            onClick={() => { onChange([...fields, field]); setPickerOpen(false); }}>{label(field)}</button></li>)}
        </ul>
      </div>}
    </>}
  </>;
}

export function PatientLayoutRows({ prefs, onChange }: { prefs: ChartPrefs; onChange: (patch: Partial<ChartPrefs>) => void }) {
  const { t } = useTranslation('forms');
  const groupId = useId();
  return PATIENT_SETTINGS_GROUPS.map(({ id, fields }) => {
    const available: PatientLayoutField[] = id === 'visitGroup' ? [...fields, 'recallDate'] : [...fields];
    const visible = prefs.patientFieldOrder.filter(field => available.includes(field)
      && (field === 'recallDate' ? !prefs.hideRecheck : !prefs.hiddenPatientFields.includes(field)));
    return <section key={id} className="chart-customization__module" aria-labelledby={`${groupId}-${id}`}>
      <h3 id={`${groupId}-${id}`} className="ai-settings-subhead">{t(`patient.${id}`)}</h3>
      <ChartLayoutRows fields={visible} available={available} label={field => t(field === 'recallDate' ? 'patient.recheck' : `patient.${field}`)}
        onChange={next => {
          const missing = available.filter(field => !next.includes(field));
          onChange({
            patientFieldOrder: [...prefs.patientFieldOrder.filter(field => !available.includes(field)), ...next, ...missing],
            hiddenPatientFields: [...prefs.hiddenPatientFields.filter(field => !available.includes(field)),
              ...missing.filter((field): field is OptionalPatientField => field !== 'recallDate')],
            ...(id === 'visitGroup' ? { hideRecheck: !next.includes('recallDate') } : {}),
          });
        }} />
    </section>;
  });
}

export function ImagingLayoutRows({ prefs, onChange }: { prefs: ChartPrefs; onChange: (patch: Partial<ChartPrefs>) => void }) {
  const { t } = useTranslation('app');
  return <ChartLayoutRows fields={prefs.imagingReportOrder} available={IMAGING_REPORT_KINDS}
    label={field => t(field === 'ct' ? 'ct.title' : 'radiographic.title')}
    onChange={imagingReportOrder => onChange({ imagingReportOrder })} />;
}
