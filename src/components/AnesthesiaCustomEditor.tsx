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
 * remove / type change) — not on every keystroke. Removing one
 * never touches charts: charted values carry their own label.
 */

const FIELD_TYPES: CustomFieldType[] = ['text', 'number', 'checkbox', 'select'];

function DefinitionRow({ title, detail, expanded, onToggle, children }: {
  title: string;
  detail?: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const id = React.useId();
  return (
    <div className="anesthesia-definition">
      <button type="button" className="anesthesia-definition__summary" aria-expanded={expanded}
        aria-controls={id} aria-describedby={detail ? `${id}-type` : undefined}
        onClick={(event) => { event.currentTarget.focus(); onToggle(); }}>
        <bdi>{title}</bdi>
        {detail && <span id={`${id}-type`} aria-hidden="true">{detail}</span>}
      </button>
      <div id={id} hidden={!expanded} className="anesthesia-definition__panel">
        {children}
      </div>
    </div>
  );
}

export const AnesthesiaCustomEditor: React.FC<{
  blocks: CustomBlockDef[];
  fields: CustomFieldDef[];
  onBlocksChange: (next: CustomBlockDef[]) => void;
  onFieldsChange: (next: CustomFieldDef[]) => void;
}> = ({ blocks, fields, onBlocksChange, onFieldsChange }) => {
  const { t } = useTranslation('forms');
  const [b, setB] = React.useState(blocks);
  const [f, setF] = React.useState(fields);
  const [openBlock, setOpenBlock] = React.useState<string>();
  const [openField, setOpenField] = React.useState<string>();
  const [newRow, setNewRow] = React.useState<string>();
  const addBlockRef = React.useRef<HTMLButtonElement>(null);
  const addFieldRef = React.useRef<HTMLButtonElement>(null);
  const focusAfterRemove = React.useRef<React.RefObject<HTMLButtonElement | null> | null>(null);
  React.useLayoutEffect(() => {
    focusAfterRemove.current?.current?.focus();
    focusAfterRemove.current = null;
  }, [b, f]);
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
      <fieldset className="chart-settings__field chart-customization__module anesthesia-definitions">
        <legend>{t('customEditor.blocksLegend')}</legend>
        <p className="chart-settings__note">{t('customEditor.blocksNote')}</p>
        {b.map((x, i) => (
          <DefinitionRow key={x.id} title={x.label || t('customEditor.fallbackBlock')} expanded={openBlock === x.id}
            onToggle={() => setOpenBlock(openBlock === x.id ? undefined : x.id)}>
            <div className="custom-def">
              <label className="custom-def__control">
                <span>{t('customEditor.blockName')}</span>
                <input
                  type="text"
                  className="patient-form__input custom-def__label"
                  placeholder={t('customEditor.blockName')}
                  aria-label={t('customEditor.blockNameAria', { n: i + 1 })}
                  value={x.label}
                  maxLength={40}
                  autoFocus={newRow === x.id}
                  onChange={(e) => setB(b.map((y) => (y.id === x.id ? { ...y, label: e.target.value } : y)))}
                  onBlur={() => saveBlocks()}
                />
              </label>
              <button
                type="button"
                className="diagram-view__action custom-def__remove"
                aria-label={t('customEditor.removeAria', { name: x.label || t('customEditor.fallbackBlock') })}
                onClick={() => {
                  const next = b.filter((y) => y.id !== x.id);
                  focusAfterRemove.current = addBlockRef;
                  setOpenBlock(undefined);
                  setB(next);
                  saveBlocks(next);
                }}
              >
                {t('customEditor.remove')}
              </button>
            </div>
          </DefinitionRow>
        ))}
        {b.length < MAX_CUSTOM_BLOCKS && (
          <button type="button" ref={addBlockRef} className="anesthesia-drug__add" onClick={(event) => {
            event.currentTarget.focus();
            const id = newCustomId();
            setNewRow(id);
            setOpenBlock(id);
            setB([...b, { id, label: '' }]);
          }}>
            <span aria-hidden="true">+</span> {t('customEditor.addBlock')}
          </button>
        )}
      </fieldset>

      <fieldset className="chart-settings__field chart-customization__module anesthesia-definitions">
        <legend>{t('customEditor.fieldsLegend')}</legend>
        <p className="chart-settings__note">{t('customEditor.fieldsNote')}</p>
        {f.map((x, i) => (
          <DefinitionRow key={x.id} title={x.label || t('customEditor.fallbackField')} detail={t(`customEditor.types.${x.type}`)}
            expanded={openField === x.id} onToggle={() => setOpenField(openField === x.id ? undefined : x.id)}>
            <div className="custom-def custom-def--field">
              <label className="custom-def__control">
                <span>{t('customEditor.fieldName')}</span>
                <input
                  type="text"
                  className="patient-form__input custom-def__label"
                  placeholder={t('customEditor.fieldName')}
                  aria-label={t('customEditor.fieldNameAria', { n: i + 1 })}
                  value={x.label}
                  maxLength={40}
                  autoFocus={newRow === x.id}
                  onChange={(e) => setF(f.map((y) => (y.id === x.id ? { ...y, label: e.target.value } : y)))}
                  onBlur={() => saveFields()}
                />
              </label>
              <label className="custom-def__control">
                <span>{t('customEditor.fieldType')}</span>
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
              </label>
              {x.type === 'number' && (
                <label className="custom-def__control">
                  <span>{t('customEditor.unit')}</span>
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
                </label>
              )}
              {x.type === 'select' && (
                <label className="custom-def__control">
                  <span>{t('customEditor.options')}</span>
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
                </label>
              )}
              <button
                type="button"
                className="diagram-view__action custom-def__remove"
                aria-label={t('customEditor.removeAria', { name: x.label || t('customEditor.fallbackField') })}
                onClick={() => {
                  const next = f.filter((y) => y.id !== x.id);
                  focusAfterRemove.current = addFieldRef;
                  setOpenField(undefined);
                  setF(next);
                  saveFields(next);
                }}
              >
                {t('customEditor.remove')}
              </button>
            </div>
          </DefinitionRow>
        ))}
        {f.length < MAX_CUSTOM_FIELDS && (
          <button type="button" ref={addFieldRef} className="anesthesia-drug__add" onClick={(event) => {
            event.currentTarget.focus();
            const id = newCustomId();
            setNewRow(id);
            setOpenField(id);
            setF([...f, { id, label: '', type: 'text' }]);
          }}>
            <span aria-hidden="true">+</span> {t('customEditor.addField')}
          </button>
        )}
        <p className="chart-settings__note">{t('customEditor.removeNote')}</p>
      </fieldset>
    </>
  );
};
