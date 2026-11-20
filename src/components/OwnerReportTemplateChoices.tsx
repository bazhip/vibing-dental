import { useId, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { resolveTemplate, type OwnerReportConfig } from '../utils/ownerReportConfig';
import './OwnerReportTemplateChoices.css';

interface Props {
  config?: OwnerReportConfig | null;
  templateId?: string;
  /** Visits can follow the practice default or pin a template to this report. */
  followPracticeDefault?: boolean;
  onSelect?: (id: string | null) => void;
  disabled?: boolean;
  actions?: ReactNode;
}

export function OwnerReportTemplateChoices({ config, templateId, followPracticeDefault, onSelect, disabled, actions }: Props) {
  const { t } = useTranslation('reportui');
  const labelId = useId();
  const templates = config?.templates ?? [];
  const practiceTemplate = resolveTemplate(config);
  const activeId = templates.some(template => template.id === templateId)
    ? templateId ?? '' : followPracticeDefault ? '' : practiceTemplate.id;
  const choices = templates.map(template => {
    const name = template.name || t('templates.untitled');
    return {
      id: template.id,
      label: template.language === 'en' ? name : t('section.templateOption', { name, language: t(`languages.${template.language}`) }),
      note: !followPracticeDefault && template.id === practiceTemplate.id ? t('templates.badgeDefault') : undefined,
    };
  });
  if (followPracticeDefault) {
    choices.unshift({ id: '', label: t('section.practiceDefault', { name: practiceTemplate.name || t('templates.untitled') }), note: undefined });
  }
  const active = choices.find(choice => choice.id === activeId);
  const canChoose = onSelect && templates.length > 1;
  const select = (id: string) => {
    if (id !== activeId) onSelect?.(id || null);
  };

  return (
    <div className="owner-template-choices" role="group" aria-labelledby={labelId}>
      <span id={labelId} className="owner-template-choices__label">{t('section.templateLabel')}</span>
      <div className="owner-template-choices__row">
        {!canChoose ? (
          <span className="owner-template-choices__current">{active?.label}{active?.note && <span className="owner-template-choices__note">{active.note}</span>}</span>
        ) : choices.length > 4 ? (
          <select className="patient-form__input owner-template-choices__select" aria-labelledby={labelId} value={activeId}
            disabled={disabled} onChange={event => select(event.target.value)}>
            {choices.map(({ id, label, note }) => <option key={id} value={id}>{note ? `${label} · ${note}` : label}</option>)}
          </select>
        ) : choices.map(({ id, label, note }) => (
          <button key={id} type="button" className="owner-template-choices__choice" aria-pressed={id === activeId}
            disabled={disabled} onClick={() => select(id)}>
            <span>{label}</span>{note && <span className="owner-template-choices__note">{note}</span>}
            {id === activeId && <span aria-hidden="true">✓</span>}
          </button>
        ))}
        {actions}
      </div>
    </div>
  );
}
