import React from 'react';
import { useTranslation } from 'react-i18next';
import type { CustomFieldType } from '../types';
import {
  CustomBlockDef,
  CustomFieldDef,
  MAX_CUSTOM_BLOCKS,
  MAX_CUSTOM_FIELDS,
  MAX_SELECT_OPTIONS,
  newCustomId,
} from '../utils/customAnesthesia';

/**
 * Chart settings → Anesthesia: define your own nerve blocks and fields.
 * Edits stay local while typing and save when a field loses focus (or on
 * add / remove / type change) — not on every keystroke. Removing one
 * never touches charts: charted values carry their own label.
 */

const FIELD_TYPES: CustomFieldType[] = ['text', 'number', 'checkbox', 'select'];

export const AnesthesiaCustomEditor: React.FC<{
  blocks: CustomBlockDef[];
  fields: CustomFieldDef[];
  onBlocksChange: (next: CustomBlockDef[]) => void;
  onFieldsChange: (next: CustomFieldDef[]) => void;
}> = ({ blocks, fields, onBlocksChange, onFieldsChange }) => {
  const { t } = useTranslation('forms');
  const [b, setB] = React.useState(blocks);
  const [f, setF] = React.useState(fields);
  // Options typed as comma-separated text, per field id.
  const [optText, setOptText] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((x) => [x.id, (x.options ?? []).join(', ')])),
  );

  const saveBlocks = (next = b) => {
    const clean = next.filter((x) => x.label.trim());
    if (JSON.stringify(clean) !== JSON.stringify(blocks)) onBlocksChange(clean);
  };
  const saveFields = (next = f) => {
    const clean = next.filter((x) => x.label.trim());
    if (JSON.stringify(clean) !== JSON.stringify(fields)) onFieldsChange(clean);
  };
  const parseOptions = (text: string) =>
    text.split(',').map((o) => o.trim().slice(0, 30)).filter(Boolean).slice(0, MAX_SELECT_OPTIONS);

  return (
    <>
      <fieldset className="chart-settings__field">
        <legend>{t('customEditor.blocksLegend')}</legend>
        <p className="chart-settings__note">{t('customEditor.blocksNote')}</p>
        {b.map((x, i) => (
          <div key={x.id} className="custom-def">
            <input
              type="text"
              className="patient-form__input custom-def__label"
              placeholder={t('customEditor.blockName')}
              aria-label={t('customEditor.blockNameAria', { n: i + 1 })}
              value={x.label}
              maxLength={40}
              onChange={(e) => setB(b.map((y) => (y.id === x.id ? { ...y, label: e.target.value } : y)))}
              onBlur={() => saveBlocks()}
            />
            <button
              type="button"
              className="diagram-view__action custom-def__remove"
              aria-label={t('customEditor.removeAria', { name: x.label || t('customEditor.fallbackBlock') })}
              onClick={() => { const next = b.filter((y) => y.id !== x.id); setB(next); saveBlocks(next); }}
            >
              {t('customEditor.remove')}
            </button>
          </div>
        ))}
        {b.length < MAX_CUSTOM_BLOCKS && (
          <button type="button" className="anesthesia-drug__add" onClick={() => setB([...b, { id: newCustomId(), label: '' }])}>
            <span aria-hidden="true">+</span> {t('customEditor.addBlock')}
          </button>
        )}
      </fieldset>

      <fieldset className="chart-settings__field">
        <legend>{t('customEditor.fieldsLegend')}</legend>
        <p className="chart-settings__note">{t('customEditor.fieldsNote')}</p>
        {f.map((x, i) => (
          <div key={x.id} className="custom-def custom-def--field">
            <input
              type="text"
              className="patient-form__input custom-def__label"
              placeholder={t('customEditor.fieldName')}
              aria-label={t('customEditor.fieldNameAria', { n: i + 1 })}
              value={x.label}
              maxLength={40}
              onChange={(e) => setF(f.map((y) => (y.id === x.id ? { ...y, label: e.target.value } : y)))}
              onBlur={() => saveFields()}
            />
            <select
              className="patient-form__input custom-def__type"
              aria-label={t('customEditor.fieldTypeAria', { n: i + 1 })}
              value={x.type}
              onChange={(e) => {
                const type = e.target.value as CustomFieldType;
                const next = f.map((y) => (y.id === x.id ? { id: y.id, label: y.label, type, ...(type === 'select' ? { options: parseOptions(optText[y.id] ?? '') } : {}) } : y));
                setF(next);
                saveFields(next);
              }}
            >
              {FIELD_TYPES.map((ft) => <option key={ft} value={ft}>{t(`customEditor.types.${ft}`)}</option>)}
            </select>
            {x.type === 'number' && (
              <input
                type="text"
                className="patient-form__input custom-def__unit"
                placeholder={t('customEditor.unit')}
                aria-label={t('customEditor.unitAria', { n: i + 1 })}
                value={x.unit ?? ''}
                maxLength={12}
                onChange={(e) => setF(f.map((y) => (y.id === x.id ? { ...y, unit: e.target.value } : y)))}
                onBlur={() => saveFields()}
              />
            )}
            {x.type === 'select' && (
              <input
                type="text"
                className="patient-form__input custom-def__options"
                placeholder={t('customEditor.options')}
                aria-label={t('customEditor.optionsAria', { n: i + 1 })}
                value={optText[x.id] ?? ''}
                onChange={(e) => {
                  setOptText({ ...optText, [x.id]: e.target.value });
                  setF(f.map((y) => (y.id === x.id ? { ...y, options: parseOptions(e.target.value) } : y)));
                }}
                onBlur={() => saveFields()}
              />
            )}
            <button
              type="button"
              className="diagram-view__action custom-def__remove"
              aria-label={t('customEditor.removeAria', { name: x.label || t('customEditor.fallbackField') })}
              onClick={() => { const next = f.filter((y) => y.id !== x.id); setF(next); saveFields(next); }}
            >
              {t('customEditor.remove')}
            </button>
          </div>
        ))}
        {f.length < MAX_CUSTOM_FIELDS && (
          <button type="button" className="anesthesia-drug__add" onClick={() => setF([...f, { id: newCustomId(), label: '', type: 'text' }])}>
            <span aria-hidden="true">+</span> {t('customEditor.addField')}
          </button>
        )}
        <p className="chart-settings__note">{t('customEditor.removeNote')}</p>
      </fieldset>
    </>
  );
};
