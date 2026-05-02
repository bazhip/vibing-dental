import React from 'react';
import { NerveBlocks } from '../types';

interface AnesthesiaFormProps {
  nerveBlocks: NerveBlocks;
  onNerveBlockChange: (key: keyof NerveBlocks, value: string) => void;
}

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
}) => {
  const handleChange = (key: keyof NerveBlocks) => (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    onNerveBlockChange(key, event.target.value);
  };

  return (
    <div className="dental-grid-section">
      <div className="dental-grid__section-header">
        <span className="dental-grid__title">Anesthesia &mdash; Nerve Blocks (mL)</span>
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
              <td>
                <input
                  type="text"
                  className="patient-form__input"
                  value={nerveBlocks[rightKey]}
                  onChange={handleChange(rightKey)}
                />
              </td>
              <td>
                <input
                  type="text"
                  className="patient-form__input"
                  value={nerveBlocks[leftKey]}
                  onChange={handleChange(leftKey)}
                />
              </td>
            </tr>
          ))}
          <tr>
            <td className="anesthesia-table__label">Other</td>
            <td colSpan={2}>
              <input
                type="text"
                className="patient-form__input"
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
