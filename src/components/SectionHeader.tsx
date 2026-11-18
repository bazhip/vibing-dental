import React from 'react';
import { useTranslation } from 'react-i18next';

/** Customization belongs to the section; clinical actions have their own row. */
export function SectionHeader({ title, onCustomize, customizeTitle, actions, children }: {
  title: string;
  onCustomize?: () => void;
  customizeTitle?: string;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const { t } = useTranslation('forms');
  return (
    <div className="patient-form__header section-header">
      <h2 className="patient-form__section-title">{title}</h2>
      {onCustomize && (
        <button type="button" className="diagram-view__action section-header__customize" onClick={onCustomize} title={customizeTitle} data-lock-exempt>
          {t('patient.customize')}
        </button>
      )}
      {children && <div className="section-header__description">{children}</div>}
      {actions && <div className="section-header__actions">{actions}</div>}
    </div>
  );
}
