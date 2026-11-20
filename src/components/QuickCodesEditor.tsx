import React from 'react';
import { useTranslation } from 'react-i18next';
import { ALL_CODES, codeDefinition } from '../constants/dentalCodes';
import { MAX_QUICK_CODES, MAX_QUICK_CODE_LENGTH, canonicalQuickCode } from '../utils/quickCodes';
import { useReorderList } from '../hooks/useReorderList';
import { ReorderHandle } from './ui/ReorderHandle';

/**
 * Chart settings → Quick codes: the codes offered as one-tap buttons in
 * By-tooth charting (added to the tooth's diagnosis note) and on the
 * Diagnosis diagram (stamped on the tapped tooth). Any AVDC code, or a
 * practice's own. Each add / remove saves right away.
 */
export const QuickCodesEditor: React.FC<{
  codes: string[];
  onChange: (next: string[]) => void;
  title?: string;
  description?: string;
  placeholder?: string;
}> = ({ codes, onChange, title, description, placeholder }) => {
  const { t } = useTranslation(['settings', 'visitDocumentation']);
  const [draft, setDraft] = React.useState('');
  const listId = React.useId();
  const codeToAdd = canonicalQuickCode(draft);
  const duplicate = codes.includes(codeToAdd);
  const reorder = useReorderList('.quick-codes-editor__list', 'data-quick-code-row', codes.length, (from, to) => {
    const next = [...codes];
    const [code] = next.splice(from, 1);
    next.splice(to, 0, code);
    onChange(next);
  });

  const add = () => {
    const code = canonicalQuickCode(draft);
    if (!code || codes.includes(code) || codes.length >= MAX_QUICK_CODES) return;
    onChange([...codes, code]);
    setDraft('');
  };

  return (
    <fieldset className="chart-settings__field quick-codes-editor">
      <legend>{title ?? t('chart.quickCodes.title')}</legend>
      <p className="chart-settings__note">{description ?? t('chart.quickCodes.note')}</p>
      <p className="chart-settings__note">{t('chart.list.count', { used: codes.length, max: MAX_QUICK_CODES })}</p>
      <div className="quick-codes-editor__list">{codes.map((code, index) => {
        const definition = codeDefinition(code);
        return (
          <div key={code} className="quick-codes-editor__row" data-quick-code-row={index} data-reorder-drop={reorder.dropAt(index)}>
            <ReorderHandle index={index} reorder={reorder} disabled={codes.length < 2}
              label={t('visitDocumentation:consultation.templates.builder.dragField', { field: code })} />
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
      })}</div>
      {codes.length < MAX_QUICK_CODES && (
        <div className="quick-codes-editor__add">
          <input
            type="text"
            list={listId}
            className="patient-form__input"
            placeholder={placeholder ?? t('chart.quickCodes.placeholder')}
            aria-label={t('chart.quickCodes.addAria')}
            autoCapitalize="characters"
            autoComplete="off"
            maxLength={MAX_QUICK_CODE_LENGTH}
            value={draft}
            aria-describedby={duplicate ? `${listId}-duplicate` : undefined}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              add();
            }}
          />
          <button type="button" className="anesthesia-drug__add" onClick={add} disabled={!codeToAdd || duplicate}>
            <span aria-hidden="true">+</span> {t('chart.quickCodes.add')}
          </button>
          <datalist id={listId}>
            {ALL_CODES.map((c) => (
              <option key={c.code} value={c.code} label={codeDefinition(c.code)} />
            ))}
          </datalist>
        </div>
      )}
      {duplicate && <p id={`${listId}-duplicate`} className="chart-settings__note" role="status">{t('chart.quickCodes.duplicate')}</p>}
      {codes.length >= MAX_QUICK_CODES && <p className="chart-settings__note">{t('chart.list.limit')}</p>}
    </fieldset>
  );
};
