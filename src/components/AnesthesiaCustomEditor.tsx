import React from 'react';
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

const TYPE_LABELS: Record<CustomFieldType, string> = {
  text: 'Text',
  number: 'Number',
  checkbox: 'Yes / no',
  select: 'Pick-list',
};

export const AnesthesiaCustomEditor: React.FC<{
  blocks: CustomBlockDef[];
  fields: CustomFieldDef[];
  onBlocksChange: (next: CustomBlockDef[]) => void;
  onFieldsChange: (next: CustomFieldDef[]) => void;
}> = ({ blocks, fields, onBlocksChange, onFieldsChange }) => {
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
        <legend>Your nerve blocks</legend>
        <p className="chart-settings__note">Extra Right / Left rows (mL), e.g. Major palatine.</p>
        {b.map((x, i) => (
          <div key={x.id} className="custom-def">
            <input
              type="text"
              className="patient-form__input custom-def__label"
              placeholder="Block name"
              aria-label={`Nerve block ${i + 1} name`}
              value={x.label}
              maxLength={40}
              onChange={(e) => setB(b.map((y) => (y.id === x.id ? { ...y, label: e.target.value } : y)))}
              onBlur={() => saveBlocks()}
            />
            <button
              type="button"
              className="diagram-view__action custom-def__remove"
              aria-label={`Remove ${x.label || 'nerve block'}`}
              onClick={() => { const next = b.filter((y) => y.id !== x.id); setB(next); saveBlocks(next); }}
            >
              Remove
            </button>
          </div>
        ))}
        {b.length < MAX_CUSTOM_BLOCKS && (
          <button type="button" className="anesthesia-drug__add" onClick={() => setB([...b, { id: newCustomId(), label: '' }])}>
            <span aria-hidden="true">+</span> Add nerve block
          </button>
        )}
      </fieldset>

      <fieldset className="chart-settings__field">
        <legend>Your fields</legend>
        <p className="chart-settings__note">Shown under “Anesthesia record”, e.g. Premedication, ET tube, Fluids.</p>
        {f.map((x, i) => (
          <div key={x.id} className="custom-def custom-def--field">
            <input
              type="text"
              className="patient-form__input custom-def__label"
              placeholder="Field name"
              aria-label={`Field ${i + 1} name`}
              value={x.label}
              maxLength={40}
              onChange={(e) => setF(f.map((y) => (y.id === x.id ? { ...y, label: e.target.value } : y)))}
              onBlur={() => saveFields()}
            />
            <select
              className="patient-form__input custom-def__type"
              aria-label={`Field ${i + 1} type`}
              value={x.type}
              onChange={(e) => {
                const type = e.target.value as CustomFieldType;
                const next = f.map((y) => (y.id === x.id ? { id: y.id, label: y.label, type, ...(type === 'select' ? { options: parseOptions(optText[y.id] ?? '') } : {}) } : y));
                setF(next);
                saveFields(next);
              }}
            >
              {(Object.keys(TYPE_LABELS) as CustomFieldType[]).map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
            </select>
            {x.type === 'number' && (
              <input
                type="text"
                className="patient-form__input custom-def__unit"
                placeholder="Unit"
                aria-label={`Field ${i + 1} unit`}
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
                placeholder="Options, comma-separated"
                aria-label={`Field ${i + 1} options`}
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
              aria-label={`Remove ${x.label || 'field'}`}
              onClick={() => { const next = f.filter((y) => y.id !== x.id); setF(next); saveFields(next); }}
            >
              Remove
            </button>
          </div>
        ))}
        {f.length < MAX_CUSTOM_FIELDS && (
          <button type="button" className="anesthesia-drug__add" onClick={() => setF([...f, { id: newCustomId(), label: '', type: 'text' }])}>
            <span aria-hidden="true">+</span> Add field
          </button>
        )}
        <p className="chart-settings__note">Removing a block or field here never removes what’s already charted.</p>
      </fieldset>
    </>
  );
};
