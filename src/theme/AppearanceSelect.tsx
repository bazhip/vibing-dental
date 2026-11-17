import { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { getAppearance, setAppearance, subscribeAppearance, type Appearance } from './appearance';
import './appearance.css';

const OPTIONS = ['system', 'light', 'dark'] as const;

/** Device preference, available both before and after signing in. */
export function AppearanceSelect({ compact = false, disclosure = false }: { compact?: boolean; disclosure?: boolean }) {
  const { t } = useTranslation('common');
  const value = useSyncExternalStore(subscribeAppearance, getAppearance);
  const select = (
    <label className={`appearance-select${compact ? ' appearance-select--compact' : ''}`}>
      {!compact && !disclosure && <span>{t('appearance.label')}</span>}
      <select aria-label={t('appearance.label')} value={value} onChange={(event) => setAppearance(event.target.value as Appearance)}>
        {OPTIONS.map((option) => <option key={option} value={option}>{t(`appearance.${option}`)}</option>)}
      </select>
    </label>
  );
  if (!disclosure) return select;
  return (
    <details className="appearance-disclosure">
      <summary>
        <span>{t('appearance.label')}</span>
        <span className="appearance-disclosure__value">{t(`appearance.${value}`)}</span>
      </summary>
      {select}
    </details>
  );
}
