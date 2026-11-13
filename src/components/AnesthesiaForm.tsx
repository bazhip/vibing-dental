import React from 'react';
import {
  NerveBlocks,
  NerveBlockSite,
  AnestheticDrug,
  Logo,
  DEFAULT_NERVE_BLOCK_DRUG,
  DEFAULT_NERVE_BLOCK_CONCENTRATION,
  usualConcentration,
  formatAnestheticDrug,
} from '../types';
import type { BlockRowId } from '../utils/chartSettings';
import type { CustomAnesthesia, CustomBlockValue, CustomFieldValue } from '../types';
import {
  CustomBlockDef,
  CustomFieldDef,
  blocksForForm,
  fieldsForForm,
  setBlockValue,
  setFieldValue,
} from '../utils/customAnesthesia';
import { isNativeApp } from '../native/platform';
import { hapticSelection } from '../native/haptics';
import { Icon } from '../ios/icons';

interface AnesthesiaFormProps {
  nerveBlocks: NerveBlocks;
  onNerveBlockChange: (key: NerveBlockSite, value: string) => void;
  /** Functional update of the anesthetic list. */
  onDrugsChange: (update: (prev: AnestheticDrug[]) => AnestheticDrug[]) => void;
  /** Used to populate the drug-name placeholder with the template default. */
  logo: Logo;
  /** Chart settings: rows to hide (still shown when they hold a dose). */
  hiddenBlocks?: BlockRowId[];
  /** Chart settings: the person's usual anesthetic, offered in one tap. */
  usualDrug?: { name: string; concentration: string } | null;
  /** Open Chart settings. */
  onCustomize?: () => void;
  /** The person's custom nerve blocks and fields (chart settings). */
  customBlockDefs?: CustomBlockDef[];
  customFieldDefs?: CustomFieldDef[];
  /** This chart's custom values, and how to change them. */
  customValues?: CustomAnesthesia;
  onCustomValuesChange?: (next: CustomAnesthesia) => void;
}

const COMMON_DRUGS = ['Bupivacaine', 'Ropivacaine', 'Lidocaine', 'Mepivacaine'];
const BLANK_DRUG: AnestheticDrug = { name: '', concentration: '' };

interface BlockRow {
  id: BlockRowId;
  label: string;
  rightKey: NerveBlockSite;
  leftKey: NerveBlockSite;
}

// "Other" is rendered as a single full-width free-text field below the
// L/R rows — defined separately so the table layout doesn't have to
// special-case it inside the BLOCK_ROWS map.
const BLOCK_ROWS: BlockRow[] = [
  { id: 'infraorbital',     label: 'Infraorbital',      rightKey: 'infraorbitalRight',     leftKey: 'infraorbitalLeft' },
  { id: 'caudalMaxillary',  label: 'Caudal Maxillary',  rightKey: 'caudalMaxillaryRight',  leftKey: 'caudalMaxillaryLeft' },
  { id: 'inferiorAlveolar', label: 'Inferior Alveolar', rightKey: 'inferiorAlveolarRight', leftKey: 'inferiorAlveolarLeft' },
  { id: 'mental',           label: 'Mental',            rightKey: 'mentalRight',           leftKey: 'mentalLeft' },
];

