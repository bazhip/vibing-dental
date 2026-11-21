import React from 'react';
import { useTranslation } from 'react-i18next';
import { CustomizeButton } from './CustomizeButton';

/** Customization belongs to the section; clinical actions have their own row. */
export function SectionHeader({ title, onCustomize, customizeTitle, titleAction, actions, children }: {
  title: string;
  onCustomize?: () => void;
  customizeTitle?: string;
  titleAction?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const { t } = useTranslation('forms');
  const customize = onCustomize && (
    <CustomizeButton className="section-header__customize" label={t('patient.customize')}
      onClick={onCustomize} title={customizeTitle} opensDialog />
  );
  return (
    <div className="patient-form__header section-header">
      <h2 className="patient-form__section-title">{title}</h2>
      {!titleAction && customize}
      {children && <div className="section-header__description">{children}</div>}
      {titleAction && <div className="section-header__title-action">{titleAction}{customize}</div>}
      {actions && <div className="section-header__actions">{actions}</div>}
    </div>
  );
}
