import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { resolveTemplate, type OwnerReportConfig } from '../utils/ownerReportConfig';
import { TemplatePicker } from './TemplatePicker';

interface Props {
  config?: OwnerReportConfig | null;
  templateId?: string;
  /** Visits can follow the practice default or pin a template to this report. */
  followPracticeDefault?: boolean;
  onSelect?: (id: string | null) => void;
  disabled?: boolean;
  actions?: ReactNode;
  help?: { label: string; href: string };
  embedded?: boolean;
}

export function OwnerReportTemplateChoices({ config, templateId, followPracticeDefault, onSelect, disabled, actions, help, embedded }: Props) {
  const { t } = useTranslation('reportui');
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
  if (!followPracticeDefault && !choices.length) {
    choices.push({ id: practiceTemplate.id, label: practiceTemplate.name || t('templates.untitled'), note: undefined });
  }
  if (followPracticeDefault) {
    choices.unshift({ id: '', label: t('section.practiceDefault', { name: practiceTemplate.name || t('templates.untitled') }), note: undefined });
  }
  return <TemplatePicker label={t('section.templateLabel')} choices={choices} activeId={activeId}
    onSelect={onSelect && templates.length > 1 ? id => onSelect(id || null) : undefined}
    disabled={disabled} actions={actions} help={help} embedded={embedded} />;
}