export const AnesthesiaForm: React.FC<AnesthesiaFormProps> = ({
  nerveBlocks,
  onNerveBlockChange,
  onDrugsChange,
  logo,
  hiddenBlocks = [],
  usualDrug = null,
  onCustomize,
  customBlockDefs = [],
  customFieldDefs = [],
  customValues,
  onCustomValuesChange,
}) => {
  // The iOS app: switches for yes/no fields, icons instead of text glyphs.
  const native = isNativeApp();
  const customBlocks = blocksForForm(customBlockDefs, customValues);
  const customFields = fieldsForForm(customFieldDefs, customValues);
  const setCustomBlock = (row: CustomBlockValue) => onCustomValuesChange?.(setBlockValue(customValues, row));
  const setCustomField = (f: CustomFieldValue) => onCustomValuesChange?.(setFieldValue(customValues, f));
  // A hidden row still shows when it holds a dose — settings never hide data.
  const rowShown = (r: BlockRow) =>
    !hiddenBlocks.includes(r.id) || !!(nerveBlocks[r.rightKey] || '').trim() || !!(nerveBlocks[r.leftKey] || '').trim();
  const otherShown = !hiddenBlocks.includes('other') || !!(nerveBlocks.other || '').trim();
  const handleChange = (key: NerveBlockSite) => (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    onNerveBlockChange(key, event.target.value);
  };

  // Auto-grow the free-text "Other" field to fit its content (typed or
  // AI-filled) so nothing is hidden. Re-runs whenever the value changes.
  const otherRef = React.useRef<HTMLTextAreaElement>(null);
  const fitOther = React.useCallback(() => {
    const el = otherRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, []);
  React.useEffect(fitOther, [nerveBlocks.other, fitOther]);
  // A width change (rotation) changes how many lines it needs.
  React.useEffect(() => {
    window.addEventListener('resize', fitOther);
    return () => window.removeEventListener('resize', fitOther);
  }, [fitOther]);

  const defaultDrug = DEFAULT_NERVE_BLOCK_DRUG[logo];
  const drugList = COMMON_DRUGS.includes(defaultDrug)
    ? COMMON_DRUGS
    : [defaultDrug, ...COMMON_DRUGS];

  // An empty list means "template default" — still show one blank row so
  // there's somewhere to type. Editing it materialises the list.
  const drugs = nerveBlocks.drugs ?? [];
  const usingDefault = drugs.length === 0;
  const rows = usingDefault ? [BLANK_DRUG] : drugs;

  const updateDrug = (index: number, patch: Partial<AnestheticDrug>) =>
    onDrugsChange((prev) => {
      const list = prev.length ? [...prev] : [{ ...BLANK_DRUG }];
      const cur = list[index] ?? BLANK_DRUG;
      const next = { ...cur, ...patch };
      // Picking a drug pre-fills its usual strength, unless the vet has
      // already typed a custom one.
      if (patch.name !== undefined && (!cur.concentration || cur.concentration === usualConcentration(cur.name))) {
        next.concentration = usualConcentration(patch.name);
      }
      list[index] = next;
      return list;
    });

  // Focus the new row's name field right after "+ Add anesthetic".
  const nameRefs = React.useRef<Array<HTMLInputElement | null>>([]);
  const focusIndexRef = React.useRef<number | null>(null);
  React.useEffect(() => {
    const i = focusIndexRef.current;
    if (i === null) return;
    focusIndexRef.current = null;
    nameRefs.current[i]?.focus();
  }, [rows.length]);

  const addDrug = () => {
    focusIndexRef.current = rows.length;
    onDrugsChange((prev) =>
      prev.length
        ? [...prev, { ...BLANK_DRUG }]
        // The blank first row stood for the default — make it explicit so
        // adding a second drug doesn't silently drop the first.
        : [{ name: defaultDrug, concentration: DEFAULT_NERVE_BLOCK_CONCENTRATION }, { ...BLANK_DRUG }]
    );
  };

  const removeDrug = (index: number) =>
    onDrugsChange((prev) => prev.filter((_, i) => i !== index));

  return (
    <div className="dental-grid-section">
      <div className="dental-grid__section-header">
        <h2 className="dental-grid__title">Anesthesia &mdash; Nerve Blocks</h2>
        {onCustomize && (
          <button type="button" className="diagram-view__action" onClick={onCustomize} title="Choose which nerve blocks show and your usual anesthetic">
            Customize
          </button>
        )}
      </div>

      <div className="anesthesia-drug">
        <span className="anesthesia-drug__label" id="anesthesia-drug-label">
          {rows.length > 1 ? 'Anesthetics' : 'Anesthetic'}
        </span>
        <div className="anesthesia-drug__stack">
          <ul className="anesthesia-drug__list" aria-labelledby="anesthesia-drug-label">
            {rows.map((d, i) => (
              <li key={i} className="anesthesia-drug__row">
                <input
                  ref={(el) => { nameRefs.current[i] = el; }}
                  type="text"
                  list="anesthesia-drug-options"
                  className="patient-form__input anesthesia-drug__input"
                  value={d.name}
                  placeholder={usingDefault ? defaultDrug : 'Drug'}
                  onChange={(e) => updateDrug(i, { name: e.target.value })}
                  aria-label={`Anesthetic ${i + 1} name`}
                  aria-describedby="anesthesia-drug-hint"
                />
                <span className="anesthesia-unit anesthesia-drug__strength">
                  <input
                    type="text"
                    inputMode="decimal"
                    className="patient-form__input"
                    value={d.concentration}
                    placeholder={usingDefault ? DEFAULT_NERVE_BLOCK_CONCENTRATION : ''}
                    onChange={(e) => updateDrug(i, { concentration: e.target.value.replace(/%/g, '') })}
                    aria-label={`Anesthetic ${i + 1} concentration (%)`}
                  />
                  <span className="anesthesia-unit__suffix" aria-hidden="true">%</span>
                </span>
                {rows.length > 1 && (
                  <button
                    type="button"
                    className="anesthesia-drug__remove"
                    onClick={() => removeDrug(i)}
                    aria-label={`Remove ${d.name.trim() || `anesthetic ${i + 1}`}`}
                    title="Remove"
                  >
                    {native ? <Icon name="xmark" size={14} /> : <>&times;</>}
                  </button>
                )}
              </li>
            ))}
          </ul>
          <datalist id="anesthesia-drug-options">
            {drugList.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
          <button type="button" className="anesthesia-drug__add" onClick={addDrug}>
            {native ? <Icon name="plus" size={16} /> : <span aria-hidden="true">+</span>} Add anesthetic
          </button>
          {usingDefault && usualDrug && (
            <button
              type="button"
              className="anesthesia-drug__add anesthesia-drug__usual"
              onClick={() => onDrugsChange(() => [{ name: usualDrug.name, concentration: usualDrug.concentration }])}
            >
              Use my usual: {formatAnestheticDrug(usualDrug)}
            </button>
          )}
        </div>
        {/* The grey placeholder alone reads ambiguously — is the drug set
            or not? Say what blank means. */}
        <span id="anesthesia-drug-hint" className="anesthesia-drug__hint">
          {rows.length > 1
            ? 'Mixed together — the doses below are mL of the combined mix.'
            : `Leave blank to chart ${DEFAULT_NERVE_BLOCK_CONCENTRATION}% ${defaultDrug} (the template default).`}
        </span>
      </div>

      <table className="anesthesia-table">
        <thead>
          <tr>
            <th></th>
            <th>Right</th>
            <th>Left</th>
          </tr>
        </thead>
        <tbody>
          {BLOCK_ROWS.filter(rowShown).map(({ label, rightKey, leftKey }) => (
            <tr key={label}>
              <td className="anesthesia-table__label">{label}</td>
              {([rightKey, leftKey] as const).map((key) => (
                <td key={key}>
                  <span className="anesthesia-unit">
                    <input
                      type="text"
                      inputMode="decimal"
                      className="patient-form__input"
                      value={nerveBlocks[key]}
                      onChange={handleChange(key)}
                      aria-label={`${label} ${key === rightKey ? 'right' : 'left'} (mL)`}
                    />
                    <span className="anesthesia-unit__suffix" aria-hidden="true">mL</span>
                  </span>
                </td>
              ))}
            </tr>
          ))}
          {customBlocks.map((b) => (
            <tr key={b.id} className="anesthesia-table__custom">
              <td className="anesthesia-table__label">{b.label}</td>
              {(['right', 'left'] as const).map((side) => (
                <td key={side}>
                  <span className="anesthesia-unit">
                    <input
                      type="text"
                      inputMode="decimal"
                      className="patient-form__input"
                      value={b[side]}
                      onChange={(e) => setCustomBlock({ ...b, [side]: e.target.value })}
                      aria-label={`${b.label} ${side} (mL)`}
                    />
                    <span className="anesthesia-unit__suffix" aria-hidden="true">mL</span>
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Free text gets the full card width (label above) — squeezed into
          the two dose columns it was a narrow strip on phones. */}
      {otherShown && (
        <label className="anesthesia-other">
          <span className="anesthesia-other__label">Other</span>
          <textarea
            ref={otherRef}
            className="patient-form__input anesthesia-table__other"
            aria-label="Other nerve blocks"
            rows={3}
            value={nerveBlocks.other}
            onChange={handleChange('other')}
          />
        </label>
      )}

      {customFields.length > 0 && (
        <div className="anesthesia-custom">
          <h3 className="ai-settings-subhead">Anesthesia record</h3>
          <div className="anesthesia-custom__grid">
            {customFields.map(({ value: f, def }) => {
              const update = (value: string) => setCustomField({ ...f, value });
              return (
                <label key={f.id} className={`patient-form__label anesthesia-custom__field anesthesia-custom__field--${f.type}`}>
                  {f.type === 'checkbox' && native ? (
                    <span className="anesthesia-custom__check anesthesia-custom__check--switch">
                      <span>{f.label}</span>
                      <input
                        type="checkbox"
                        role="switch"
                        className="ios-switch"
                        checked={f.value === 'yes'}
                        onChange={(e) => { hapticSelection(); update(e.target.checked ? 'yes' : ''); }}
                      />
                    </span>
                  ) : f.type === 'checkbox' ? (
                    <span className="anesthesia-custom__check">
                      <input type="checkbox" checked={f.value === 'yes'} onChange={(e) => update(e.target.checked ? 'yes' : '')} />
                      {f.label}
                    </span>
                  ) : (
                    <>
                      <span>{f.label}</span>
                      {f.type === 'select' && def?.options?.length ? (
                        <select className="patient-form__input" value={f.value} onChange={(e) => update(e.target.value)}>
                          <option value="">—</option>
                          {def.options.map((o) => <option key={o} value={o}>{o}</option>)}
                          {f.value && !def.options.includes(f.value) && <option value={f.value}>{f.value}</option>}
                        </select>
                      ) : f.type === 'number' ? (
                        <span className="anesthesia-unit">
                          <input
                            type="text"
                            inputMode="decimal"
                            className="patient-form__input"
                            value={f.value}
                            onChange={(e) => update(e.target.value)}
                          />
                          {f.unit && <span className="anesthesia-unit__suffix" aria-hidden="true">{f.unit}</span>}
                        </span>
                      ) : (
                        <input type="text" className="patient-form__input" value={f.value} onChange={(e) => update(e.target.value)} />
                      )}
                    </>
                  )}
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
