import React from 'react';
import { ScoreChoice } from '../constants/columnDefinitions';
import { hapticTap } from '../native/haptics';

interface ScoreChipsProps {
  /** Column name, for the group's accessible label ("Mobility score"). */
  name: string;
  choices: ScoreChoice[];
  /** Current cell value — its chip shows as pressed. */
  value: string;
  onPick: (value: string) => void;
  disabled?: boolean;
  /** Add a "–" chip that clears the value. */
  clearable?: boolean;
  /** Keep focus where it is (the grid's cell editor) when a chip is
   *  pressed — otherwise the input blurs and the editor closes before
   *  the click lands. */
  keepFocus?: boolean;
  className?: string;
}

/** One-tap score buttons (M0–M3, F1–F3, …) for short-scale findings, so
 *  charting on a tablet doesn't need the on-screen keyboard. */
export function ScoreChips({ name, choices, value, onPick, disabled, clearable, keepFocus, className }: ScoreChipsProps) {
  const current = value.trim();
  const hold = keepFocus ? (e: React.MouseEvent) => e.preventDefault() : undefined;
  return (
    <div className={`score-chips${className ? ` ${className}` : ''}`} role="group" aria-label={`${name} score`}>
      {clearable && (
        <button
          type="button"
          className="score-chips__chip score-chips__chip--clear"
          disabled={disabled}
          onMouseDown={hold}
          onClick={() => { hapticTap(); onPick(''); }}
          aria-label={`Clear ${name}`}
          title={`Clear ${name}`}
        >
          –
        </button>
      )}
      {choices.map((c) => (
        <button
          key={c.value}
          type="button"
          className="score-chips__chip"
          disabled={disabled}
          aria-pressed={current === c.value}
          onMouseDown={hold}
          onClick={() => { hapticTap(); onPick(c.value); }}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}
