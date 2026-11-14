import React from 'react';
import { useTranslation } from 'react-i18next';
import { DENTAL_CODES, codeDefinition } from '../constants/dentalCodes';
import { MAX_QUICK_CODES, MAX_QUICK_CODE_LENGTH, canonicalQuickCode } from '../utils/quickCodes';

/**
 * Chart settings → Quick codes: the codes offered as one-tap buttons in
 * By-tooth charting (added to the tooth's diagnosis note) and on the
 * Diagnosis diagram (stamped on the tapped tooth). Any AVDC code, or a
 * practice's own. Each add / remove saves right away.
 */
export const QuickCodesEditor: React.FC<{
  codes: string[];
  onChange: (next: string[]) => void;
}> = ({ codes, onChange }) => {
  const { t } = useTranslation('settings');
  const [draft, setDraft] = React.useState('');
  const listId = React.useId();

  const add = () => {
    const code = canonicalQuickCode(draft);
    if (!code) return;
    if (!codes.includes(code)) onChange([...codes, code]);
    setDraft('');
  };

  return (
    <fieldset className="chart-settings__field quick-codes-editor">
      <legend>{t('chart.quickCodes.title')}</legend>
      <p className="chart-settings__note">{t('chart.quickCodes.note')}</p>
      {codes.map((code) => {
        const definition = codeDefinition(code);
        return (
          <div key={code} className="quick-codes-editor__row">
            <span className="quick-codes-editor__code">{code}</span>
            <span className="quick-codes-editor__def">{definition !== code ? definition : ''}</span>
            <button
              type="button"
              className="diagram-view__action custom-def__remove"
              aria-label={t('chart.quickCodes.removeAria', { code })}
              onClick={() => onChange(codes.filter((c) => c !== code))}
            >
              {t('chart.quickCodes.remove')}
            </button>
          </div>
        );
      })}
      {codes.length < MAX_QUICK_CODES && (
        <div className="quick-codes-editor__add">
          <input
            type="text"
            list={listId}
            className="patient-form__input"
            placeholder={t('chart.quickCodes.placeholder')}
            aria-label={t('chart.quickCodes.addAria')}
            autoCapitalize="characters"
            autoComplete="off"
            maxLength={MAX_QUICK_CODE_LENGTH}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              add();
            }}
          />
          <button type="button" className="anesthesia-drug__add" onClick={add} disabled={!draft.trim()}>
            <span aria-hidden="true">+</span> {t('chart.quickCodes.add')}
          </button>
          <datalist id={listId}>
            {DENTAL_CODES.map((c) => (
              <option key={c.code} value={c.code} label={codeDefinition(c.code)} />
            ))}
          </datalist>
        </div>
      )}
    </fieldset>
  );
};
