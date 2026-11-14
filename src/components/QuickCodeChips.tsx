import React from 'react';
import { useTranslation } from 'react-i18next';
import { codeDefinition } from '../constants/dentalCodes';
import { hapticTap } from '../native/haptics';

interface QuickCodeChipsProps {
  codes: string[];
  /** Chips shown as pressed. */
  isPressed: (code: string) => boolean;
  onPick: (code: string) => void;
  disabled?: boolean;
  className?: string;
}

/** One-tap buttons for the person's quick codes (Chart settings → Quick
 *  codes), e.g. T/SN for a supernumerary tooth. Each shows the code with
 *  its definition as the tooltip / spoken label. */
export function QuickCodeChips({ codes, isPressed, onPick, disabled, className }: QuickCodeChipsProps) {
  const { t } = useTranslation('chart');
  if (codes.length === 0) return null;
  return (
    <div className={`score-chips quick-code-chips${className ? ` ${className}` : ''}`} role="group" aria-label={t('quickCodes.group')}>
      {codes.map((code) => {
        const definition = codeDefinition(code);
        const named = definition !== code ? t('quickCodes.chipAria', { code, definition }) : code;
        return (
          <button
            key={code}
            type="button"
            className="score-chips__chip"
            disabled={disabled}
            aria-pressed={isPressed(code)}
            aria-label={named}
            title={named}
            onClick={() => { hapticTap(); onPick(code); }}
          >
            {code}
          </button>
        );
      })}
    </div>
  );
}
