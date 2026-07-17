import React from 'react';
import { NerveBlocks, Logo, DEFAULT_NERVE_BLOCK_DRUG } from '../types';

interface AnesthesiaFormProps {
  nerveBlocks: NerveBlocks;
  onNerveBlockChange: (key: keyof NerveBlocks, value: string) => void;
  /** Used to populate the drug-name placeholder with the template default. */
  logo: Logo;
}

const COMMON_DRUGS = ['Bupivacaine', 'Ropivacaine', 'Lidocaine', 'Mepivacaine'];

interface BlockRow {
  label: string;
  rightKey: keyof NerveBlocks;
  leftKey: keyof NerveBlocks;
}

// "Other" is rendered as a single full-width free-text field below the
// L/R rows — defined separately so the table layout doesn't have to
// special-case it inside the BLOCK_ROWS map.
const BLOCK_ROWS: BlockRow[] = [
  { label: 'Infraorbital',      rightKey: 'infraorbitalRight',     leftKey: 'infraorbitalLeft' },
  { label: 'Inferior Alveolar', rightKey: 'inferiorAlveolarRight', leftKey: 'inferiorAlveolarLeft' },
  { label: 'Mental',            rightKey: 'mentalRight',           leftKey: 'mentalLeft' },
];

export const AnesthesiaForm: React.FC<AnesthesiaFormProps> = ({
  nerveBlocks,
  onNerveBlockChange,
  logo,
}) => {
  const handleChange = (key: keyof NerveBlocks) => (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    onNerveBlockChange(key, event.target.value);
  };

  // Auto-grow the free-text "Other" field to fit its content (typed or
  // AI-filled) so nothing is hidden. Re-runs whenever the value changes.
  const otherRef = React.useRef<HTMLTextAreaElement>(null);
  React.useEffect(() => {
    const el = otherRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [nerveBlocks.other]);

  const defaultDrug = DEFAULT_NERVE_BLOCK_DRUG[logo];
  const drugList = COMMON_DRUGS.includes(defaultDrug)
    ? COMMON_DRUGS
    : [defaultDrug, ...COMMON_DRUGS];

  return (
    <div className="dental-grid-section">
      <div className="dental-grid__section-header">
        <span className="dental-grid__title">Anesthesia &mdash; Nerve Blocks</span>
      </div>

      <div className="anesthesia-drug">
        <label className="anesthesia-drug__label" htmlFor="anesthesia-drug-input">
          Anesthetic
        </label>
        <input
          id="anesthesia-drug-input"
          type="text"
          list="anesthesia-drug-options"
          className="patient-form__input anesthesia-drug__input"
          value={nerveBlocks.drug}
          placeholder={defaultDrug}
          onChange={handleChange('drug')}
          aria-describedby="anesthesia-drug-hint"
        />
        <datalist id="anesthesia-drug-options">
          {drugList.map((d) => (
            <option key={d} value={d} />
          ))}
        </datalist>
        {/* The grey placeholder alone reads ambiguously — is the drug set
            or not? Say what blank means. */}
        <span id="anesthesia-drug-hint" className="anesthesia-drug__hint">
          Leave blank to chart {defaultDrug} (the template default).
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
          {BLOCK_ROWS.map(({ label, rightKey, leftKey }) => (
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
          <tr>
            <td className="anesthesia-table__label">Other</td>
            <td colSpan={2}>
              <textarea
                ref={otherRef}
                className="patient-form__input anesthesia-table__other"
                rows={3}
                value={nerveBlocks.other}
                onChange={handleChange('other')}
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};
