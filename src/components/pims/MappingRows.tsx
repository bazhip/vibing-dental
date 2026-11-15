import React from 'react';
import { useTranslation } from 'react-i18next';
import { DONT_SEND, MISSING, selectValue, type MappingRow, type RowKey } from '../../utils/pims/rowChoice';

interface MappingRowsProps {
  rows: MappingRow[];
  disabled: boolean;
  onChoose: (key: RowKey, value: string) => void;
}

/** "Where it goes": one select per part of the note, choosing the ezyVet field it is written to. */
export const MappingRows: React.FC<MappingRowsProps> = ({ rows, disabled, onChoose }) => {
  const { t } = useTranslation(['pims']);
  const idBase = React.useId();
  return (
    <div className="pims-dialog__rows">
      {rows.map((r) => {
        const value = selectValue(r.wanted, r.options);
        return (
          <div key={r.key} className="pims-dialog__row">
            <label htmlFor={`${idBase}-${r.key}`}>{r.label}</label>
            <select
              id={`${idBase}-${r.key}`}
              className="patient-form__input"
              value={value}
              disabled={disabled}
              onChange={(e) => onChoose(r.key, e.target.value)}
            >
              <option value={DONT_SEND}>{t('pims:rows.dontSend')}</option>
              {value === MISSING && <option value={MISSING}>{t('pims:rows.notOnPage', { title: r.wanted })}</option>}
              {r.options.map((f) => <option key={f.title} value={f.title}>{f.title}</option>)}
            </select>
          </div>
        );
      })}
    </div>
  );
};
